import pytest


def test_valid_appointment_booking(client):
    """Test successful appointment booking with valid input."""
    payload = {
        "patient_name": "Eleanor Vance",
        "patient_phone": "+1-555-019-9944",
        "patient_email": "eleanor.v@example.com",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_0",
        "source": "AI Voice",
        "notes": "Initial consultation."
    }
    response = client.post("/appointments", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["patient_name"] == "Eleanor Vance"
    assert data["reference_id"].startswith("2C-")
    assert data["status"] == "Confirmed"
    assert data["slot_id"] == "slot_test_m_0"
    assert data["specialty"] == "Cardiology"

    # Verify slot is now booked in availability
    avail_res = client.get("/availability?doctor_id=doc_test_maya")
    remaining_slots = [s["id"] for s in avail_res.json()]
    assert "slot_test_m_0" not in remaining_slots


def test_invalid_slot_booking(client):
    """Test booking with non-existent slot returns HTTP 404."""
    payload = {
        "patient_name": "Arthur Pendelton",
        "patient_phone": "+1-555-018-2233",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_non_existent_999",
        "source": "Portal"
    }
    response = client.post("/appointments", json=payload)
    assert response.status_code == 404
    assert "not exist" in response.json()["detail"].lower()


def test_slot_doctor_mismatch(client):
    """Test booking when slot belongs to another doctor returns HTTP 400."""
    payload = {
        "patient_name": "Arthur Pendelton",
        "patient_phone": "+1-555-018-2233",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_e_0",  # belongs to doc_test_elias
        "source": "Portal"
    }
    response = client.post("/appointments", json=payload)
    assert response.status_code == 400
    assert "does not belong" in response.json()["detail"].lower()


def test_duplicate_slot_booking_conflict(client):
    """Test that attempting to book an already-booked slot returns HTTP 409 Conflict."""
    # First booking succeeds
    payload1 = {
        "patient_name": "First Caller",
        "patient_phone": "+1-555-011-1111",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_1",
        "source": "AI Voice"
    }
    res1 = client.post("/appointments", json=payload1)
    assert res1.status_code == 201

    # Second booking for the same slot must fail with 409
    payload2 = {
        "patient_name": "Second Caller",
        "patient_phone": "+1-555-022-2222",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_1",
        "source": "Portal"
    }
    res2 = client.post("/appointments", json=payload2)
    assert res2.status_code == 409
    assert "already booked" in res2.json()["detail"].lower()


def test_invalid_input_validation(client):
    """Test validation errors on empty name or too short phone number."""
    # Empty patient name
    res_name = client.post("/appointments", json={
        "patient_name": "   ",
        "patient_phone": "+1-555-019-9944",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_2"
    })
    assert res_name.status_code == 422

    # Invalid phone (fewer than 7 digits)
    res_phone = client.post("/appointments", json={
        "patient_name": "Valid Name",
        "patient_phone": "123",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_2"
    })
    assert res_phone.status_code == 422


def test_appointment_cancellation_and_slot_release(client):
    """Test atomic appointment cancellation releases slot back to availability."""
    # 1. Book slot
    book_res = client.post("/appointments", json={
        "patient_name": "Cancel Candidate",
        "patient_phone": "+1-555-099-8877",
        "doctor_id": "doc_test_maya",
        "slot_id": "slot_test_m_3",
        "source": "Portal"
    })
    assert book_res.status_code == 201
    apt = book_res.json()
    apt_id = apt["id"]
    ref_id = apt["reference_id"]

    # 2. Cancel appointment
    cancel_res = client.post(f"/appointments/{apt_id}/cancel")
    assert cancel_res.status_code == 200
    cancel_data = cancel_res.json()
    assert cancel_data["appointment"]["status"] == "Cancelled"

    # 3. Verify slot is available again
    avail_res = client.get("/availability?doctor_id=doc_test_maya")
    open_slot_ids = [s["id"] for s in avail_res.json()]
    assert "slot_test_m_3" in open_slot_ids

    # 4. Duplicate cancellation fails with 400
    dup_cancel = client.post(f"/appointments/{apt_id}/cancel")
    assert dup_cancel.status_code == 400
    assert "already cancelled" in dup_cancel.json()["detail"].lower()
