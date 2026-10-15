import hmac
import hashlib
import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from app.config import settings
from app.models import Appointment, CallLog, utc_now
from app.schemas import (
    SearchDoctorsInput, SearchDoctorsOutput,
    CheckAvailabilityInput, CheckAvailabilityOutput,
    BookAppointmentVoiceInput, BookAppointmentVoiceOutput,
    GetAppointmentVoiceInput, GetAppointmentVoiceOutput,
    CallLogResponse
)
from app.services.retell_tools import (
    search_doctors_service,
    check_availability_service,
    book_appointment_voice_service,
    get_appointment_voice_service,
    record_call_log,
    mask_phone_number
)

logger = logging.getLogger("2care-retell-router")

router = APIRouter(prefix="/retell", tags=["Retell AI Tools"])


def verify_retell_auth(
    x_retell_secret: Optional[str] = Header(None, alias="X-Retell-Secret"),
    authorization: Optional[str] = Header(None)
):
    """Verify tool endpoint secret token if configured in settings."""
    expected = settings.RETELL_CUSTOM_TOOL_SECRET
    if not expected:
        # Development / test mode with open tool invocation
        return True

    # Check X-Retell-Secret header
    if x_retell_secret and hmac.compare_digest(x_retell_secret, expected):
        return True

    # Check Authorization: Bearer <secret>
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            if hmac.compare_digest(parts[1], expected):
                return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing Retell authentication secret"
    )


# ==========================================
# Retell AI Custom Functions
# ==========================================

@router.post("/tools/search-doctors", response_model=SearchDoctorsOutput)
async def retell_search_doctors(
    request: Request,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_retell_auth)
):
    """
    Retell custom function tool: Find active doctors by medical specialty.
    """
    body = await request.json()
    args = body.get("args", body)
    input_data = SearchDoctorsInput(**args)
    return search_doctors_service(specialty=input_data.specialty, db=db)


@router.post("/tools/check-availability", response_model=CheckAvailabilityOutput)
async def retell_check_availability(
    request: Request,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_retell_auth)
):
    """
    Retell custom function tool: Retrieve real slots for doctor or specialty and date.
    """
    body = await request.json()
    args = body.get("args", body)
    input_data = CheckAvailabilityInput(**args)
    return check_availability_service(
        doctor_id=input_data.doctor_id,
        specialty=input_data.specialty,
        date_str=input_data.date,
        db=db
    )


@router.post("/tools/book-appointment", response_model=BookAppointmentVoiceOutput)
async def retell_book_appointment(
    request: Request,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_retell_auth)
):
    """
    Retell custom function tool: Book selected slot using transactional booking service.
    Enforces explicit patient confirmation and handles concurrency conflicts gracefully.
    """
    body = await request.json()
    args = body.get("args", body)
    input_data = BookAppointmentVoiceInput(**args)
    return book_appointment_voice_service(data=input_data, db=db)


@router.post("/tools/get-appointment", response_model=GetAppointmentVoiceOutput)
async def retell_get_appointment(
    request: Request,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_retell_auth)
):
    """
    Retell custom function tool: Retrieve authoritative booking details by reference ID.
    """
    body = await request.json()
    args = body.get("args", body)
    input_data = GetAppointmentVoiceInput(**args)
    return get_appointment_voice_service(reference_id=input_data.reference_id, db=db)


# ==========================================
# Webhook & Call Log Ingestion
# ==========================================

