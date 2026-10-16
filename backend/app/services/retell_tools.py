import re
import json
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func

from app.models import Doctor, DoctorSlot, Appointment, CallLog, CallState, generate_uuid, utc_now
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


# ==========================================
# Server Conversation State Management
# ==========================================

def get_or_create_call_state(
    call_id: str,
    db: Session,
    initial_vars: Optional[Dict[str, Any]] = None
) -> CallState:
    """
    Retrieve or initialize authoritative server-side conversation state keyed by call_id.
    Ensures known facts (patient, doctor, slot, dynamic variables) are preserved across turns.
    """
    state = db.execute(select(CallState).where(CallState.call_id == call_id)).scalar_one_or_none()
    now_iso = utc_now().isoformat()

    if not state:
        p_name = None
        p_id = None
        p_phone = None
        doc_id = None
        doc_name = None
        slot_id = None
        dyn_json = None

        if initial_vars:
            p_name = initial_vars.get("patient_name")
            p_id = initial_vars.get("patient_id")
            p_phone = initial_vars.get("patient_phone")
            doc_id = initial_vars.get("selected_doctor_id") or initial_vars.get("doctor_id")
            doc_name = initial_vars.get("selected_doctor_name") or initial_vars.get("doctor_name")
            slot_id = initial_vars.get("selected_slot_id") or initial_vars.get("slot_id")
            dyn_json = json.dumps(initial_vars, default=str)

        init_event = [{
            "event": "call_created",
            "timestamp": now_iso,
            "dynamic_variables": initial_vars or {}
        }]

        state = CallState(
            id=generate_uuid(),
            call_id=call_id,
            patient_name=p_name,
            patient_id=p_id,
            patient_phone=p_phone,
            chosen_doctor_id=doc_id,
            chosen_doctor_name=doc_name,
            chosen_slot_id=slot_id,
            booking_status="inquiry",
            dynamic_variables=dyn_json,
            context_history=json.dumps(init_event, default=str),
            created_at=utc_now(),
            updated_at=utc_now()
        )
        db.add(state)
        db.commit()
        db.refresh(state)
        logger.info(f"Initialized new server CallState for call_id={call_id}")
    elif initial_vars:
        # Merge any non-empty new variables into existing state if not already set
        updated = False
        if not state.patient_name and initial_vars.get("patient_name"):
            state.patient_name = initial_vars["patient_name"]
            updated = True
        if not state.patient_phone and initial_vars.get("patient_phone"):
            state.patient_phone = initial_vars["patient_phone"]
            updated = True
        if not state.chosen_doctor_id and initial_vars.get("selected_doctor_id"):
            state.chosen_doctor_id = initial_vars["selected_doctor_id"]
            updated = True
        if not state.dynamic_variables:
            state.dynamic_variables = json.dumps(initial_vars, default=str)
            updated = True
        if updated:
            state.updated_at = utc_now()
            db.commit()
            db.refresh(state)

    return state


def update_call_state(
    call_id: str,
    db: Session,
    updates: Dict[str, Any],
    event_name: str
) -> Optional[CallState]:
    """Atomically update conversation state attributes and append transition history."""
    state = db.execute(select(CallState).where(CallState.call_id == call_id)).scalar_one_or_none()
    if not state:
        state = get_or_create_call_state(call_id, db)

    for k, v in updates.items():
        if hasattr(state, k) and v is not None:
            setattr(state, k, v)

    # Convert non-serializable objects (like datetime) in updates for JSON storage
    serializable_updates = {}
    for k, v in updates.items():
        if isinstance(v, (datetime, date)):
            serializable_updates[k] = v.isoformat()
        else:
            serializable_updates[k] = v

    # Append to context history
    history = []
    if state.context_history:
        try:
            history = json.loads(state.context_history)
        except Exception:
            history = []
    history.append({
        "event": event_name,
        "timestamp": utc_now().isoformat(),
        "updates": serializable_updates
    })
    state.context_history = json.dumps(history, default=str)
    state.updated_at = utc_now()
    db.commit()
    db.refresh(state)
    return state


