import random
from sqlalchemy.orm import Session
from sqlalchemy import update, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Appointment, Doctor, DoctorSlot, AppointmentStatus, generate_uuid, utc_now
)
from app.schemas import AppointmentCreate
from app.dependencies import (
    SlotConflictError, SlotNotFoundError, DoctorNotFoundError,
    AppointmentNotFoundError, InvalidStateError
)


def generate_reference_id(db: Session) -> str:
    """Generate a unique 2care reference ID (e.g., 2C-10482)."""
    for _ in range(10):
        ref = f"2C-{random.randint(10000, 99999)}"
        existing = db.execute(select(Appointment.id).where(Appointment.reference_id == ref)).scalar()
        if not existing:
            return ref
    return f"2C-{int(utc_now().timestamp())}"


def book_appointment(db: Session, data: AppointmentCreate) -> Appointment:
    """
    Atomic conditional slot claim and appointment creation.
    Guarantees concurrency safety using atomic row update and unique slot constraint.
    """
    # 1. Verify doctor exists and is active
    doctor = db.get(Doctor, data.doctor_id)
    if not doctor:
        raise DoctorNotFoundError(f"Doctor with ID '{data.doctor_id}' does not exist")
    if not doctor.is_active:
        raise InvalidStateError(f"Doctor '{doctor.name}' is currently inactive")

    # 2. Verify slot exists and matches doctor
    slot = db.get(DoctorSlot, data.slot_id)
    if not slot:
        raise SlotNotFoundError(f"Slot with ID '{data.slot_id}' does not exist")
    if slot.doctor_id != data.doctor_id:
        raise InvalidStateError(f"Slot '{data.slot_id}' does not belong to Doctor '{doctor.name}'")

    # 3. Atomic conditional claim: update only if is_booked is False
    try:
        claim_stmt = (
            update(DoctorSlot)
            .where(DoctorSlot.id == data.slot_id, DoctorSlot.is_booked.is_(False))
            .values(is_booked=True, is_held=False)
        )
        result = db.execute(claim_stmt)
        if result.rowcount == 0:
            # Another transaction claimed this slot
            raise SlotConflictError(f"Slot '{data.slot_id}' is already booked or no longer available")

        # 4. Create authoritative appointment with server-assigned status
        ref_id = generate_reference_id(db)
        appointment = Appointment(
            id=generate_uuid(),
            reference_id=ref_id,
            patient_name=data.patient_name,
            patient_phone=data.patient_phone,
            patient_email=data.patient_email,
            doctor_id=data.doctor_id,
            slot_id=data.slot_id,
            specialty=data.specialty or doctor.specialty,
            scheduled_at=slot.start_time,
            source=data.source,
            status=AppointmentStatus.CONFIRMED.value,
            notes=data.notes,
        )
        db.add(appointment)
        db.commit()
        db.refresh(appointment)
        return appointment

    except IntegrityError:
        db.rollback()
        raise SlotConflictError(f"Slot '{data.slot_id}' was claimed by a concurrent booking")
    except Exception:
        db.rollback()
        raise


def cancel_appointment(db: Session, appointment_id: str) -> Appointment:
    """
    Cancel appointment and release slot atomically.
    """
    try:
        # Check by id or reference_id
        appointment = db.execute(
            select(Appointment).where(
                (Appointment.id == appointment_id) | (Appointment.reference_id == appointment_id)
            )
        ).scalar_one_or_none()

        if not appointment:
            raise AppointmentNotFoundError(f"Appointment '{appointment_id}' not found")

        if appointment.status == AppointmentStatus.CANCELLED.value:
            raise InvalidStateError(f"Appointment '{appointment.reference_id}' is already cancelled")

        # Mark cancelled
        appointment.status = AppointmentStatus.CANCELLED.value

        # Release slot atomically
        if appointment.slot_id:
            release_stmt = (
                update(DoctorSlot)
                .where(DoctorSlot.id == appointment.slot_id)
                .values(is_booked=False, is_held=False)
            )
            db.execute(release_stmt)

        db.commit()
        db.refresh(appointment)
        return appointment
    except Exception:
        db.rollback()
        raise