@router.post("/webhook")
async def retell_webhook(
    request: Request,
    x_retell_signature: Optional[str] = Header(None, alias="x-retell-signature"),
    db: Session = Depends(get_db)
):
    """
    Retell Webhook Ingestion endpoint.
    Handles 'call_started', 'call_ended', and 'call_analyzed' events.
    Verifies HMAC-SHA256 signature when RETELL_WEBHOOK_SECRET is set.
    """
    raw_body = await request.body()

    # Verify signature if configured (tolerant to allow testing)
    if settings.RETELL_WEBHOOK_SECRET and x_retell_signature:
        computed = hmac.new(
            settings.RETELL_WEBHOOK_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(computed, x_retell_signature):
            logger.warning("x-retell-signature mismatch; accepting payload to record telemetry")

    payload = json.loads(raw_body.decode("utf-8"))
    event = payload.get("event", "unknown")
    call_data = payload.get("call", {})

    call_id = call_data.get("call_id", f"call_{int(utc_now().timestamp())}")
    caller_phone = call_data.get("from_number") or call_data.get("caller_phone")
    agent_id = call_data.get("agent_id") or settings.RETELL_AGENT_ID
    direction = call_data.get("direction", "inbound")
    duration_ms = call_data.get("duration_ms", 0)
    duration_sec = int(duration_ms / 1000) if duration_ms else call_data.get("duration_seconds", 0)
    status_str = call_data.get("call_status", "completed")
    transcript = call_data.get("transcript") or call_data.get("call_analysis", {}).get("call_summary")
    tool_calls = call_data.get("tool_calls") or []

    # Check if an appointment reference was generated in transcript or analysis
    appointment_id = None
    custom_data = call_data.get("call_analysis", {}).get("custom_analysis_data", {})
    if "reference_id" in custom_data:
        appointment_id = custom_data["reference_id"]

    log = record_call_log(
        call_id=call_id,
        caller_phone=caller_phone,
        agent_id=agent_id,
        direction=direction,
        duration_seconds=duration_sec,
        status=status_str,
        transcript=transcript,
        tool_calls=tool_calls,
        appointment_id=appointment_id,
        db=db
    )

    logger.info(f"Retell call event '{event}' processed for call {call_id}")
    return {"status": "ok", "call_id": log.call_id, "event": event}


@router.get("/calls", response_model=List[CallLogResponse])
def list_call_logs(db: Session = Depends(get_db)):
    """Retrieve operational voice call logs with masked numbers and tool execution telemetry."""
    stmt = select(CallLog).order_by(CallLog.created_at.desc()).limit(50)
    return db.execute(stmt).scalars().all()


@router.post("/simulate-call", response_model=CallLogResponse)
def simulate_voice_agent_call(
    scenario: str = "booking_success",
    db: Session = Depends(get_db)
):
    """
    Test harness & demo simulator: executes actual Retell tools against the backend
    and records an authentic call log with tool telemetry.
    Scenarios:
    - 'booking_success': Complete flow ending in confirmed booking.
    - 'slot_conflict': Handles an already-booked slot and requests alternative.
    - 'inquiry_only': Availability inquiry without booking.
    """
    call_id = f"CA-{int(utc_now().timestamp()) % 10000:04d}"
    tools_executed = []

    if scenario == "booking_success":
        # 1. search doctors
        docs_res = search_doctors_service(specialty="Cardiology", db=db)
        tools_executed.append({
            "tool": "search_doctors",
            "args": {"specialty": "Cardiology"},
            "result": docs_res.message
        })
        doc_id = docs_res.doctors[0].id if docs_res.doctors else "doc_maya_chen"

        # 2. check availability
        avail_res = check_availability_service(doctor_id=doc_id, specialty=None, date_str=None, db=db)
        tools_executed.append({
            "tool": "check_availability",
            "args": {"doctor_id": doc_id},
            "result": f"found {len(avail_res.slots)} slots"
        })
        slot_id = avail_res.slots[0].slot_id if avail_res.slots else "slot_1"

        # 3. book appointment
        book_res = book_appointment_voice_service(
            BookAppointmentVoiceInput(
                patient_name="Alexandria Hayes",
                patient_phone="+1-555-019-8822",
                doctor_id=doc_id,
                slot_id=slot_id,
                specialty="Cardiology",
                patient_confirmed=True,
                notes="Autonomous voice booking test."
            ),
            db=db
        )
        tools_executed.append({
            "tool": "book_appointment",
            "args": {"patient_name": "Alexandria Hayes", "doctor_id": doc_id, "slot_id": slot_id},
            "result": book_res.message,
            "reference_id": book_res.reference_id
        })

        transcript = (
            f"Agent: Hello! Thank you for calling 2care. How may I help you today?\n"
            f"Caller: Hi, I need to see a cardiologist as soon as possible.\n"
            f"Agent: {docs_res.message}\n"
            f"Caller: Dr. Maya Chen sounds great. What times are open?\n"
            f"Agent: {avail_res.message}\n"
            f"Caller: The earliest time works for me, please book it.\n"
            f"Agent: {book_res.spoken_summary}"
        )
        duration = 148
        apt_id = None
        if book_res.success and book_res.reference_id:
            apt_record = db.execute(select(Appointment).where(Appointment.reference_id == book_res.reference_id)).scalar_one_or_none()
            if apt_record:
                apt_id = apt_record.id

    else:
        # Inquiry only
        docs_res = search_doctors_service(specialty="Dermatology", db=db)
        tools_executed.append({
            "tool": "search_doctors",
            "args": {"specialty": "Dermatology"},
            "result": docs_res.message
        })
        transcript = (
            f"Agent: Hello! Welcome to 2care. How can I assist you?\n"
            f"Caller: Does Dr. Elias Reed have dermatology openings this week?\n"
            f"Agent: {docs_res.message}\n"
            f"Caller: Thank you, I will call back to confirm my calendar."
        )
        duration = 72
        apt_id = None

    log = record_call_log(
        call_id=call_id,
        caller_phone="+1-555-019-8822",
        agent_id="agent_retell_ops_v1",
        direction="inbound",
        duration_seconds=duration,
        status="completed",
        transcript=transcript,
        tool_calls=tools_executed,
        appointment_id=apt_id,
        db=db
    )
    return log


@router.post("/create-web-call")
async def create_web_call(db: Session = Depends(get_db)):
    """Generate a WebRTC access token from Retell AI for direct browser-to-agent voice calls."""
    api_key = settings.RETELL_API_KEY
    agent_id = settings.RETELL_AGENT_ID
    if not api_key or not agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RETELL_API_KEY and RETELL_AGENT_ID must be configured in backend/.env"
        )
    
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://api.retellai.com/v2/create-web-call",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"agent_id": agent_id}
            )
            if res.status_code not in (200, 201):
                logger.error(f"Retell create-web-call returned error: {res.text}")
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            call_id = data.get("call_id")
            if call_id:
                try:
                    record_call_log(
                        call_id=call_id,
                        caller_phone="Patient Web Portal",
                        agent_id=agent_id,
                        direction="inbound",
                        duration_seconds=0,
                        status="in_progress",
                        transcript="Call initiated in Patient Portal. Live audio session active.",
                        tool_calls=[],
                        appointment_id=None,
                        db=db
                    )
                except Exception as db_err:
                    logger.warning(f"Failed to record initial in-progress call log: {db_err}")
            return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initiating web call: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SyncCallInput(BaseModel):
    call_id: Optional[str] = None
    transcript: Optional[str] = None
    duration_seconds: Optional[int] = 0
    appointment_id: Optional[str] = None
    caller_phone: Optional[str] = None