def record_tool_call_telemetry(
    call_id: str,
    tool_name: str,
    input_args: Dict[str, Any],
    output_response: Dict[str, Any],
    db: Session,
    status: str = "success",
    error: Optional[str] = None
):
    """Log individual tool execution payload, response, and audit notes into CallLog."""
    if not call_id:
        return

    # Look up call log or create placeholder
    call_log = db.execute(select(CallLog).where(CallLog.call_id == call_id)).scalar_one_or_none()
    record = {
        "tool": tool_name,
        "timestamp": utc_now().isoformat(),
        "args": input_args,
        "response": output_response,
        "status": status,
        "error": error
    }

    if call_log:
        logs = []
        if call_log.tool_calls_log:
            try:
                logs = json.loads(call_log.tool_calls_log)
            except Exception:
                logs = []
        logs.append(record)
        call_log.tool_calls_log = json.dumps(logs, default=str)
        db.commit()
    else:
        # Create minimal log record
        log = CallLog(
            id=generate_uuid(),
            call_id=call_id,
            direction="inbound",
            duration_seconds=0,
            status="in_progress",
            tool_calls_log=json.dumps([record], default=str),
            created_at=utc_now()
        )
        db.add(log)
        db.commit()


# ==========================================
# Custom Function Services with Context Linking
# ==========================================

def search_doctors_service(
    specialty: Optional[str],
    db: Session,
    call_id: Optional[str] = None
) -> SearchDoctorsOutput:
    """Find active doctors, filtered by medical specialty, synonym, or doctor name."""
    # Context recovery from server state
    norm_spec = normalize_specialty(specialty) if specialty else None
    if call_id:
        state = get_or_create_call_state(call_id, db)
        if not specialty and state.chosen_specialty:
            norm_spec = state.chosen_specialty
            specialty = state.chosen_specialty

    query = select(Doctor).where(Doctor.is_active.is_(True))

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
        open_count_stmt = select(func.count(DoctorSlot.id)).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        )
        open_slots = db.execute(open_count_stmt).scalar() or 0

        next_slot_stmt = select(DoctorSlot.start_time).where(
            and_(
                DoctorSlot.doctor_id == doc.id,
                DoctorSlot.is_booked.is_(False),
                DoctorSlot.start_time >= now
            )
        ).order_by(DoctorSlot.start_time.asc()).limit(1)
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
        out = SearchDoctorsOutput(success=False, doctors=[], message=msg)
        if call_id:
            record_tool_call_telemetry(call_id, "search_doctors", {"specialty": specialty}, out.model_dump(), db, status="no_match")
        return out

    # Conversational speech string for Retell
    if len(items) == 1:
        d = items[0]
        slot_text = f"Earliest opening is {d.next_available_slot}." if d.next_available_slot else "They have multiple openings this week."
        msg = f"I found {d.name} (ID: {d.id}), our specialist in {d.specialty}. {slot_text} Would you like to check available times?"
        # If single match, associate doctor to server state
        if call_id:
            update_call_state(call_id, db, {
                "chosen_doctor_id": d.id,
                "chosen_doctor_name": d.name,
                "chosen_specialty": d.specialty
            }, event_name="doctor_resolved_single")
    else:
        # Include doctor names and IDs clearly
        names = ", ".join([f"{d.name} (ID: {d.id}, {d.specialty})" for d in items[:3]])
        msg = f"I found matching specialists: {names}. Who would you prefer to see, or should I find the earliest available appointment?"
        if call_id and norm_spec:
            update_call_state(call_id, db, {"chosen_specialty": norm_spec}, event_name="specialty_updated")

    out = SearchDoctorsOutput(success=True, doctors=items, message=msg)
    if call_id:
        record_tool_call_telemetry(call_id, "search_doctors", {"specialty": specialty}, out.model_dump(), db)
    return out


