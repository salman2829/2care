from app.config import settings


def test_retell_search_doctors(client):
    """Test Retell custom function: search_doctors by specialty."""
    # 1. Search for Cardiology
    res = client.post("/retell/tools/search-doctors", json={"specialty": "Cardiology"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["doctors"]) >= 1
    assert data["doctors"][0]["specialty"] == "Cardiology"
    assert "Dr. Maya Chen" in data["message"]

    # 2. Search for unknown specialty
    res_none = client.post("/retell/tools/search-doctors", json={"specialty": "Neurosurgery"})
    assert res_none.status_code == 200
    assert res_none.json()["success"] is False
    assert "could not find any active care providers" in res_none.json()["message"]


def test_retell_check_availability(client):
    """Test Retell custom function: check_availability returns real slots with voice formatting."""
    res = client.post("/retell/tools/check-availability", json={"specialty": "Cardiology"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["slots"]) >= 1
    slot = data["slots"][0]
    assert "slot_id" in slot
    assert "date" in slot
    assert "time" in slot
    assert "openings available" in data["message"]


def test_retell_book_appointment_unconfirmed(client):
    """Test voice booking requires explicit verbal confirmation before reserving."""
    payload = {
        "patient_name": "Eleanor Vance",
        "patient_phone": "+1-555-019-9944",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_0",
        "patient_confirmed": False
    }
    res = client.post("/retell/tools/book-appointment", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["status"] == "Unconfirmed"
    assert "could you please confirm" in data["spoken_summary"].lower()


def test_retell_book_appointment_success(client):
    """Test successful voice appointment booking returning conversational confirmation."""
    payload = {
        "patient_name": "Hannah Abbott",
        "patient_phone": "+1-555-014-7722",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_1",
        "specialty": "Cardiology",
        "patient_confirmed": True
    }
    res = client.post("/retell/tools/book-appointment", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["status"] == "Confirmed"
    assert data["reference_id"].startswith("2C-")
    assert "Hannah Abbott" in data["spoken_summary"]
    assert "Dr. Maya Chen" in data["spoken_summary"]


def test_retell_book_appointment_slot_conflict(client):
    """Test voice booking handles unavailable slots gracefully with polite fallback speech."""
    # Book once
    payload = {
        "patient_name": "First Caller",
        "patient_phone": "+1-555-011-1111",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_2",
        "patient_confirmed": True
    }
    client.post("/retell/tools/book-appointment", json=payload)

    # Book same slot again
    payload_dup = {
        "patient_name": "Second Caller",
        "patient_phone": "+1-555-022-2222",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_2",
        "patient_confirmed": True
    }
    res = client.post("/retell/tools/book-appointment", json=payload_dup)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["status"] == "Conflict"
    assert "specific slot was just booked" in data["spoken_summary"]


def test_retell_book_appointment_invalid_doctor(client):
    """Test booking failure when provider does not exist."""
    payload = {
        "patient_name": "Caller",
        "patient_phone": "+1-555-010-0000",
        "doctor_id": "doc_non_existent",
        "slot_id": "slot_test_m_3",
        "patient_confirmed": True
    }
    res = client.post("/retell/tools/book-appointment", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["status"] == "Failed"


def test_retell_get_appointment(client):
    """Test Retell custom function: get_appointment by reference ID."""
    # First book an appointment to retrieve
    book_res = client.post("/retell/tools/book-appointment", json={
        "patient_name": "Oliver Twist",
        "patient_phone": "+1-555-018-8833",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_3",
        "patient_confirmed": True
    })
    ref_id = book_res.json()["reference_id"]

    # Inquire via voice tool
    res = client.post("/retell/tools/get-appointment", json={"reference_id": ref_id})
    assert res.status_code == 200
    data = res.json()
    assert data["found"] is True
    assert data["reference_id"] == ref_id
    assert "Oliver Twist" in data["spoken_summary"]
    assert "Dr. Maya Chen" in data["spoken_summary"]

    # Inquire with non-existent ref
    res_404 = client.post("/retell/tools/get-appointment", json={"reference_id": "2C-99999"})
    assert res_404.status_code == 200
    assert res_404.json()["found"] is False


def test_retell_webhook_ingestion(client):
    """Test webhook ingestion for call completion and masked phone numbers."""
    webhook_payload = {
        "event": "call_ended",
        "call": {
            "call_id": "CA-TEST-1001",
            "caller_phone": "+1-555-019-9944",
            "agent_id": "agent_voice_ops",
            "direction": "inbound",
            "duration_ms": 132000,
            "call_status": "completed",
            "transcript": "Agent: Thank you for calling 2care. Caller: I need an appointment.",
            "tool_calls": [
                {"tool": "check_availability", "args": {"specialty": "Cardiology"}, "output": "found 4 slots"}
            ]
        }
    }
    res = client.post("/retell/webhook", json=webhook_payload)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # Verify call appears in call logs with masked phone
    calls_res = client.get("/retell/calls")
    assert calls_res.status_code == 200
    call = next(c for c in calls_res.json() if c["call_id"] == "CA-TEST-1001")
    assert call["duration_seconds"] == 132
    assert call["caller_phone"] == "+1--***-***-9944" or "***" in call["caller_phone"]


def test_retell_sync_call_endpoint(client):
    """Test sync-call endpoint directly recording voice call and linking appointment."""
    # 1. Book an appointment
    book_res = client.post("/retell/tools/book-appointment", json={
        "patient_name": "Marcus Aurelius",
        "patient_phone": "+1-555-012-3344",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_4",
        "patient_confirmed": True
    })
    assert book_res.status_code == 200
    ref_id = book_res.json()["reference_id"]

    # 2. Call sync-call endpoint with transcript containing the reference
    sync_res = client.post("/retell/sync-call", json={
        "call_id": "call_sync_test_99",
        "transcript": f"Agent: Your appointment is confirmed! Your reference code is {ref_id}.\nCaller: Thank you!",
        "duration_seconds": 65,
        "caller_phone": "+1-555-012-3344"
    })
    assert sync_res.status_code == 200
    data = sync_res.json()
    assert data["success"] is True
    assert data["call_log"]["call_id"] == "call_sync_test_99"
    assert data["call_log"]["duration_seconds"] == 65
    assert data["appointment"] is not None
    assert data["appointment"]["reference_id"] == ref_id
    assert data["appointment"]["patient_name"] == "Marcus Aurelius"

