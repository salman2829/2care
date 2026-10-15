from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import SlotResponse
from app.services.availability import get_available_slots

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get("", response_model=List[SlotResponse])
def get_availability(
    doctor_id: Optional[str] = Query(None, description="Filter slots by doctor ID"),
    specialty: Optional[str] = Query(None, description="Filter slots by specialty"),
    date: Optional[str] = Query(None, description="Filter by date in YYYY-MM-DD format"),
    only_open: bool = Query(True, description="Only return non-booked slots"),
    db: Session = Depends(get_db)
):
    """Query available doctor appointment slots from PostgreSQL database."""
    return get_available_slots(
        db=db,
        doctor_id=doctor_id,
        specialty=specialty,
        date_str=date,
        only_open=only_open
    )