def check_availability_service(
    doctor_id: Optional[str],
    specialty: Optional[str],
    date_str: Optional[str],
    db: Session,
    call_id: Optional[str] = None
) -> CheckAvailabilityOutput:
    """
    Retrieve verified open slots for a doctor, specialty, or date.
    Maintains server state and recovers doctor/specialty context if LLM omitted them.
    """
    # Context recovery from server state
    if call_id:
        state = get_or_create_call_state(call_id, db)
        if not doctor_id and state.chosen_doctor_id:
            doctor_id = state.chosen_doctor_id
            logger.info(f"Recovered doctor_id='{doctor_id}' from server state for call_id={call_id}")
        if not specialty and state.chosen_specialty:
            specialty = state.chosen_specialty

    now = utc_now()
    conditions = [
        DoctorSlot.is_booked.is_(False),
        DoctorSlot.start_time >= now,
        Doctor.is_active.is_(True)
    ]

    query = select(DoctorSlot, Doctor).join(Doctor, DoctorSlot.doctor_id == Doctor.id)

    # Handle doctor_id (ID, name, or specialty string)
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

    # Fallback to upcoming slots if exact date had 0 openings
    fallback_used = False
    if not rows and target_date:
        fallback_conds = [
            DoctorSlot.is_booked.is_(False),
            DoctorSlot.start_time >= now,
            Doctor.is_active.is_(True)
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
        msg = "I checked our schedule, but there are no open slots matching those exact preferences. Would you like me to check another date or look with another specialist?"
        out = CheckAvailabilityOutput(success=False, slots=[], message=msg)
        if call_id:
            record_tool_call_telemetry(call_id, "check_availability", {"doctor_id": doctor_id, "specialty": specialty, "date": date_str}, out.model_dump(), db, status="no_slots")
        return out

    # Update server conversation state with the chosen doctor and offered slots
    top_doc = rows[0][1]
    top_slot = rows[0][0]
    if call_id:
        update_call_state(call_id, db, {
            "chosen_doctor_id": top_doc.id,
            "chosen_doctor_name": top_doc.name,
            "chosen_specialty": top_doc.specialty,
            "chosen_slot_id": top_slot.id,
            "chosen_slot_time": top_slot.start_time,
            "booking_status": "slot_offered"
        }, event_name="availability_checked")

    # Build concise voice readback
    slot_options = [f"{s.date} at {s.time} (Slot ID: {s.slot_id})" for s in slots[:3]]
    spoken_options = [f"{s.date} at {s.time}" for s in slots[:3]]
    if fallback_used and target_date:
        msg = f"I don't have slots open specifically for that date, but {slots[0].doctor_name} has upcoming openings: {', or '.join(spoken_options)}. Which time works best for you?"
    else:
        msg = f"I have {len(slots)} openings available with {slots[0].doctor_name}. The earliest options are: {', or '.join(spoken_options)}. Which time works best for you?"

    out = CheckAvailabilityOutput(success=True, slots=slots, message=msg)
    if call_id:
        record_tool_call_telemetry(call_id, "check_availability", {"doctor_id": doctor_id, "specialty": specialty, "date": date_str}, out.model_dump(), db)
    return out


def book_appointment_voice_service(
    data: BookAppointmentVoiceInput,
    db: Session
) -> BookAppointmentVoiceOutput:
    """
    Handle voice appointment booking with:
    1. Server state context recovery keyed by call_id.
    2. Strict required identifier validation and actionable error messages.
    3. Idempotent repeat booking handling (no duplicate appointments on re-try).
    4. Concurrency conflict mitigation.
    5. Explicit verbal confirmation enforcement.
    """
    call_id = data.call_id
    state: Optional[CallState] = None

    # Step A: Load or initialize server state if call_id provided
    if call_id:
        state = get_or_create_call_state(call_id, db)

        # IDEMPOTENCY CHECK: If already booked in this call session, return existing booking
        if state.booking_status == "booked" and state.booking_reference_id:
            existing_apt = db.execute(
                select(Appointment).where(Appointment.reference_id == state.booking_reference_id)
            ).scalar_one_or_none()
            if existing_apt:
                dt_str = existing_apt.scheduled_at.strftime("%A, %B %d at %I:%M %p")
                doc_name = existing_apt.doctor.name if existing_apt.doctor else "Doctor"
                spoken = (
                    f"Your appointment with {doc_name} is already confirmed for {dt_str}. "
                    f"Your confirmation code is {existing_apt.reference_id}."
                )
                out = BookAppointmentVoiceOutput(
                    success=True,
                    reference_id=existing_apt.reference_id,
                    patient_name=existing_apt.patient_name,
                    doctor_name=doc_name,
                    specialty=existing_apt.specialty,
                    appointment_time=dt_str,
                    status="Confirmed",
                    error_code=None,
                    spoken_summary=spoken,
                    message="Appointment already confirmed (idempotent request handled safely)."
                )
                record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="idempotent_success")
                return out

    # Step B: Context Recovery from Server State
    if state:
        if not data.doctor_id and state.chosen_doctor_id:
            data.doctor_id = state.chosen_doctor_id
            logger.info(f"Recovered doctor_id='{data.doctor_id}' from server state for call_id={call_id}")
        if (not data.slot_id or data.slot_id.lower() in ("earliest", "any", "first", "open", "slot_1")) and state.chosen_slot_id:
            data.slot_id = state.chosen_slot_id
            logger.info(f"Recovered slot_id='{data.slot_id}' from server state for call_id={call_id}")
        if (not data.patient_name or data.patient_name.strip().lower() in ("caller", "patient", "unknown")) and state.patient_name:
            data.patient_name = state.patient_name
        if (not data.patient_phone or data.patient_phone.strip() == "") and state.patient_phone:
            data.patient_phone = state.patient_phone

    # Sanitize patient name
    if data.patient_name:
        clean_name = re.sub(r"^(my name is|i am|this is|it's|it is)\s+", "", data.patient_name.strip(), flags=re.IGNORECASE).strip()
        if clean_name:
            data.patient_name = clean_name.title()

    # Sanitize or default patient phone
    if data.patient_phone:
        raw_digits = re.sub(r"\D", "", data.patient_phone)
        if len(raw_digits) == 10:
            data.patient_phone = f"+1-{raw_digits[:3]}-{raw_digits[3:6]}-{raw_digits[6:]}"
        elif len(raw_digits) == 11 and raw_digits.startswith("1"):
            data.patient_phone = f"+1-{raw_digits[1:4]}-{raw_digits[4:7]}-{raw_digits[7:]}"
    else:
        data.patient_phone = "+1-555-019-8822"

    # Step C: MUST FIX 3 - Strict Identifier Validation & Recoverable Errors

    # 1. Validate doctor_id
    if not data.doctor_id or not data.doctor_id.strip():
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name or "Patient",
            doctor_name="Unspecified",
            specialty=data.specialty or "General",
            appointment_time="Unspecified",
            status="MissingIdentifier",
            error_code="MISSING_DOCTOR_ID",
            spoken_summary="Which care provider or specialist would you like to see? I can look up available doctors for you.",
            message="Missing required 'doctor_id'. Please select a doctor via search_doctors before booking."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="validation_error", error="MISSING_DOCTOR_ID")
        return out

    # Resolve doctor from DB
    doctor = db.get(Doctor, data.doctor_id.strip())
    if not doctor:
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

    if not doctor and data.specialty:
        norm_s = normalize_specialty(data.specialty)
        doc_conds = [func.lower(Doctor.specialty).contains(data.specialty.strip().lower())]
        if norm_s:
            doc_conds.append(func.lower(Doctor.specialty).contains(norm_s.lower()))
        doctor = db.execute(select(Doctor).where(or_(*doc_conds)).where(Doctor.is_active.is_(True))).scalars().first()

    if not doctor:
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name="Unknown",
            specialty=data.specialty or "General",
            appointment_time="Unspecified",
            status="Failed",
            error_code="INVALID_DOCTOR_ID",
            spoken_summary="I couldn't locate that specific doctor ID in our scheduling system. Which specialist would you prefer?",
            message=f"Doctor ID '{data.doctor_id}' was not found. Please invoke search_doctors to obtain a valid doctor ID."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="validation_error", error="INVALID_DOCTOR_ID")
        return out

    # Authoritatively lock doctor ID
    data.doctor_id = doctor.id

    # 2. Validate slot_id
    if not data.slot_id or not data.slot_id.strip():
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name,
            specialty=doctor.specialty,
            appointment_time="Unspecified",
            status="MissingIdentifier",
            error_code="MISSING_SLOT_ID",
            spoken_summary=f"Which time would you like with {doctor.name}? Let me check their available openings for you.",
            message="Missing required 'slot_id'. Please call check_availability to obtain an available slot ID."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="validation_error", error="MISSING_SLOT_ID")
        return out

    # Resolve slot from DB
    slot = db.get(DoctorSlot, data.slot_id.strip())
    if not slot and (data.slot_id.lower() in ("earliest", "any", "first", "open", "slot_1")):
        slot = db.execute(
            select(DoctorSlot)
            .where(and_(DoctorSlot.doctor_id == doctor.id, DoctorSlot.is_booked.is_(False), DoctorSlot.start_time >= utc_now()))
            .order_by(DoctorSlot.start_time.asc())
        ).scalars().first()
        if slot:
            data.slot_id = slot.id

    if not slot:
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name,
            specialty=doctor.specialty,
            appointment_time="Unavailable",
            status="SlotNotFound",
            error_code="SLOT_NOT_FOUND",
            spoken_summary=f"I couldn't find an available slot with ID '{data.slot_id}'. Let me check the latest open times for {doctor.name}.",
            message=f"Slot '{data.slot_id}' not found in database. Please run check_availability to view active slots."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="validation_error", error="SLOT_NOT_FOUND")
        return out

    # 3. Mismatch check: Does the slot belong to this doctor?
    if slot.doctor_id != doctor.id:
        mismatch_doc = db.get(Doctor, slot.doctor_id)
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name,
            specialty=doctor.specialty,
            appointment_time=slot.start_time.strftime("%A, %B %d at %I:%M %p"),
            status="MismatchedIdentifier",
            error_code="DOCTOR_SLOT_MISMATCH",
            spoken_summary=f"That time slot is with {mismatch_doc.name if mismatch_doc else 'another doctor'}, not {doctor.name}. Would you like to check openings for {doctor.name} instead?",
            message=f"Slot '{slot.id}' belongs to doctor '{slot.doctor_id}', not '{doctor.id}'."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="validation_error", error="DOCTOR_SLOT_MISMATCH")
        return out

    # Step D: Enforce explicit patient verbal confirmation
    time_str = slot.start_time.strftime("%A, %B %d at %I:%M %p")
    if not data.patient_confirmed:
        if call_id:
            update_call_state(call_id, db, {
                "chosen_doctor_id": doctor.id,
                "chosen_doctor_name": doctor.name,
                "chosen_specialty": doctor.specialty,
                "chosen_slot_id": slot.id,
                "chosen_slot_time": slot.start_time,
                "patient_name": data.patient_name,
                "booking_status": "pending_confirmation"
            }, event_name="confirmation_requested")

        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name,
            specialty=data.specialty or doctor.specialty,
            appointment_time=time_str,
            status="Unconfirmed",
            error_code="CONFIRMATION_REQUIRED",
            spoken_summary=f"Before I finalize this, could you please confirm: would you like me to book your consultation with {doctor.name} for {time_str} under the name {data.patient_name}?",
            message="Explicit patient verbal confirmation is required before committing the reservation."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="pending_confirmation")
        return out

    # Step E: Idempotency check on existing booking for same slot & patient
    existing_same_slot = db.execute(
        select(Appointment).where(
            and_(
                Appointment.slot_id == slot.id,
                Appointment.status == "Confirmed"
            )
        )
    ).scalar_one_or_none()

    if existing_same_slot:
        # Check if this booking was made by the same caller / in this call
        is_same_patient = existing_same_slot.patient_name.lower().strip() == data.patient_name.lower().strip()
        if is_same_patient or (call_id and state and state.booking_reference_id == existing_same_slot.reference_id):
            dt_str = existing_same_slot.scheduled_at.strftime("%A, %B %d at %I:%M %p")
            spoken = (
                f"You are all set, {existing_same_slot.patient_name}! Your appointment with {doctor.name} is confirmed for "
                f"{dt_str}. Your confirmation reference number is {existing_same_slot.reference_id}."
            )
            out = BookAppointmentVoiceOutput(
                success=True,
                reference_id=existing_same_slot.reference_id,
                patient_name=existing_same_slot.patient_name,
                doctor_name=doctor.name,
                specialty=existing_same_slot.specialty,
                appointment_time=dt_str,
                status="Confirmed",
                error_code=None,
                spoken_summary=spoken,
                message="Appointment successfully confirmed (idempotent duplicate request handled safely)."
            )
            if call_id:
                record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="idempotent_success")
            return out

    # Step F: Transactional Booking
    try:
        payload = AppointmentCreate(
            patient_name=data.patient_name,
            patient_phone=data.patient_phone,
            doctor_id=doctor.id,
            slot_id=slot.id,
            specialty=doctor.specialty,
            source="AI Voice",
            notes=data.notes
        )
        appointment = book_appointment(db, payload)

        dt_str = appointment.scheduled_at.strftime("%A, %B %d at %I:%M %p")
        spoken = (
            f"You are all set, {appointment.patient_name}! Your appointment with {doctor.name} is confirmed for "
            f"{dt_str}. Your confirmation reference number is {appointment.reference_id}. We look forward to seeing you!"
        )

        out = BookAppointmentVoiceOutput(
            success=True,
            reference_id=appointment.reference_id,
            patient_name=appointment.patient_name,
            doctor_name=doctor.name,
            specialty=appointment.specialty,
            appointment_time=dt_str,
            status="Confirmed",
            error_code=None,
            spoken_summary=spoken,
            message="Appointment successfully booked and slot claimed."
        )

        # Update server state and link appointment
        if call_id:
            update_call_state(call_id, db, {
                "chosen_doctor_id": doctor.id,
                "chosen_doctor_name": doctor.name,
                "chosen_specialty": appointment.specialty,
                "chosen_slot_id": slot.id,
                "chosen_slot_time": slot.start_time,
                "patient_name": appointment.patient_name,
                "patient_phone": appointment.patient_phone,
                "booking_status": "booked",
                "booking_reference_id": appointment.reference_id
            }, event_name="booking_confirmed")
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="success")

            # Associate appointment with CallLog
            call_log = db.execute(select(CallLog).where(CallLog.call_id == call_id)).scalar_one_or_none()
            if call_log:
                call_log.appointment_id = appointment.id
                db.commit()

        return out

    except SlotConflictError:
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name,
            specialty=doctor.specialty,
            appointment_time="Unavailable",
            status="Conflict",
            error_code="SLOT_CONFLICT",
            spoken_summary="I apologize, but that specific slot was just booked by another patient a moment ago. Let me check the schedule right now for the next earliest opening for you.",
            message="Requested slot is already booked. Concurrency lock triggered."
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="conflict", error="SLOT_CONFLICT")
            update_call_state(call_id, db, {"booking_status": "conflict"}, event_name="booking_conflict")
        return out
    except (DoctorNotFoundError, SlotNotFoundError, InvalidStateError) as e:
        out = BookAppointmentVoiceOutput(
            success=False,
            patient_name=data.patient_name,
            doctor_name=doctor.name if doctor else "Unknown",
            specialty=data.specialty or "General",
            appointment_time="Unknown",
            status="Failed",
            error_code="EXECUTION_FAILED",
            spoken_summary=f"I encountered an issue verifying the provider schedule: {e.detail}. Let me connect you with an available care team member.",
            message=str(e.detail)
        )
        if call_id:
            record_tool_call_telemetry(call_id, "book_appointment", data.model_dump(), out.model_dump(), db, status="failed", error=str(e.detail))
        return out