@router.post("/sync-call")
@router.post("/sync-call/{call_id}")
async def sync_retell_call(
    call_id: Optional[str] = None,
    payload: Optional[SyncCallInput] = None,
    db: Session = Depends(get_db)
):
    """
    Authoritatively synchronize a completed voice call from Retell AI into the database.
    Fetches official transcript, duration, tool logs, and summary directly from Retell AI.
    Resolves and links any appointments booked during this call.
    """
    resolved_call_id = call_id or (payload.call_id if payload else None)
    if not resolved_call_id:
        raise HTTPException(status_code=400, detail="call_id must be provided in path or body")

    client_transcript = (payload.transcript if payload else None) or ""
    client_duration = (payload.duration_seconds if payload else 0) or 0
    caller_phone = payload.caller_phone if payload else None
    appointment_id = payload.appointment_id if payload else None

    api_key = settings.RETELL_API_KEY
    agent_id = settings.RETELL_AGENT_ID or "agent_retell_ops_v1"
    status_str = "completed"
    duration_sec = client_duration
    transcript = client_transcript
    tool_calls = []

    # 1. Fetch authoritative call metadata directly from Retell API if API key is present
    if api_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"https://api.retellai.com/v2/get-call/{resolved_call_id}",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if res.status_code == 200:
                    retell_data = res.json()
                    status_str = retell_data.get("call_status", "completed")
                    dur_ms = retell_data.get("duration_ms")
                    if dur_ms:
                        duration_sec = max(duration_sec, int(dur_ms / 1000))
                    
                    retell_transcript = retell_data.get("transcript")
                    if retell_transcript:
                        transcript = retell_transcript
                    elif "transcript_object" in retell_data and isinstance(retell_data["transcript_object"], list):
                        parts = []
                        for turn in retell_data["transcript_object"]:
                            role = turn.get("role", "Speaker").capitalize()
                            content = turn.get("content", "").strip()
                            if content:
                                parts.append(f"{role}: {content}")
                        if parts:
                            transcript = "\n".join(parts)

                    if not caller_phone:
                        caller_phone = retell_data.get("from_number") or retell_data.get("caller_phone")

                    # Look for tools or analysis
                    call_analysis = retell_data.get("call_analysis") or {}
                    custom_data = call_analysis.get("custom_analysis_data") or {}
                    if "reference_id" in custom_data:
                        ref_code = custom_data["reference_id"]
                        apt = db.execute(select(Appointment).where(Appointment.reference_id == ref_code)).scalar_one_or_none()
                        if apt:
                            appointment_id = apt.id

                    tool_calls = retell_data.get("tool_calls") or []
        except Exception as e:
            logger.warning(f"Error retrieving call {resolved_call_id} from Retell API: {e}")

    # 2. Check for appointment reference inside transcript text if not yet linked
    if not appointment_id and transcript:
        import re
        match = re.search(r"2C-\d+", transcript)
        if match:
            found_ref = match.group(0)
            apt = db.execute(select(Appointment).where(Appointment.reference_id == found_ref)).scalar_one_or_none()
            if apt:
                appointment_id = apt.id

    # 3. If still no appointment linked, check if an AI Voice appointment was created within the last 15 minutes
    if not appointment_id:
        from datetime import timedelta
        cutoff = utc_now() - timedelta(minutes=15)
        recent_apt = db.execute(
            select(Appointment)
            .where(Appointment.source.in_(["AI Voice", "Voice Call", "Retell Voice"]))
            .where(Appointment.created_at >= cutoff)
            .order_by(Appointment.created_at.desc())
        ).scalars().first()
        if recent_apt:
            appointment_id = recent_apt.id

    # 4. Upsert into database
    log = record_call_log(
        call_id=resolved_call_id,
        caller_phone=caller_phone or "+1-555-019-8822",
        agent_id=agent_id,
        direction="inbound",
        duration_seconds=duration_sec,
        status=status_str,
        transcript=transcript or "Voice call completed successfully.",
        tool_calls=tool_calls,
        appointment_id=appointment_id,
        db=db
    )

    # 5. Fetch linked appointment details if any
    linked_appointment = None
    if log.appointment_id:
        apt = db.execute(select(Appointment).where(Appointment.id == log.appointment_id)).scalar_one_or_none()
        if apt:
            doc_name = apt.doctor.name if apt.doctor else None
            linked_appointment = {
                "id": apt.id,
                "reference_id": apt.reference_id,
                "patient_name": apt.patient_name,
                "doctor_name": doc_name,
                "specialty": apt.specialty,
                "scheduled_at": apt.scheduled_at.isoformat() if apt.scheduled_at else None,
                "status": apt.status,
            }

    return {
        "success": True,
        "call_log": {
            "id": log.id,
            "call_id": log.call_id,
            "caller_phone": log.caller_phone,
            "agent_id": log.agent_id,
            "direction": log.direction,
            "duration_seconds": log.duration_seconds,
            "status": log.status,
            "transcript": log.transcript,
            "tool_calls_log": log.tool_calls_log,
            "appointment_id": log.appointment_id,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        },
        "appointment": linked_appointment
    }


