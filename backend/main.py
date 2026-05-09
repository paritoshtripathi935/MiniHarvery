"""Vidhi backend — FastAPI entry point."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.settings import settings
from app.api.v1.document_handler import router as document_router
from app.api.v1.matter_handler import router as matter_router
from app.api.v1.query_handler import router as query_router
from app.api.v1.thread_handler import router as thread_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Vidhi",
    description="Indian legal research workbench — for working advocates.",
    version="1.0.0",
    docs_url="/docs" if settings.ENV == "dev" else None,
    redoc_url="/redoc" if settings.ENV == "dev" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(query_router, prefix="/api/v1")
app.include_router(thread_router, prefix="/api/v1")
app.include_router(matter_router, prefix="/api/v1")
app.include_router(document_router, prefix="/api/v1")


@app.get("/health")
async def health():
    """Liveness probe — process is up. See /api/v1/health for component status."""
    return {"status": "ok", "version": "1.0.0", "env": settings.ENV}


# Critical settings — empty values do not crash startup (Render env vars
# can propagate slowly), but we log a WARNing so a missed config is loud
# rather than surfacing as a confusing 401/503 on first traffic.
_CRITICAL_SETTINGS = (
    "DATABASE_URL",
    "CLERK_JWT_ISSUER",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
)


@app.on_event("startup")
async def startup():
    logger.info("Vidhi starting — ENV=%s", settings.ENV)
    logger.info("Allowed origins: %s", settings.allowed_origins_list)

    missing = [name for name in _CRITICAL_SETTINGS if not getattr(settings, name)]
    if missing:
        logger.warning(
            "Critical settings missing: %s — affected requests will return 503",
            ", ".join(missing),
        )
