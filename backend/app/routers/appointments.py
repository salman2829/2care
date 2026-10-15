from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Appointment, Doctor
from app.schemas import (
    AppointmentCreate, AppointmentResponse, AppointmentCancelResponse
)
from app.services.booking import book_appointment, cancel_appointment
from app.dependencies import AppointmentNotFoundError

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def _format_appointment(a: Appointment, doc: Optional[Doctor] = None) -> AppointmentResponse:
    doctor_name = doc.name if doc else (a.doctor.name if a.doctor else None)
    return AppointmentResponse(
        id=a.id,
        reference_id=a.reference_id,
        patient_name=a.patient_name,
        patient_phone=a.patient_phone,
        patient_email=a.patient_email,
        doctor_id=a.doctor_id,
        doctor_name=doctor_name,
        slot_id=a.slot_id,
        specialty=a.specialty,
        scheduled_at=a.scheduled_at,
        source=a.source,
        status=a.status,
        notes=a.notes,
        created_at=a.created_at,
        updated_at=a.updated_at
    )


@router.get("", response_model=List[AppointmentResponse])
def list_appointments(
    query: Optional[str] = Query(None, description="Search by patient, reference ID, or doctor"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    patient: Optional[str] = Query(None, description="Filter by patient name or phone"),
    db: Session = Depends(get_db)
):
    """Retrieve all appointments with associated care provider info."""
    stmt = select(Appointment).order_by(Appointment.created_at.desc())
    if status_filter:
        stmt = stmt.where(Appointment.status == status_filter)
    
    rows = db.execute(stmt).scalars().all()
    results = []
    for a in rows:
        if patient:
            p_clean = patient.strip().lower()
            if p_clean not in a.patient_name.lower() and p_clean not in a.patient_phone.lower():
                continue
        if query:
            q = query.lower()
            combined = f"{a.patient_name} {a.reference_id} {a.doctor.name if a.doctor else ''}".lower()
            if q not in combined:
                continue
        results.append(_format_appointment(a))
    return results


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    db: Session = Depends(get_db)
):
    """
    Book an appointment with atomic conditional slot claim and concurrency protection.
    Returns HTTP 409 Conflict if the slot was already claimed.
    """
    appointment = book_appointment(db=db, data=payload)
    return _format_appointment(appointment)


@router.get("/{appointment_id}", response_model=AppointmentResponse)
def get_appointment(
    appointment_id: str,
    db: Session = Depends(get_db)
):
    """Retrieve appointment details by ID or reference_id."""
    appointment = db.execute(
        select(Appointment).where(
            (Appointment.id == appointment_id) | (Appointment.reference_id == appointment_id)
        )
    ).scalar_one_or_none()

    if not appointment:
        raise AppointmentNotFoundError(f"Appointment '{appointment_id}' not found")

    return _format_appointment(appointment)


@router.post("/{appointment_id}/cancel", response_model=AppointmentCancelResponse)
def cancel_appointment_endpoint(
    appointment_id: str,
    db: Session = Depends(get_db)
):
    """Atomically cancel an appointment and release its held/booked time slot."""
    appointment = cancel_appointment(db=db, appointment_id=appointment_id)
    return AppointmentCancelResponse(
        message=f"Appointment {appointment.reference_id} successfully cancelled and slot released.",
        appointment=_format_appointment(appointment)
    )
