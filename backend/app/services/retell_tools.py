import re
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func

from app.models import Doctor, DoctorSlot, Appointment, CallLog, generate_uuid, utc_now
from app.schemas import (
    SearchDoctorsInput, SearchDoctorsOutput, DoctorVoiceItem,
    CheckAvailabilityInput, CheckAvailabilityOutput, SlotVoiceItem,
    BookAppointmentVoiceInput, BookAppointmentVoiceOutput,
    GetAppointmentVoiceInput, GetAppointmentVoiceOutput,
    AppointmentCreate
)
from app.services.booking import book_appointment
from app.dependencies import SlotConflictError, SlotNotFoundError, DoctorNotFoundError, InvalidStateError

logger = logging.getLogger("2care-retell-service")

SPECIALTY_ALIASES = {
    "Cardiology": [
        "cardiology", "cardiologist", "cardio", "heart", "cardiac", "chest pain",
        "cardiovascular", "hypertension", "blood pressure", "heart attack", "angina"
    ],
    "Dermatology": [
        "dermatology", "dermatologist", "skin", "derm", "rash", "acne", "mole",
        "eczema", "hair", "nail", "dermatological"
    ],
    "General Medicine": [
        "general medicine", "general", "general practitioner", "gp", "primary care",
        "pcp", "family medicine", "checkup", "flu", "cough", "cold", "doctor",
        "physician", "routine", "annual", "wellness", "internal medicine"
    ],
    "Neurology": [
        "neurology", "neurologist", "neuro", "brain", "nerve", "headache", "migraine",
        "neurological", "seizure", "neuropathy"
    ],
    "Pediatrics": [
        "pediatrics", "pediatrician", "child", "children", "pediatric", "kid", "baby", "infant"
    ],
    "Orthopedics": [
        "orthopedics", "orthopedic", "orthopedist", "bone", "joint", "knee", "spine", "fracture"
    ]
}


def normalize_specialty(term: Optional[str]) -> Optional[str]:
    """Map natural spoken language terms (e.g. 'cardiologist', 'heart doctor') to canonical specialty."""
    if not term or not term.strip():
        return None
    raw = term.strip().lower()

    # Exact or substring match in alias map
    for canonical, synonyms in SPECIALTY_ALIASES.items():
        for syn in synonyms:
            if syn in raw or raw in syn:
                return canonical

    # Common medical suffix stemming
    clean = re.sub(r"(ologist|ology|iatrician|iatry|ics|ist)$", "", raw)
    if clean and len(clean) >= 4:
        for canonical in SPECIALTY_ALIASES:
            if clean in canonical.lower():
                return canonical

    return term.strip().title()


def mask_phone_number(phone: Optional[str]) -> Optional[str]:
    """Mask telephone number for HIPAA/privacy compliant audit logs (e.g. +1-***-2831)."""
    if not phone:
        return None
    clean = phone.strip()
    digits = re.sub(r"[^\d+]", "", clean)
    if digits.startswith("+1") and len(digits) >= 11:
        return f"+1-***-{digits[-4:]}"
    elif digits.startswith("+91") and len(digits) >= 12:
        return f"+91-***{digits[-4:]}"
    elif len(digits) >= 4:
        return f"***-***-{digits[-4:]}"
    if len(clean) <= 4:
        return "****"
    return clean


def search_doctors_service(
    specialty: Optional[str],
    db: Session
) -> SearchDoctorsOutput:
    """Find active doctors, filtered by medical specialty, synonym, or doctor name."""
    query = select(Doctor).where(Doctor.is_active.is_(True))
    norm_spec = normalize_specialty(specialty) if specialty else None

    if specialty and specialty.strip():
        raw_s = specialty.strip().lower()
        conditions = [
            func.lower(Doctor.specialty).contains(raw_s),
            func.lower(Doctor.name).contains(raw_s)
        ]
        if norm_spec:
            conditions.append(func.lower(Doctor.specialty).contains(norm_spec.lower()))
        query = query.where(or_(*conditions))

    doctors = db.execute(query.order_by(Doctor.name)).scalars().all()
    now = utc_now()

    items: List[DoctorVoiceItem] = []
    for doc in doctors:
        # Calculate future open slots
        open_count_stmt = select(func.count(DoctorSlot.id)).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        )
        open_slots = db.execute(open_count_stmt).scalar() or 0

        # Next available slot
        next_slot_stmt = select(DoctorSlot.start_time).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        )
        # Exclude slots with active non-cancelled appointments if any
        next_slot_stmt = next_slot_stmt.order_by(DoctorSlot.start_time.asc()).limit(1)
        next_dt = db.execute(next_slot_stmt).scalar()

        next_str = None
        if next_dt:
            next_str = next_dt.strftime("%A, %b %d at %I:%M %p")

        items.append(
            DoctorVoiceItem(
                id=doc.id,
                name=doc.name,
                specialty=doc.specialty,
                next_available_slot=next_str,
                open_slots_count=open_slots
            )
        )

    if not items:
        spec_text = f" in {norm_spec or specialty}" if specialty else ""
        msg = f"I'm sorry, I could not find any active care providers{spec_text}. We have available specialists in Cardiology, Dermatology, and General Medicine. Which of those would you like to schedule?"
        return SearchDoctorsOutput(success=False, doctors=[], message=msg)

    # Conversational speech string for Retell
    if len(items) == 1:
        d = items[0]
        slot_text = f"Earliest opening is {d.next_available_slot}." if d.next_available_slot else "They have multiple openings this week."
        msg = f"I found {d.name}, our specialist in {d.specialty}. {slot_text} Would you like to check available times?"
    else:
        names = ", ".join([f"{d.name} ({d.specialty})" for d in items[:3]])
        msg = f"I found matching specialists: {names}. Who would you prefer to see, or should I find the earliest available appointment?"

    return SearchDoctorsOutput(success=True, doctors=items, message=msg)


