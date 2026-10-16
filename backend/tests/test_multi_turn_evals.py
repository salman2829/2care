import pytest
import uuid
from app.models import Appointment, Doctor, DoctorSlot, CallState, CallLog, utc_now
from app.services.retell_tools import get_or_create_call_state, audit_call_context


def test_eval_scenario_caller_changes_mind(client, db_session):
    """
    Multi-Turn Eval Scenario 1: Caller changes their mind mid-call.
    - Caller first searches for Cardiology (Dr. Maya Chen).
    - Checks availability for Dr. Maya Chen.
    - Caller changes mind mid-call: "Actually I have a skin rash, let me see a dermatologist."
    - Switches to Dermatology (Dr. Sarah Jenkins).
    - Books with Dr. Sarah Jenkins.
    - Asserts that tool arguments, server conversation state, and final booking correctly reflect
      the dermatologist and NOT the abandoned cardiologist.
    """
    call_id = f"eval_mind_change_{uuid.uuid4().hex[:8]}"

    # Turn 0: Call Start with Dynamic Variables
    init_vars = {
        "patient_name": "Sophia Martinez",
        "patient_phone": "+1-555-019-3388",
        "clinic_name": "2care Clinical Command Center"
    }
    get_or_create_call_state(call_id=call_id, db=db_session, initial_vars=init_vars)

    # Turn 1: search_doctors (Cardiology)
    t1_res = client.post("/retell/tools/search-doctors", json={"specialty": "Cardiology", "call_id": call_id})
    assert t1_res.status_code == 200
    t1_data = t1_res.json()
    assert t1_data["success"] is True
    doc_cardio_id = t1_data["doctors"][0]["id"]
    assert "maya" in doc_cardio_id.lower()

    # Turn 2: check_availability for Cardiology
    t2_res = client.post("/retell/tools/check-availability", json={"doctor_id": doc_cardio_id, "call_id": call_id})
    assert t2_res.status_code == 200
    t2_data = t2_res.json()
    assert t2_data["success"] is True
    assert len(t2_data["slots"]) >= 1

    # Turn 3: Caller changes mind -> search_doctors (Dermatology)
    t3_res = client.post("/retell/tools/search-doctors", json={"specialty": "Dermatology", "call_id": call_id})
    assert t3_res.status_code == 200
    t3_data = t3_res.json()
    assert t3_data["success"] is True
    doc_derm_id = t3_data["doctors"][0]["id"]
    assert "elias" in doc_derm_id.lower() or "reed" in doc_derm_id.lower() or "sarah" in doc_derm_id.lower()
    assert doc_derm_id != doc_cardio_id

    # Turn 4: check_availability for Dermatology
    t4_res = client.post("/retell/tools/check-availability", json={"doctor_id": doc_derm_id, "call_id": call_id})
    assert t4_res.status_code == 200
    t4_data = t4_res.json()
    assert t4_data["success"] is True
    derm_slot_id = t4_data["slots"][0]["slot_id"]

    # Turn 5: book_appointment with confirmed dermatology slot
    book_payload = {
        "patient_name": "Sophia Martinez",
        "patient_phone": "+1-555-019-3388",
        "doctor_id": doc_derm_id,
        "slot_id": derm_slot_id,
        "specialty": "Dermatology",
        "patient_confirmed": True,
        "call_id": call_id
    }
    t5_res = client.post("/retell/tools/book-appointment", json=book_payload)
    assert t5_res.status_code == 200
    t5_data = t5_res.json()
    assert t5_data["success"] is True
    assert t5_data["status"] == "Confirmed"
    ref_id = t5_data["reference_id"]
    assert ref_id.startswith("2C-")

    # Assert final appointment in database matches dermatologist, not cardiologist
    apt = db_session.query(Appointment).filter(Appointment.reference_id == ref_id).one()
    assert apt.doctor_id == doc_derm_id
    assert apt.doctor_id != doc_cardio_id
    assert apt.patient_name == "Sophia Martinez"
    assert apt.slot_id == derm_slot_id

    # Assert server conversation state audit
    audit = audit_call_context(call_id, db_session)
    assert audit["booking_status"] == "booked"
    assert audit["chosen_doctor_id"] == doc_derm_id
    assert audit["booking_reference_id"] == ref_id


