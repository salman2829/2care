def test_get_doctors(client):
    """Test retrieving care providers with calculated slot metrics."""
    response = client.get("/doctors")
    assert response.status_code == 200
    doctors = response.json()
    assert len(doctors) >= 2
    
    maya = next(d for d in doctors if d["id"] == "doc_test_maya")
    assert maya["name"] == "Dr. Maya Chen"
    assert maya["specialty"] == "Cardiology"
    assert maya["slots_count"] >= 5
    assert maya["next_slot"] is not None


def test_get_availability(client):
    """Test querying availability with doctor and specialty filtering."""
    # All open slots
    response = client.get("/availability")
    assert response.status_code == 200
    slots = response.json()
    assert len(slots) >= 7

    # Filter by doctor
    doc_response = client.get("/availability?doctor_id=doc_test_elias")
    assert doc_response.status_code == 200
    elias_slots = doc_response.json()
    assert len(elias_slots) == 2
    assert all(s["doctor_id"] == "doc_test_elias" for s in elias_slots)

    # Filter by specialty
    spec_response = client.get("/availability?specialty=cardiology")
    assert spec_response.status_code == 200
    cardio_slots = spec_response.json()
    assert len(cardio_slots) == 5