def check_availability_service(
    doctor_id: Optional[str],
    specialty: Optional[str],
    date_str: Optional[str],
    db: Session
) -> CheckAvailabilityOutput:
    """Retrieve verified open slots for a doctor, specialty, or date."""
    now = utc_now()
    conditions = [
        DoctorSlot.is_booked.is_(False),
        DoctorSlot.start_time >= now,
        Doctor.is_active.is_(True)
    ]

    query = select(DoctorSlot, Doctor).join(Doctor, DoctorSlot.doctor_id == Doctor.id)

    # Handle doctor_id (which could be an ID, name, or accidentally a specialty)
    if doctor_id and doctor_id.strip():
        did = doctor_id.strip().lower()
        norm_did_spec = normalize_specialty(did)
        doc_conds = [
            DoctorSlot.doctor_id == doctor_id.strip(),
            func.lower(Doctor.name).contains(did),
            func.lower(Doctor.id).contains(did),
            func.lower(Doctor.specialty).contains(did)
        ]
        if norm_did_spec:
            doc_conds.append(func.lower(Doctor.specialty).contains(norm_did_spec.lower()))
        conditions.append(or_(*doc_conds))

    # Handle specialty with normalization
    if specialty and specialty.strip():
        raw_s = specialty.strip().lower()
        norm_s = normalize_specialty(raw_s)
        spec_conds = [
            func.lower(Doctor.specialty).contains(raw_s),
            func.lower(Doctor.name).contains(raw_s)
        ]
        if norm_s:
            spec_conds.append(func.lower(Doctor.specialty).contains(norm_s.lower()))
        conditions.append(or_(*spec_conds))

    target_date = None
    if date_str and isinstance(date_str, str):
        clean_date = date_str.strip().lower()
        if "tomorrow" in clean_date:
            target_date = (now + timedelta(days=1)).date()
        elif "today" in clean_date:
            target_date = now.date()
        else:
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y"):
                try:
                    target_date = datetime.strptime(clean_date[:10], fmt).date()
                    break
                except ValueError:
                    continue
            if not target_date:
                days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                for i, dname in enumerate(days_of_week):
                    if dname in clean_date:
                        diff = (i - now.weekday()) % 7
                        if diff == 0:
                            diff = 7
                        target_date = (now + timedelta(days=diff)).date()
                        break

    if target_date:
        conditions.append(func.date(DoctorSlot.start_time) == str(target_date))

    query = query.where(and_(*conditions)).order_by(DoctorSlot.start_time.asc()).limit(8)
    rows = db.execute(query).all()

    # If user asked for a date with 0 slots, seamlessly find earliest upcoming openings
    fallback_used = False
    if not rows and target_date:
        fallback_conds = [
            DoctorSlot.is_booked.is_(False),
            DoctorSlot.start_time >= now
        ]
        if doctor_id and doctor_id.strip():
            did = doctor_id.strip()
            fallback_conds.append(
                or_(
                    DoctorSlot.doctor_id == did,
                    func.lower(Doctor.name).contains(did.lower()),
                    func.lower(Doctor.id).contains(did.lower())
                )
            )
        if specialty and specialty.strip():
            fallback_conds.append(func.lower(Doctor.specialty).contains(specialty.strip().lower()))

        fallback_query = select(DoctorSlot, Doctor).join(Doctor, DoctorSlot.doctor_id == Doctor.id).where(and_(*fallback_conds)).order_by(DoctorSlot.start_time.asc()).limit(8)
        rows = db.execute(fallback_query).all()
        fallback_used = True

    slots: List[SlotVoiceItem] = []
    for slot, doc in rows:
        slots.append(
            SlotVoiceItem(
                slot_id=slot.id,
                doctor_id=doc.id,
                doctor_name=doc.name,
                specialty=doc.specialty,
                date=slot.start_time.strftime("%A, %B %d"),
                time=slot.start_time.strftime("%I:%M %p"),
                start_time_iso=slot.start_time.isoformat()
            )
        )

    if not slots:
        msg = "I checked our schedule, but there are no open slots matching those exact preferences. Would you like me to check the next available day or look with another specialist?"
        return CheckAvailabilityOutput(success=False, slots=[], message=msg)

    # Build concise voice readback
    slot_options = [f"{s.date} at {s.time}" for s in slots[:3]]
    if fallback_used and target_date:
        msg = f"I don't have slots open specifically for that date, but {slots[0].doctor_name} has upcoming openings: {', or '.join(slot_options)}. Would one of those work for you?"
    else:
        msg = f"I have {len(slots)} openings available with {slots[0].doctor_name}. The earliest options are: {', or '.join(slot_options)}. Which time works best for you?"

    return CheckAvailabilityOutput(success=True, slots=slots, message=msg)