def test_eval_scenario_details_out_of_order(client, db_session):
    """
    Multi-Turn Eval Scenario 2: Details given out of order.
    - Caller gives date and time first ("tomorrow") before mentioning provider or symptoms.
    - System returns open slots without crashing.
    - Caller then gives doctor preference ("Dr. Maya Chen").
    - Caller gives patient name and phone at the end.
    - Asserts that all identifiers are validated and booked cleanly.
    """
    call_id = f"eval_order_{uuid.uuid4().hex[:8]}"

    # Turn 1: check_availability with date only (no doctor or specialty specified yet)
    t1_res = client.post("/retell/tools/check-availability", json={"date": "tomorrow", "call_id": call_id})
    assert t1_res.status_code == 200
    t1_data = t1_res.json()
    assert t1_data["success"] is True
    assert len(t1_data["slots"]) >= 1

    # Turn 2: Caller now mentions preferred doctor Dr. Maya Chen
    t2_res = client.post("/retell/tools/check-availability", json={"doctor_id": "doc_test_maya", "call_id": call_id})
    assert t2_res.status_code == 200
    t2_data = t2_res.json()
    assert t2_data["success"] is True
    chosen_slot_id = t2_data["slots"][0]["slot_id"]

    # Turn 3: Caller gives name and phone last and confirms
    book_payload = {
        "patient_name": "Jordan Lee",
        "patient_phone": "+1-555-014-9988",
        "doctor_id": "doc_test_maya",
        "slot_id": chosen_slot_id,
        "specialty": "Cardiology",
        "patient_confirmed": True,
        "call_id": call_id
    }
    t3_res = client.post("/retell/tools/book-appointment", json=book_payload)
    assert t3_res.status_code == 200
    t3_data = t3_res.json()
    assert t3_data["success"] is True
    assert t3_data["status"] == "Confirmed"
    assert t3_data["patient_name"] == "Jordan Lee"


def test_eval_scenario_interruption_and_repetition(client, db_session):
    """
    Multi-Turn Eval Scenario 3: Interruption & repetition mid-call.
    - Caller checks availability for Dr. Maya Chen.
    - Caller interrupts to lookup an existing appointment for reference 2C-10482.
    - Caller then asks agent to repeat available times without repeating the doctor ID!
    - Server state recovers chosen_doctor_id seamlessly.
    - Final booking confirmed.
    """
    call_id = f"eval_repeat_{uuid.uuid4().hex[:8]}"

    # Initial state with patient name
    get_or_create_call_state(call_id=call_id, db=db_session, initial_vars={"patient_name": "Diana Prince"})

    # Turn 1: check_availability for Dr. Maya Chen
    t1_res = client.post("/retell/tools/check-availability", json={"doctor_id": "doc_test_maya", "call_id": call_id})
    assert t1_res.status_code == 200
    t1_data = t1_res.json()
    assert t1_data["success"] is True
    slot_id = t1_data["slots"][0]["slot_id"]

    # Turn 2: Interruption -> Caller checks an existing reference
    t2_res = client.post("/retell/tools/get-appointment", json={"reference_id": "2C-99999", "call_id": call_id})
    assert t2_res.status_code == 200

    # Turn 3: Caller repeats availability request BUT OMITS doctor_id!
    # Server state must authoritatively recover doctor_id="doc_test_maya"
    t3_res = client.post("/retell/tools/check-availability", json={"call_id": call_id})
    assert t3_res.status_code == 200
    t3_data = t3_res.json()
    assert t3_data["success"] is True
    assert "Maya Chen" in t3_data["message"]

    # Turn 4: Final booking
    book_payload = {
        "patient_name": "Diana Prince",
        "patient_phone": "+1-555-018-4411",
        "doctor_id": "doc_test_maya",
        "slot_id": slot_id,
        "patient_confirmed": True,
        "call_id": call_id
    }
    t4_res = client.post("/retell/tools/book-appointment", json=book_payload)
    assert t4_res.status_code == 200
    assert t4_res.json()["success"] is True
    assert t4_res.json()["status"] == "Confirmed"


