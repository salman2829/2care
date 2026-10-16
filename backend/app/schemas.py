from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator
import re


class DoctorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    initials: str = Field(..., min_length=1, max_length=10)
    specialty: str = Field(..., min_length=2, max_length=100)
    color: str = Field(default="cyan", max_length=30)
    is_active: bool = Field(default=True)


class DoctorResponse(DoctorBase):
    id: str
    created_at: datetime
    slots_count: int = 0
    next_slot: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SlotResponse(BaseModel):
    id: str
    doctor_id: str
    doctor_name: Optional[str] = None
    doctor_initials: Optional[str] = None
    specialty: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_booked: bool
    is_held: bool

    model_config = ConfigDict(from_attributes=True)


class AvailabilityQuery(BaseModel):
    doctor_id: Optional[str] = None
    specialty: Optional[str] = None
    date: Optional[str] = None  # YYYY-MM-DD
    only_open: bool = True


class AppointmentCreate(BaseModel):
    patient_name: str = Field(..., min_length=2, max_length=120, description="Full patient name")
    patient_phone: str = Field(..., min_length=7, max_length=25, description="Contact phone number")
    patient_email: Optional[str] = Field(None, max_length=120)
    doctor_id: str = Field(..., min_length=1, description="Assigned doctor ID")
    slot_id: str = Field(..., min_length=1, description="Authoritative slot ID to claim")
    specialty: Optional[str] = Field(None, max_length=100)
    source: str = Field(default="Portal", description="AI Voice, Portal, or Staff")
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("patient_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Patient name must have at least 2 characters")
        return clean

    @field_validator("patient_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"[^\d+]", "", v.strip())
        if len(clean) < 7:
            raise ValueError("Phone number must have at least 7 digits")
        return v.strip()

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        allowed = {"AI Voice", "Portal", "Staff"}
        if v not in allowed:
            return "Portal"
        return v


class AppointmentResponse(BaseModel):
    id: str
    reference_id: str
    patient_name: str
    patient_phone: str
    patient_email: Optional[str] = None
    doctor_id: str
    doctor_name: Optional[str] = None
    slot_id: str
    specialty: str
    scheduled_at: datetime
    source: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AppointmentCancelResponse(BaseModel):
    message: str
    appointment: AppointmentResponse


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    environment: str
    database: str
    demo_mode: bool
    version: str


# ==========================================
# ==========================================
# Retell AI Custom Function Schemas
# ==========================================

class CreateWebCallRequest(BaseModel):
    patient_name: Optional[str] = Field(None, description="Patient full name if authenticated/selected")
    patient_id: Optional[str] = Field(None, description="Patient medical record ID")
    patient_phone: Optional[str] = Field(None, description="Patient verified telephone number")
    selected_doctor_id: Optional[str] = Field(None, description="Pre-selected doctor ID from UI")
    selected_doctor_name: Optional[str] = Field(None, description="Pre-selected doctor name")
    selected_slot_id: Optional[str] = Field(None, description="Pre-selected slot ID")
    selected_date: Optional[str] = Field(None, description="Pre-selected appointment date (YYYY-MM-DD)")
    clinic_name: Optional[str] = Field("2care Clinical Command Center", description="Clinic or facility name")
    model_config = ConfigDict(extra="ignore")


class SearchDoctorsInput(BaseModel):
    specialty: Optional[str] = Field(None, description="Medical specialty such as Cardiology, Dermatology, General Medicine, Neurology")
    call_id: Optional[str] = Field(None, description="Active Retell call ID for conversation context linking")
    model_config = ConfigDict(extra="ignore")


class DoctorVoiceItem(BaseModel):
    id: str
    name: str
    specialty: str
    next_available_slot: Optional[str] = None
    open_slots_count: int


class SearchDoctorsOutput(BaseModel):
    success: bool
    doctors: List[DoctorVoiceItem]
    message: str


class CheckAvailabilityInput(BaseModel):
    doctor_id: Optional[str] = Field(None, description="Authoritative Doctor ID (e.g. doc_maya_chen). Required if querying a specific doctor.")
    specialty: Optional[str] = Field(None, description="Medical specialty to search available slots for")
    date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format (optional, defaults to upcoming slots)")
    call_id: Optional[str] = Field(None, description="Active Retell call ID for server state association")
    model_config = ConfigDict(extra="ignore")


class SlotVoiceItem(BaseModel):
    slot_id: str
    doctor_id: str
    doctor_name: str
    specialty: str
    date: str
    time: str
    start_time_iso: str


class CheckAvailabilityOutput(BaseModel):
    success: bool
    slots: List[SlotVoiceItem]
    message: str


class BookAppointmentVoiceInput(BaseModel):
    patient_name: Optional[str] = Field(None, max_length=120, description="Full patient name")
    patient_phone: Optional[str] = Field(None, max_length=25, description="Patient contact telephone number")
    doctor_id: Optional[str] = Field(None, description="Authoritative doctor ID (e.g. doc_maya_chen)")
    slot_id: Optional[str] = Field(None, description="Authoritative slot ID selected from check_availability")
    specialty: Optional[str] = Field(None, description="Medical specialty")
    patient_confirmed: bool = Field(True, description="Requires explicit verbal patient confirmation before booking")
    call_id: Optional[str] = Field(None, description="Active Retell call ID for conversation state and idempotency tracking")
    notes: Optional[str] = Field(None, max_length=500, description="Reason for visit or clinical notes")
    model_config = ConfigDict(extra="ignore")


class BookAppointmentVoiceOutput(BaseModel):
    success: bool
    reference_id: Optional[str] = None
    patient_name: str
    doctor_name: str
    specialty: str
    appointment_time: str
    status: str
    error_code: Optional[str] = None
    spoken_summary: str
    message: str


class GetAppointmentVoiceInput(BaseModel):
    reference_id: str = Field(..., min_length=3, description="Appointment reference ID (e.g. 2C-10482)")
    call_id: Optional[str] = Field(None, description="Active Retell call ID")
    model_config = ConfigDict(extra="ignore")


class GetAppointmentVoiceOutput(BaseModel):
    found: bool
    reference_id: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    specialty: Optional[str] = None
    appointment_time: Optional[str] = None
    status: Optional[str] = None
    spoken_summary: str


class CallLogResponse(BaseModel):
    id: str
    call_id: str
    caller_phone: Optional[str] = None
    agent_id: Optional[str] = None
    direction: str
    duration_seconds: int
    status: str
    transcript: Optional[str] = None
    tool_calls_log: Optional[str] = None
    dynamic_variables: Optional[str] = None
    context_audit: Optional[str] = None
    appointment_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CallContextAuditResponse(BaseModel):
    call_id: str
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    chosen_doctor_id: Optional[str] = None
    chosen_doctor_name: Optional[str] = None
    chosen_specialty: Optional[str] = None
    chosen_slot_id: Optional[str] = None
    booking_status: str
    booking_reference_id: Optional[str] = None
    dynamic_variables: Optional[dict] = None
    history: List[dict] = []
    tool_calls: List[dict] = []
    transcript: Optional[str] = None
    context_health: str  # "healthy" | "recovered" | "degraded"
    audit_notes: List[str] = []

