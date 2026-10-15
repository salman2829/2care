from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import DoctorResponse
from app.services.availability import get_doctors_with_stats

router = APIRouter(prefix="/doctors", tags=["Doctors"])


@router.get("", response_model=List[DoctorResponse])
def list_doctors(db: Session = Depends(get_db)):
    """List all care providers with calculated open slot counts and next availability."""
    return get_doctors_with_stats(db)
