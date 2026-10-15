from fastapi import HTTPException, status
from app.database import get_db

class SlotConflictError(HTTPException):
    def __init__(self, detail: str = "Requested appointment slot is already booked or unavailable"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class SlotNotFoundError(HTTPException):
    def __init__(self, detail: str = "Appointment slot not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class DoctorNotFoundError(HTTPException):
    def __init__(self, detail: str = "Doctor not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class AppointmentNotFoundError(HTTPException):
    def __init__(self, detail: str = "Appointment not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class InvalidStateError(HTTPException):
    def __init__(self, detail: str = "Invalid operation for appointment state"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
