from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, func
from app.models import Doctor, DoctorSlot, utc_now
from app.schemas import DoctorResponse, SlotResponse


def get_doctors_with_stats(db: Session) -> List[DoctorResponse]:
    """Retrieve all doctors with calculated upcoming open slot counts and next available slot."""
    now = utc_now()
    doctors = db.execute(select(Doctor).order_by(Doctor.name)).scalars().all()
    results = []

    for doc in doctors:
        # Count future available slots
        open_slots_stmt = select(func.count(DoctorSlot.id)).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        )
        slots_count = db.execute(open_slots_stmt).scalar() or 0

        # Find earliest available slot
        next_slot_stmt = select(DoctorSlot.start_time).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        ).order_by(DoctorSlot.start_time.asc()).limit(1)
        next_time = db.execute(next_slot_stmt).scalar()

        next_slot_str = None
        if next_time:
            # Format nicely, e.g. "Today, 2:30 PM" or "Jun 18, 09:30 AM"
            if next_time.date() == now.date():
                next_slot_str = f"Today, {next_time.strftime('%I:%M %p')}"
            else:
                next_slot_str = next_time.strftime("%b %d, %I:%M %p")

        results.append(
            DoctorResponse(
                id=doc.id,
                name=doc.name,
                initials=doc.initials,
                specialty=doc.specialty,
                color=doc.color,
                is_active=doc.is_active,
                created_at=doc.created_at,
                slots_count=slots_count,
                next_slot=next_slot_str
            )
        )
    return results


def get_available_slots(
    db: Session,
    doctor_id: Optional[str] = None,
    specialty: Optional[str] = None,
    date_str: Optional[str] = None,
    only_open: bool = True
) -> List[SlotResponse]:
    """Query doctor slots from database with optional filters."""
    query = select(DoctorSlot, Doctor).join(Doctor, DoctorSlot.doctor_id == Doctor.id)
    conditions = []

    if only_open:
        conditions.append(DoctorSlot.is_booked.is_(False))

    if doctor_id:
        conditions.append(DoctorSlot.doctor_id == doctor_id)

    if specialty:
        conditions.append(func.lower(Doctor.specialty) == specialty.lower())

    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            # SQLite and PostgreSQL date comparison
            conditions.append(func.date(DoctorSlot.start_time) == str(target_date))
        except ValueError:
            pass

    if conditions:
        query = query.where(and_(*conditions))

    query = query.order_by(DoctorSlot.start_time.asc())
    rows = db.execute(query).all()

    results = []
    for slot, doc in rows:
        results.append(
            SlotResponse(
                id=slot.id,
                doctor_id=doc.id,
                doctor_name=doc.name,
                doctor_initials=doc.initials,
                specialty=doc.specialty,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_booked=slot.is_booked,
                is_held=slot.is_held
            )
        )
    return results
