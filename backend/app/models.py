import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


def utc_now() -> datetime:
    """Return current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def generate_uuid() -> str:
    return str(uuid.uuid4())


class AppointmentStatus(str, enum.Enum):
    CONFIRMED = "Confirmed"
    PENDING = "Pending"
    CANCELLED = "Cancelled"
    FAILED = "Failed"


class AppointmentSource(str, enum.Enum):
    AI_VOICE = "AI Voice"
    PORTAL = "Portal"
    STAFF = "Staff"


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(120), nullable=False, index=True)
    initials = Column(String(10), nullable=False)
    specialty = Column(String(100), nullable=False, index=True)
    color = Column(String(30), nullable=False, default="cyan")
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    slots = relationship("DoctorSlot", back_populates="doctor", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="doctor")


class DoctorSlot(Base):
    __tablename__ = "doctor_slots"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    doctor_id = Column(String(64), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=False)
    is_booked = Column(Boolean, nullable=False, default=False, index=True)
    is_held = Column(Boolean, nullable=False, default=False)
    held_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        UniqueConstraint("doctor_id", "start_time", name="uq_doctor_slot_time"),
        Index("idx_slot_doctor_avail", "doctor_id", "is_booked", "start_time"),
    )

    doctor = relationship("Doctor", back_populates="slots")
    appointment = relationship("Appointment", back_populates="slot", uselist=False)


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    reference_id = Column(String(32), unique=True, nullable=False, index=True)
    patient_name = Column(String(120), nullable=False, index=True)
    patient_phone = Column(String(32), nullable=False)
    patient_email = Column(String(120), nullable=True)
    doctor_id = Column(String(64), ForeignKey("doctors.id"), nullable=False, index=True)
    slot_id = Column(String(64), ForeignKey("doctor_slots.id"), unique=False, nullable=False, index=True)
    specialty = Column(String(100), nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=False, index=True)
    source = Column(String(32), nullable=False, default="Portal")
    status = Column(String(32), nullable=False, default=AppointmentStatus.CONFIRMED.value, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    doctor = relationship("Doctor", back_populates="appointments")
    slot = relationship("DoctorSlot", back_populates="appointment")
    call_logs = relationship("CallLog", back_populates="appointment")


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    call_id = Column(String(64), unique=True, nullable=False, index=True)
    caller_phone = Column(String(32), nullable=True)
    agent_id = Column(String(64), nullable=True)
    direction = Column(String(16), nullable=False, default="inbound")
    duration_seconds = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="completed", index=True)
    transcript = Column(Text, nullable=True)
    tool_calls_log = Column(Text, nullable=True)  # JSON formatted execution records
    appointment_id = Column(String(64), ForeignKey("appointments.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    appointment = relationship("Appointment", back_populates="call_logs")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    scenario_name = Column(String(120), nullable=False)
    overall_score = Column(Float, nullable=False)
    tool_accuracy = Column(Float, nullable=False)
    conversation_quality = Column(Float, nullable=False)
    policy_adherence = Column(Float, nullable=False)
    passed = Column(Boolean, nullable=False, default=True)
    details_json = Column(Text, nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