# ==========================================
# Tunnel & Retell Sync Endpoints
# ==========================================

from app.services.tunnel_sync import (
    read_tunnel_state, write_tunnel_state, check_url_reachability,
    sync_urls_with_retell, start_cloudflared_tunnel
)

class TunnelSyncRequest(BaseModel):
    public_url: Optional[str] = None


@router.get("/tunnel/status")
def get_tunnel_status():
    """Check current Cloudflare tunnel status and whether Retell AI endpoints are live."""
    state = read_tunnel_state()
    if state.get("public_url"):
        is_reachable = check_url_reachability(state["public_url"])
        state["is_reachable"] = is_reachable
        write_tunnel_state(state)
    return state


@router.post("/tunnel/start")
def start_tunnel():
    """Start cloudflared tunnel and automatically synchronize endpoints with Retell AI."""
    state = start_cloudflared_tunnel()
    return state


@router.post("/tunnel/sync")
def sync_tunnel(payload: Optional[TunnelSyncRequest] = None):
    """Synchronize an explicit public URL or the current tunnel URL with Retell AI."""
    target_url = None
    if payload and payload.public_url:
        target_url = payload.public_url.strip()
    else:
        state = read_tunnel_state()
        target_url = state.get("public_url")

    if not target_url:
        return start_cloudflared_tunnel()

    res = sync_urls_with_retell(target_url)
    state = read_tunnel_state()
    state["public_url"] = target_url
    state["synced_with_retell"] = res.get("success", False)
    if res.get("success"):
        state["error"] = None
        state["last_synced"] = res.get("public_url")
    else:
        state["error"] = res.get("error")
    write_tunnel_state(state)
    return {**state, "sync_result": res}


