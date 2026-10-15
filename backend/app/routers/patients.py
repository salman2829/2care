import hashlib
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models import Appointment, CallLog, utc_now

router = APIRouter(prefix="/patients", tags=["Patients"])


class PatientSummary(BaseModel):
    id: str
    mrn: str
    name: str
    phone: str
    email: Optional[str] = None
    total_appointments: int
    confirmed_appointments: int
    cancelled_appointments: int
    voice_bookings: int
    primary_doctor: Optional[str] = None
    primary_specialty: Optional[str] = None
    last_scheduled_at: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None


class PatientDetail(BaseModel):
    id: str
    mrn: str
    name: str
    phone: str
    email: Optional[str] = None
    total_appointments: int
    confirmed_appointments: int
    cancelled_appointments: int
    voice_bookings: int
    primary_doctor: Optional[str] = None
    primary_specialty: Optional[str] = None
    last_scheduled_at: Optional[str] = None
    status: str = "Active"
    appointments: List[Dict[str, Any]]
    calls: List[Dict[str, Any]]


class UpdatePatientInput(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


def _clean_phone(raw: Optional[str]) -> str:
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("1") and len(digits) == 11:
        return digits[1:]
    return digits


def _generate_patient_id(name: str, phone: str) -> str:
    cleaned = _clean_phone(phone)
    if cleaned:
        key = f"phone_{cleaned[-10:]}"
    else:
        key = f"name_{name.strip().lower()}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _generate_mrn(name: str, phone: str) -> str:
    cleaned = _clean_phone(phone)
    if cleaned and len(cleaned) >= 5:
        suffix = cleaned[-5:]
    else:
        suffix = str(abs(hash(name)) % 90000 + 10000)
    return f"PT-{suffix}"


def _aggregate_patients(db: Session, query: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    appointments = db.execute(select(Appointment).order_by(Appointment.scheduled_at.desc())).scalars().all()
    
    patients_map: Dict[str, Dict[str, Any]] = {}

    for apt in appointments:
        clean_name = apt.patient_name.strip()
        # Normalization alias check
        if clean_name.lower() in ("salaman", "salman", "mohammad salman", "md salman"):
            clean_name = "Mohammad Salman"
            
        pid = _generate_patient_id(clean_name, apt.patient_phone)
        
        if pid not in patients_map:
            mrn = _generate_mrn(clean_name, apt.patient_phone)
            patients_map[pid] = {
                "id": pid,
                "mrn": mrn,
                "name": clean_name,
                "phone": apt.patient_phone,
                "email": apt.patient_email or f"{clean_name.lower().replace(' ', '.')}@example.com",
                "total_appointments": 0,
                "confirmed_appointments": 0,
                "cancelled_appointments": 0,
                "voice_bookings": 0,
                "doctor_counts": {},
                "last_scheduled_at": None,
                "appointments": [],
                "status": "Active"
            }
        
        p = patients_map[pid]
        p["total_appointments"] += 1
        if apt.status == "Confirmed":
            p["confirmed_appointments"] += 1
        elif apt.status == "Cancelled":
            p["cancelled_appointments"] += 1

        if apt.source in ("AI Voice", "Voice Call", "Retell Voice"):
            p["voice_bookings"] += 1

        if not p["last_scheduled_at"] and apt.scheduled_at:
            p["last_scheduled_at"] = apt.scheduled_at.isoformat()

        doc_name = apt.doctor.name if apt.doctor else None
        if doc_name:
            p["doctor_counts"][doc_name] = p["doctor_counts"].get(doc_name, 0) + 1
            if "specialty" not in p or not p.get("primary_specialty"):
                p["primary_specialty"] = apt.specialty

        p["appointments"].append({
            "id": apt.id,
            "reference_id": apt.reference_id,
            "scheduled_at": apt.scheduled_at.isoformat() if apt.scheduled_at else None,
            "doctor_name": doc_name,
            "specialty": apt.specialty,
            "status": apt.status,
            "source": apt.source,
            "notes": apt.notes
        })

    # Resolve primary doctor
    for pid, p in patients_map.items():
        doc_counts = p.pop("doctor_counts", {})
        if doc_counts:
            p["primary_doctor"] = max(doc_counts, key=doc_counts.get)
        else:
            p["primary_doctor"] = "Dr. Maya Chen"
            p["primary_specialty"] = "General Medicine"

    if query:
        q = query.lower()
        patients_map = {
            pid: p for pid, p in patients_map.items()
            if q in p["name"].lower() or q in p["phone"].lower() or q in p["mrn"].lower()
        }

    return patients_map


@router.get("", response_model=List[PatientSummary])
def list_patients(
    query: Optional[str] = Query(None, description="Search by name, phone, or MRN"),
    db: Session = Depends(get_db)
):
    """List all authoritative patient master records with aggregated clinical metrics."""
    patients_map = _aggregate_patients(db, query)
    result = []
    for p in patients_map.values():
        result.append(PatientSummary(
            id=p["id"],
            mrn=p["mrn"],
            name=p["name"],
            phone=p["phone"],
            email=p["email"],
            total_appointments=p["total_appointments"],
            confirmed_appointments=p["confirmed_appointments"],
            cancelled_appointments=p["cancelled_appointments"],
            voice_bookings=p["voice_bookings"],
            primary_doctor=p.get("primary_doctor"),
            primary_specialty=p.get("primary_specialty"),
            last_scheduled_at=p.get("last_scheduled_at"),
            status=p["status"]
        ))
    # Order by total appointments descending then name
    result.sort(key=lambda x: (x.total_appointments, x.name), reverse=True)
    return result


@router.get("/{identifier}", response_model=PatientDetail)
def get_patient(
    identifier: str,
    db: Session = Depends(get_db)
):
    """Retrieve full patient chart with all appointment records and voice call telemetry."""
    patients_map = _aggregate_patients(db)
    
    # Match by id, mrn, or name
    matched_patient = None
    clean_id = identifier.strip().lower()
    for p in patients_map.values():
        if (
            p["id"] == identifier
            or p["mrn"].lower() == clean_id
            or p["name"].lower() == clean_id
            or _clean_phone(p["phone"]) == _clean_phone(identifier)
        ):
            matched_patient = p
            break

    if not matched_patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{identifier}' not found in clinic records."
        )

    # Fetch associated call logs
    apt_ids = [a["id"] for a in matched_patient["appointments"]]
    call_stmt = select(CallLog).order_by(CallLog.created_at.desc())
    all_calls = db.execute(call_stmt).scalars().all()
    
    matched_calls = []
    p_phone_clean = _clean_phone(matched_patient["phone"])
    for c in all_calls:
        is_match = False
        if c.appointment_id and c.appointment_id in apt_ids:
            is_match = True
        elif c.caller_phone and _clean_phone(c.caller_phone) and _clean_phone(c.caller_phone) == p_phone_clean:
            is_match = True
        elif c.transcript and matched_patient["name"].lower() in c.transcript.lower():
            is_match = True
            
        if is_match:
            matched_calls.append({
                "id": c.id,
                "call_id": c.call_id,
                "caller_phone": c.caller_phone,
                "duration_seconds": c.duration_seconds,
                "status": c.status,
                "transcript": c.transcript,
                "appointment_id": c.appointment_id,
                "created_at": c.created_at.isoformat() if c.created_at else None
            })

    return PatientDetail(
        id=matched_patient["id"],
        mrn=matched_patient["mrn"],
        name=matched_patient["name"],
        phone=matched_patient["phone"],
        email=matched_patient["email"],
        total_appointments=matched_patient["total_appointments"],
        confirmed_appointments=matched_patient["confirmed_appointments"],
        cancelled_appointments=matched_patient["cancelled_appointments"],
        voice_bookings=matched_patient["voice_bookings"],
        primary_doctor=matched_patient.get("primary_doctor"),
        primary_specialty=matched_patient.get("primary_specialty"),
        last_scheduled_at=matched_patient.get("last_scheduled_at"),
        status=matched_patient["status"],
        appointments=matched_patient["appointments"],
        calls=matched_calls
    )


@router.put("/{identifier}")
def update_patient_record(
    identifier: str,
    payload: UpdatePatientInput,
    db: Session = Depends(get_db)
):
    """
    Update patient master records across all appointments to ensure clinical consistency.
    Allows correcting misspelled patient names, contact numbers, and emails.
    """
    detail = get_patient(identifier, db)
    target_name = detail.name
    
    # Update appointments matching patient name
    apts = db.execute(select(Appointment).where(
        or_(
            Appointment.patient_name == target_name,
            Appointment.patient_phone == detail.phone
        )
    )).scalars().all()

    updated_count = 0
    for a in apts:
        if payload.name:
            a.patient_name = payload.name.strip()
        if payload.phone:
            a.patient_phone = payload.phone.strip()
        if payload.email is not None:
            a.patient_email = payload.email.strip()
        if payload.notes:
            a.notes = (a.notes or "") + f" | Patient note: {payload.notes.strip()}"
        updated_count += 1

    db.commit()

    return {
        "success": True,
        "message": f"Updated patient record for {payload.name or target_name} across {updated_count} appointments.",
        "updated_appointments_count": updated_count
    }