def book_appointment_voice_service(
    data: BookAppointmentVoiceInput,
    db: Session
) -> BookAppointmentVoiceOutput:
    """
    Handle voice appointment booking with validation, slot verification,
    concurrency conflict mitigation, and explicit confirmation enforcement.
    """
    # 0. Sanitize patient name and phone number
    if data.patient_name:
        clean_name = re.sub(r"^(my name is|i am|this is|it's|it is)\s+", "", data.patient_name.strip(), flags=re.IGNORECASE).strip()
        if clean_name:
            data.patient_name = clean_name.title()

    if data.patient_phone:
        raw_digits = re.sub(r"\D", "", data.patient_phone)
        if len(raw_digits) == 10:
            data.patient_phone = f"+1-{raw_digits[:3]}-{raw_digits[3:6]}-{raw_digits[6:]}"
        elif len(raw_digits) == 11 and raw_digits.startswith("1"):
            data.patient_phone = f"+1-{raw_digits[1:4]}-{raw_digits[4:7]}-{raw_digits[7:]}"

    # Resolve doctor by ID, Name, or Specialty
    doctor = db.get(Doctor, data.doctor_id)
    if not doctor and data.doctor_id:
        did = data.doctor_id.strip().lower()
        norm_spec = normalize_specialty(did)
        doc_conds = [
            func.lower(Doctor.name).contains(did),
            func.lower(Doctor.id).contains(did),
            func.lower(Doctor.specialty).contains(did)
        ]
        if norm_spec:
            doc_conds.append(func.lower(Doctor.specialty).contains(norm_spec.lower()))
        doctor = db.execute(select(Doctor).where(or_(*doc_conds)).where(Doctor.is_active.is_(True))).scalars().first()
        if doctor:
            data.doctor_id = doctor.id

    if not doctor and data.specialty:
        norm_s = normalize_specialty(data.specialty)
        doc_conds = [
            func.lower(Doctor.specialty).contains(data.specialty.strip().lower())
        ]
        if norm_s:
            doc_conds.append(func.lower(Doctor.specialty).contains(norm_s.lower()))
        doctor = db.execute(select(Doctor).where(or_(*doc_conds)).where(Doctor.is_active.is_(True))).scalars().first()
        if doctor:
            data.doctor_id = doctor.id

    # Resolve slot by ID or fallback only if slot was not found / generic placeholder
    slot = db.get(DoctorSlot, data.slot_id) if data.slot_id else None
    if not slot and doctor and (not data.slot_id or data.slot_id.lower() in ("earliest", "any", "first", "open", "slot_1")):
        slot = db.execute(
            select(DoctorSlot)
            .where(and_(DoctorSlot.doctor_id == doctor.id, DoctorSlot.is_booked.is_(False), DoctorSlot.start_time >= utc_now()))
            .order_by(DoctorSlot.start_time.asc())
        ).scalars().first()
        if slot:
            data.slot_id = slot.id

    # 1. Enforce explicit patient confirmation
    if not data.patient_confirmed:
        doc_name = doctor.name if doctor else "the doctor"
        time_str = slot.start_time.strftime("%A, %B %d at %I:%M %p") if slot else "the selected time"
        
        return BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doc_name,
            specialty=data.specialty or (doctor.specialty if doctor else "Specialist"),
            appointment_time=time_str,
            status="Unconfirmed",
            spoken_summary=f"Before I finalize this, could you please confirm: would you like me to book your consultation with {doc_name} for {time_str} under the name {data.patient_name}?",
            message="Explicit patient verbal confirmation is required before committing the reservation."
        )

    # 2. Attempt transactional booking
    try:
        payload = AppointmentCreate(
            patient_name=data.patient_name,
            patient_phone=data.patient_phone,
            doctor_id=data.doctor_id,
            slot_id=data.slot_id,
            specialty=data.specialty,
            source="AI Voice",
            notes=data.notes
        )
        appointment = book_appointment(db, payload)
        
        dt_str = appointment.scheduled_at.strftime("%A, %B %d at %I:%M %p")
        doc_name = appointment.doctor.name if appointment.doctor else "Doctor"

        spoken = (
            f"You are all set, {appointment.patient_name}! Your appointment with {doc_name} is confirmed for "
            f"{dt_str}. Your confirmation reference number is {appointment.reference_id}. We look forward to seeing you!"
        )

        return BookAppointmentVoiceOutput(
            success=True,
            reference_id=appointment.reference_id,
            patient_name=appointment.patient_name,
            doctor_name=doc_name,
            specialty=appointment.specialty,
            appointment_time=dt_str,
            status="Confirmed",
            spoken_summary=spoken,
            message="Appointment successfully booked and slot claimed."
        )

    except SlotConflictError:
        # Graceful voice fallback
        return BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name="Requested Provider",
            specialty=data.specialty or "General",
            appointment_time="Unavailable",
            status="Conflict",
            spoken_summary="I apologize, but that specific slot was just booked by another patient a moment ago. Let me check the schedule right now for the next earliest opening for you.",
            message="Requested slot is already booked. Concurrency lock triggered."
        )
    except (DoctorNotFoundError, SlotNotFoundError, InvalidStateError) as e:
        return BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name="Unknown",
            specialty="General",
            appointment_time="Unknown",
            status="Failed",
            spoken_summary=f"I encountered an issue verifying the provider schedule: {e.detail}. Let me connect you with an available care team member.",
            message=str(e.detail)
        )


