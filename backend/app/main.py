from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.core.config import settings


def create_application() -> FastAPI:
    application = FastAPI(
        title="MediSage API",
        description="API for MediSage – Smart Prescription Analyzer",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS
    if settings.BACKEND_CORS_ORIGINS:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=[str(o) for o in settings.BACKEND_CORS_ORIGINS],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    application.include_router(api_router)
    if settings.API_V1_STR:
        application.include_router(api_router, prefix=settings.API_V1_STR)
    return application


app = create_application()


@app.on_event("startup")
def on_startup():
    """
    Ensure all DB tables exist on startup.
    In production use Alembic migrations; this is a safety-net for local dev
    and Docker Compose first-run without running 'alembic upgrade head'.
    """
    from app.db.session import engine
    from app.db.base import Base  # noqa: F401 – imports all models

    Base.metadata.create_all(bind=engine)