def get_appointment_voice_service(
    reference_id: str,
    db: Session,
    call_id: Optional[str] = None
) -> GetAppointmentVoiceOutput:
    """Retrieve booking by reference ID for voice inquiries."""
    clean_ref = reference_id.strip().upper()
    appointment = db.execute(
        select(Appointment).where(func.upper(Appointment.reference_id) == clean_ref)
    ).scalar_one_or_none()

    if not appointment:
        out = GetAppointmentVoiceOutput(
            found=False,
            spoken_summary=f"I couldn't find an appointment with reference code {reference_id}. Could you please check the reference number on your confirmation notice?"
        )
        if call_id:
            record_tool_call_telemetry(call_id, "get_appointment", {"reference_id": reference_id}, out.model_dump(), db, status="not_found")
        return out

    doc_name = appointment.doctor.name if appointment.doctor else "your care provider"
    dt_str = appointment.scheduled_at.strftime("%A, %B %d at %I:%M %p")

    spoken = (
        f"I found your record for reference {appointment.reference_id}. "
        f"Patient {appointment.patient_name} is scheduled with {doc_name} for {appointment.specialty} "
        f"on {dt_str}. The current booking status is {appointment.status}."
    )

    out = GetAppointmentVoiceOutput(
        found=True,
        reference_id=appointment.reference_id,
        patient_name=appointment.patient_name,
        doctor_name=doc_name,
        specialty=appointment.specialty,
        appointment_time=dt_str,
        status=appointment.status,
        spoken_summary=spoken
    )
    if call_id:
        record_tool_call_telemetry(call_id, "get_appointment", {"reference_id": reference_id}, out.model_dump(), db, status="found")
        update_call_state(call_id, db, {
            "booking_reference_id": appointment.reference_id,
            "patient_name": appointment.patient_name,
            "chosen_doctor_name": doc_name,
            "booking_status": "inquiry_resolved"
        }, event_name="appointment_lookup")
    return out


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
    db: Session,
    dynamic_variables: Optional[str] = None,
    context_audit: Optional[str] = None
) -> CallLog:
    """Record or update a voice call log with masked phone number, dynamic variables, and tool execution history."""
    existing = db.execute(select(CallLog).where(CallLog.call_id == call_id)).scalar_one_or_none()

    masked_phone = mask_phone_number(caller_phone)
    tools_json = json.dumps(tool_calls) if tool_calls else None

    if existing:
        existing.duration_seconds = duration_seconds
        existing.status = status
        if caller_phone and not existing.caller_phone:
            existing.caller_phone = masked_phone
        if transcript:
            existing.transcript = transcript
        if tools_json:
            existing.tool_calls_log = tools_json
        if appointment_id:
            existing.appointment_id = appointment_id
        if dynamic_variables:
            existing.dynamic_variables = dynamic_variables
        if context_audit:
            existing.context_audit = context_audit
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
        dynamic_variables=dynamic_variables,
        context_audit=context_audit,
        appointment_id=appointment_id,
        created_at=utc_now()
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def audit_call_context(call_id: str, db: Session) -> Dict[str, Any]:
    """
    Perform a complete forensic audit of context delivery for a given call_id.
    Inspects dynamic variables sent, server state evolution, tool arguments passed by LLM,
    and identifies any missing context or successful server recoveries.
    """
    state = db.execute(select(CallState).where(CallState.call_id == call_id)).scalar_one_or_none()
    call_log = db.execute(select(CallLog).where(CallLog.call_id == call_id)).scalar_one_or_none()

    dyn_vars = {}
    if state and state.dynamic_variables:
        try:
            dyn_vars = json.loads(state.dynamic_variables)
        except Exception:
            pass
    elif call_log and call_log.dynamic_variables:
        try:
            dyn_vars = json.loads(call_log.dynamic_variables)
        except Exception:
            pass

    history = []
    if state and state.context_history:
        try:
            history = json.loads(state.context_history)
        except Exception:
            pass

    tools = []
    if call_log and call_log.tool_calls_log:
        try:
            tools = json.loads(call_log.tool_calls_log)
        except Exception:
            pass

    audit_notes = []
    health = "healthy"

    # Analyze context availability
    if not dyn_vars.get("patient_name") and not (state and state.patient_name):
        audit_notes.append("Patient name was not present in dynamic variables at call start.")
        health = "recovered"
    else:
        audit_notes.append(f"Patient name verified: '{dyn_vars.get('patient_name') or (state.patient_name if state else None)}'.")

    # Analyze tool calls
    for t in tools:
        t_name = t.get("tool")
        args = t.get("args", {})
        res = t.get("response", {})
        if t_name == "book_appointment":
            if not args.get("slot_id"):
                audit_notes.append("LLM omitted 'slot_id' in book_appointment; server state fallback was applied.")
                health = "recovered"
            if not args.get("doctor_id"):
                audit_notes.append("LLM omitted 'doctor_id' in book_appointment; server state fallback was applied.")
                health = "recovered"
            if res.get("status") == "Conflict":
                audit_notes.append("Slot conflict encountered and graceful fallback alternative provided.")
            elif res.get("status") == "Confirmed":
                audit_notes.append(f"Booking confirmed idempotently with reference {res.get('reference_id')}.")

    if not audit_notes:
        audit_notes.append("All context variables and identifiers were delivered and verified across turns.")

    return {
        "call_id": call_id,
        "patient_name": state.patient_name if state else None,
        "patient_id": state.patient_id if state else None,
        "chosen_doctor_id": state.chosen_doctor_id if state else None,
        "chosen_doctor_name": state.chosen_doctor_name if state else None,
        "chosen_specialty": state.chosen_specialty if state else None,
        "chosen_slot_id": state.chosen_slot_id if state else None,
        "booking_status": state.booking_status if state else "unknown",
        "booking_reference_id": state.booking_reference_id if state else None,
        "dynamic_variables": dyn_vars,
        "history": history,
        "tool_calls": tools,
        "transcript": call_log.transcript if call_log else None,
        "context_health": health,
        "audit_notes": audit_notes
    }
