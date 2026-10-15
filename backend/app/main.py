import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal, get_db
from app.seed import seed_database
from app.routers import health, doctors, availability, appointments, stats, retell_tools, patients
from app.models import CallLog

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("2care-api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context: initialize database tables and seed fictional records."""
    logger.info("Initializing 2care database tables...")
    Base.metadata.create_all(bind=engine)
    
    # Run seed
    with SessionLocal() as db:
        try:
            seed_database(db)
        except Exception as e:
            logger.error(f"Seeding error: {e}")

    # Auto-sync Cloudflare tunnel and Retell Voice Agent tools only in local dev
    if settings.ENVIRONMENT != "production" and settings.RETELL_API_KEY and settings.RETELL_AGENT_ID:
        import threading
        from app.services.tunnel_sync import start_cloudflared_tunnel
        threading.Thread(target=start_cloudflared_tunnel, kwargs={"local_port": 8000}, daemon=True).start()

    logger.info("2care AI Operations API startup complete.")
    yield
    logger.info("2care AI Operations API shutdown.")


app = FastAPI(
    title="2care — AI Healthcare Operations Command Center API",
    description="Backend services for autonomous voice booking, provider availability, and clinical operations.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware supporting wildcard regex with credentials for Vercel, localhost, and custom domains
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root endpoint for cloud health checks (Render, Fly, AWS, etc.)
@app.get("/")
@app.head("/")
def root():
    return {"status": "healthy", "service": "2care-operations-api", "version": "1.0.0"}


# Mount Routers both with /api prefix and root for flexibility
app.include_router(health.router)
app.include_router(health.router, prefix="/api")

app.include_router(doctors.router)
app.include_router(doctors.router, prefix="/api")

app.include_router(availability.router)
app.include_router(availability.router, prefix="/api")

app.include_router(appointments.router)
app.include_router(appointments.router, prefix="/api")

app.include_router(stats.router)
app.include_router(stats.router, prefix="/api")

app.include_router(retell_tools.router)
app.include_router(retell_tools.router, prefix="/api")

app.include_router(patients.router)
app.include_router(patients.router, prefix="/api")

# Convenience aliases for frontend call log inspection
@app.get("/calls", response_model=list)
@app.get("/api/calls", response_model=list)
def get_calls_alias(db: Session = Depends(get_db)):
    from sqlalchemy import select
    stmt = select(CallLog).order_by(CallLog.created_at.desc()).limit(50)
    return db.execute(stmt).scalars().all()



@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred in 2care operations."}
    )