def get_appointment_voice_service(
    reference_id: str,
    db: Session
) -> GetAppointmentVoiceOutput:
    """Retrieve booking by reference ID for voice inquiries."""
    clean_ref = reference_id.strip().upper()
    appointment = db.execute(
        select(Appointment).where(func.upper(Appointment.reference_id) == clean_ref)
    ).scalar_one_or_none()

    if not appointment:
        return GetAppointmentVoiceOutput(
            found=False,
            spoken_summary=f"I couldn't find an appointment with reference code {reference_id}. Could you please check the reference number on your confirmation notice?"
        )

    doc_name = appointment.doctor.name if appointment.doctor else "your care provider"
    dt_str = appointment.scheduled_at.strftime("%A, %B %d at %I:%M %p")

    spoken = (
        f"I found your record for reference {appointment.reference_id}. "
        f"Patient {appointment.patient_name} is scheduled with {doc_name} for {appointment.specialty} "
        f"on {dt_str}. The current booking status is {appointment.status}."
    )

    return GetAppointmentVoiceOutput(
        found=True,
        reference_id=appointment.reference_id,
        patient_name=appointment.patient_name,
        doctor_name=doc_name,
        specialty=appointment.specialty,
        appointment_time=dt_str,
        status=appointment.status,
        spoken_summary=spoken
    )


def record_call_log(
    call_id: str,
    caller_phone: Optional[str],
    agent_id: Optional[str],
    direction: str,
    duration_seconds: int,
    status: str,
    transcript: Optional[str],
    tool_calls: Optional[List[Dict[str, Any]]],
    appointment_id: Optional[str],
    db: Session
) -> CallLog:
    """Record or update a voice call log with masked phone number and tool execution history."""
    existing = db.execute(select(CallLog).where(CallLog.call_id == call_id)).scalar_one_or_none()

    masked_phone = mask_phone_number(caller_phone)
    tools_json = json.dumps(tool_calls) if tool_calls else None

    if existing:
        existing.duration_seconds = duration_seconds
        existing.status = status
        if transcript:
            existing.transcript = transcript
        if tools_json:
            existing.tool_calls_log = tools_json
        if appointment_id:
            existing.appointment_id = appointment_id
        db.commit()
        db.refresh(existing)
        return existing

    log = CallLog(
        id=generate_uuid(),
        call_id=call_id,
        caller_phone=masked_phone,
        agent_id=agent_id,
        direction=direction,
        duration_seconds=duration_seconds,
        status=status,
        transcript=transcript,
        tool_calls_log=tools_json,
        appointment_id=appointment_id,
        created_at=utc_now()
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
