import os
import sys
from pathlib import Path
from datetime import timedelta
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import Base, get_db
from app.models import Doctor, DoctorSlot, utc_now
from app.main import app

TEST_DB_PATH = backend_dir / "test_ops.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_PATH}"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function", autouse=True)
def clean_database():
    """Ensure every test runs on a fresh, isolated database schema and seed data."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    with TestingSessionLocal() as db:
        d1 = Doctor(
            id="doc_test_maya",
            name="Dr. Maya Chen",
            initials="MC",
            specialty="Cardiology",
            color="cyan",
            is_active=True
        )
        d2 = Doctor(
            id="doc_test_elias",
            name="Dr. Elias Reed",
            initials="ER",
            specialty="Dermatology",
            color="mint",
            is_active=True
        )
        db.add_all([d1, d2])
        db.flush()

        now = utc_now().replace(minute=0, second=0, microsecond=0)
        # 5 slots for d1
        for i in range(5):
            st = now + timedelta(days=1, hours=i * 2)
            et = st + timedelta(minutes=45)
            s = DoctorSlot(
                id=f"slot_test_m_{i}",
                doctor_id="doc_test_maya",
                start_time=st,
                end_time=et,
                is_booked=False
            )
            db.add(s)

        # 2 slots for d2
        for i in range(2):
            st = now + timedelta(days=1, hours=i * 2)
            et = st + timedelta(minutes=45)
            s = DoctorSlot(
                id=f"slot_test_e_{i}",
                doctor_id="doc_test_elias",
                start_time=st,
                end_time=et,
                is_booked=False
            )
            db.add(s)

        db.commit()

    yield

    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