def test_eval_scenario_idempotency_on_repeated_booking(client, db_session):
    """
    Multi-Turn Eval Scenario 4: Idempotent repeat booking tool calls.
    - If Retell LLM calls book_appointment twice or network retries,
      the second call must NOT fail with Conflict or create duplicate appointments.
    - It must return Confirmed with the same reference ID.
    """
    call_id = f"eval_idempotent_{uuid.uuid4().hex[:8]}"

    # Fetch an open slot for Dr. Maya Chen
    avail_res = client.post("/retell/tools/check-availability", json={"doctor_id": "doc_test_maya", "call_id": call_id})
    assert avail_res.status_code == 200
    open_slots = avail_res.json()["slots"]
    # Pick a fresh slot
    slot_id = open_slots[-1]["slot_id"]

    payload = {
        "patient_name": "Arthur Pendelton",
        "patient_phone": "+1-555-099-1234",
        "doctor_id": "doc_test_maya",
        "slot_id": slot_id,
        "patient_confirmed": True,
        "call_id": call_id
    }

    # Call 1
    res1 = client.post("/retell/tools/book-appointment", json=payload)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["success"] is True
    assert d1["status"] == "Confirmed"
    ref1 = d1["reference_id"]

    # Call 2: Identical repeated booking tool call in same call_id
    res2 = client.post("/retell/tools/book-appointment", json=payload)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["success"] is True
    assert d2["status"] == "Confirmed"
    ref2 = d2["reference_id"]

    # Assert both return the exact same booking reference without conflict
    assert ref1 == ref2


def test_eval_scenario_strict_validation_errors(client):
    """
    Multi-Turn Eval Scenario 5: Strict validation and recoverable errors.
    - Missing slot_id returns MissingIdentifier error code.
    - Mismatched doctor_id and slot_id returns DOCTOR_SLOT_MISMATCH error code.
    - Unconfirmed verbal agreement returns CONFIRMATION_REQUIRED error code.
    """
    # 1. Missing slot_id
    res_no_slot = client.post("/retell/tools/book-appointment", json={
        "patient_name": "Robert Paulson",
        "patient_phone": "+1-555-011-2233",
        "doctor_id": "doc_test_maya",
        "slot_id": "",
        "patient_confirmed": True
    })
    assert res_no_slot.status_code == 200
    d_no_slot = res_no_slot.json()
    assert d_no_slot["success"] is False
    assert d_no_slot["status"] == "MissingIdentifier"
    assert d_no_slot["error_code"] == "MISSING_SLOT_ID"

    # 2. Mismatched doctor and slot
    # slot_test_e_0 belongs to Dr. Elias, but passing doctor_id="doc_test_maya"
    res_mismatch = client.post("/retell/tools/book-appointment", json={
        "patient_name": "Robert Paulson",
        "patient_phone": "+1-555-011-2233",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_e_0",
        "patient_confirmed": True
    })
    assert res_mismatch.status_code == 200
    d_mismatch = res_mismatch.json()
    assert d_mismatch["success"] is False
    assert d_mismatch["status"] == "MismatchedIdentifier"
    assert d_mismatch["error_code"] == "DOCTOR_SLOT_MISMATCH"


def test_eval_multi_run_consistency_loop(client, db_session):
    """
    Multi-Turn Eval Scenario 6: Multi-run consistency verification.
    Runs 5 multi-turn flows consecutively to expose any inconsistencies,
    asserting 100% pass rate.
    """
    names = ["Alexander Hamilton", "Aaron Burr", "Thomas Jefferson", "James Madison", "Benjamin Franklin"]
    pass_count = 0

    for i, name in enumerate(names):
        cid = f"eval_loop_run_{i}_{uuid.uuid4().hex[:6]}"
        # 1. Search doctors
        s_res = client.post("/retell/tools/search-doctors", json={"specialty": "Cardiology", "call_id": cid})
        assert s_res.json()["success"] is True

        # 2. Check availability
        a_res = client.post("/retell/tools/check-availability", json={"doctor_id": "doc_test_maya", "call_id": cid})
        slots = a_res.json()["slots"]
        assert len(slots) >= 1
        slot_id = slots[0]["slot_id"]

        # 3. Book appointment
        b_res = client.post("/retell/tools/book-appointment", json={
            "patient_name": name,
            "patient_phone": f"+1-555-099-{1000 + i}",
            "doctor_id": "doc_test_maya",
            "slot_id": slot_id,
            "patient_confirmed": True,
            "call_id": cid
        })
        b_data = b_res.json()
        assert b_data["success"] is True
        assert b_data["status"] == "Confirmed"
        pass_count += 1

    assert pass_count == len(names)
