import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import (
    Doctor, DoctorSlot, Appointment, CallLog, EvaluationRun,
    AppointmentStatus, generate_uuid, utc_now
)

logger = logging.getLogger(__name__)


def seed_database(db: Session):
    """Seed initial repeatable fictional doctors, slots, appointments, and operational logs."""
    # Check if doctors already exist
    existing_docs = db.execute(select(Doctor)).scalars().first()
    if existing_docs:
        logger.info("Database already seeded with doctors. Skipping seed.")
        return

    logger.info("Seeding database with doctors, slots, and appointments...")

    # 1. Doctors
    docs_data = [
        {"id": "doc_maya_chen", "name": "Dr. Maya Chen", "initials": "MC", "specialty": "Cardiology", "color": "cyan", "is_active": True},
        {"id": "doc_elias_reed", "name": "Dr. Elias Reed", "initials": "ER", "specialty": "Dermatology", "color": "mint", "is_active": True},
        {"id": "doc_lena_ortiz", "name": "Dr. Lena Ortiz", "initials": "LO", "specialty": "General Medicine", "color": "violet", "is_active": True},
        {"id": "doc_arjun_mehta", "name": "Dr. Arjun Mehta", "initials": "AM", "specialty": "Neurology", "color": "orange", "is_active": False},
    ]

    doctor_objs = {}
    for d in docs_data:
        doc = Doctor(**d)
        db.add(doc)
        doctor_objs[d["id"]] = doc
    db.flush()

    # 2. Future Doctor Slots (for the next 7 days, 6 slots per day)
    now = utc_now().replace(minute=0, second=0, microsecond=0)
    slot_times = [
        (9, 0), (10, 30), (12, 0), (13, 30), (15, 0), (16, 30)
    ]

    all_slots = []
    for day_offset in range(0, 7):
        target_day = now + timedelta(days=day_offset)
        for doc_id, doc in doctor_objs.items():
            for hour, minute in slot_times:
                start_dt = target_day.replace(hour=hour, minute=minute, second=0, microsecond=0)
                end_dt = start_dt + timedelta(minutes=45)
                slot = DoctorSlot(
                    id=f"slot_{doc_id}_{start_dt.strftime('%Y%m%d%H%M')}",
                    doctor_id=doc_id,
                    start_time=start_dt,
                    end_time=end_dt,
                    is_booked=False,
                    is_held=False
                )
                db.add(slot)
                all_slots.append(slot)
    db.flush()

    # 3. Seed Repeatable Initial Appointments matching 2care Figma UI
    # Pick specific slots to book
    fictional_appointments = [
        {
            "id": "apt_10482",
            "reference_id": "2C-10482",
            "patient_name": "Amelia Carter",
            "patient_phone": "+1-555-019-2831",
            "patient_email": "amelia.c@example.com",
            "doctor_id": "doc_maya_chen",
            "specialty": "Cardiology",
            "source": "AI Voice",
            "status": AppointmentStatus.CONFIRMED.value,
            "slot_index": 0,
            "notes": "Follow-up ECG consultation booked via autonomous voice agent."
        },
        {
            "id": "apt_10481",
            "reference_id": "2C-10481",
            "patient_name": "Noah Williams",
            "patient_phone": "+1-555-014-9982",
            "patient_email": "noah.w@example.com",
            "doctor_id": "doc_elias_reed",
            "specialty": "Dermatology",
            "source": "Portal",
            "status": AppointmentStatus.PENDING.value,
            "slot_index": 6,
            "notes": "Routine skin screening requested via patient portal."
        },
        {
            "id": "apt_10479",
            "reference_id": "2C-10479",
            "patient_name": "Sophia Bennett",
            "patient_phone": "+1-555-018-7744",
            "patient_email": "sophia.b@example.com",
            "doctor_id": "doc_lena_ortiz",
            "specialty": "General Medicine",
            "source": "AI Voice",
            "status": AppointmentStatus.CONFIRMED.value,
            "slot_index": 12,
            "notes": "Annual health checkup scheduled via voice assistant."
        },
        {
            "id": "apt_10476",
            "reference_id": "2C-10476",
            "patient_name": "James Wilson",
            "patient_phone": "+1-555-013-4412",
            "patient_email": "james.w@example.com",
            "doctor_id": "doc_arjun_mehta",
            "specialty": "Neurology",
            "source": "Staff",
            "status": AppointmentStatus.CANCELLED.value,
            "slot_index": 18,
            "notes": "Patient rescheduled directly with clinic receptionist."
        },
        {
            "id": "apt_10474",
            "reference_id": "2C-10474",
            "patient_name": "Olivia Martin",
            "patient_phone": "+1-555-012-6631",
            "patient_email": "olivia.m@example.com",
            "doctor_id": "doc_maya_chen",
            "specialty": "Cardiology",
            "source": "AI Voice",
            "status": AppointmentStatus.CONFIRMED.value,
            "slot_index": 2,
            "notes": "Cardiology consultation confirmed with Dr. Maya Chen via AI voice assistant."
        },
        {
            "id": "apt_10471",
            "reference_id": "2C-10471",
            "patient_name": "Lucas Thompson",
            "patient_phone": "+1-555-019-3321",
            "patient_email": "lucas.t@example.com",
            "doctor_id": "doc_lena_ortiz",
            "specialty": "General Medicine",
            "source": "Portal",
            "status": AppointmentStatus.CONFIRMED.value,
            "slot_index": 14,
            "notes": "Follow-up lab result review."
        },
    ]

    for item in fictional_appointments:
        slot = all_slots[item["slot_index"]]
        if item["status"] == AppointmentStatus.CONFIRMED.value:
            slot.is_booked = True
        
        apt = Appointment(
            id=item["id"],
            reference_id=item["reference_id"],
            patient_name=item["patient_name"],
            patient_phone=item["patient_phone"],
            patient_email=item["patient_email"],
            doctor_id=item["doctor_id"],
            slot_id=slot.id,
            specialty=item["specialty"],
            scheduled_at=slot.start_time,
            source=item["source"],
            status=item["status"],
            notes=item["notes"]
        )
        db.add(apt)
    db.flush()

    # 4. Seed Call Logs
    call_logs = [
        CallLog(
            id=generate_uuid(),
            call_id="CA-8841",
            caller_phone="+1-555-019-2831",
            agent_id="agent_scheduling_v2",
            direction="inbound",
            duration_seconds=161,
            status="completed",
            transcript="Agent: Thank you for calling 2care. How can I assist you today?\nPatient: I need to see Dr. Maya Chen for cardiology follow up.\nAgent: I found an opening today at 09:30 AM. Would you like me to book that?\nPatient: Yes please.\nAgent: You're confirmed for reference 2C-10482. Have a great day!",
            tool_calls_log='[{"tool": "check_doctor_availability", "input": {"specialty": "Cardiology"}, "output": "found 8 slots"}, {"tool": "book_appointment", "input": {"doctor_id": "doc_maya_chen", "patient_name": "Amelia Carter"}, "output": "confirmed 2C-10482"}]',
            appointment_id="apt_10482"
        ),
        CallLog(
            id=generate_uuid(),
            call_id="CA-8840",
            caller_phone="+1-555-018-7744",
            agent_id="agent_scheduling_v2",
            direction="inbound",
            duration_seconds=142,
            status="completed",
            transcript="Agent: 2care healthcare scheduling. What specialty are you looking for?\nPatient: General Medicine.\nAgent: Dr. Lena Ortiz has slots available today.",
            tool_calls_log='[{"tool": "check_doctor_availability", "input": {"specialty": "General Medicine"}, "output": "found 12 slots"}]',
            appointment_id="apt_10479"
        )
    ]
    for c in call_logs:
        db.add(c)

    # 5. Seed Evaluation Runs
    eval_runs = [
        EvaluationRun(
            id="EV-2048",
            scenario_name="Cardiology Autonomous Booking Scenario",
            overall_score=94.0,
            tool_accuracy=97.0,
            conversation_quality=91.0,
            policy_adherence=99.0,
            passed=True,
            details_json='{"scenarios_tested": 10, "passed": 10, "avg_latency_ms": 284}'
        ),
        EvaluationRun(
            id="EV-2047",
            scenario_name="Conflict Slot Fallback Scenario",
            overall_score=91.0,
            tool_accuracy=92.0,
            conversation_quality=89.0,
            policy_adherence=98.0,
            passed=True,
            details_json='{"scenarios_tested": 8, "passed": 8, "avg_latency_ms": 310}'
        )
    ]
    for e in eval_runs:
        db.add(e)

    db.commit()
    logger.info("Database seeding complete!")
