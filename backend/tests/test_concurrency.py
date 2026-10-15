import concurrent.futures
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from tests.conftest import TestingSessionLocal


def test_concurrent_booking_attempts():
    """
    Simulate multiple callers simultaneously attempting to book the exact same slot.
    Verifies that atomic conditional slot update and database constraints ensure
    strictly one caller succeeds (HTTP 201) and all others receive HTTP 409 Conflict.
    """
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    target_slot = "slot_test_m_4"
    concurrency_count = 8

    def attempt_booking(caller_idx: int):
        with TestClient(app) as client:
            payload = {
                "patient_name": f"Concurrent Caller {caller_idx}",
                "patient_phone": f"+1-555-010-000{caller_idx}",
                "doctor_id": "doc_test_maya",
                "slot_id": target_slot,
                "source": "AI Voice"
            }
            return client.post("/appointments", json=payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency_count) as executor:
        futures = [executor.submit(attempt_booking, i) for i in range(concurrency_count)]
        responses = [f.result() for f in concurrent.futures.as_completed(futures)]

    status_codes = [r.status_code for r in responses]
    successes = [r for r in responses if r.status_code == 201]
    conflicts = [r for r in responses if r.status_code == 409]

    # Exactly 1 booking MUST succeed
    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}: {status_codes}"
    # All others MUST be rejected with HTTP 409 Conflict
    assert len(conflicts) == concurrency_count - 1, f"Expected {concurrency_count - 1} conflicts, got {len(conflicts)}: {status_codes}"

    app.dependency_overrides.clear()
