"""
MiniHarvey backend — FastAPI entry point.
Structure mirrors MiniPerplexity's main.py.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.settings import settings
from app.api.v1.query_handler import router as query_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MiniHarvey",
    description="Indian Legal AI Research Assistant",
    version="1.0.0",
    docs_url="/docs" if settings.ENV == "dev" else None,
    redoc_url="/redoc" if settings.ENV == "dev" else None,
)

# CORS — same pattern as MiniPerplexity
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(query_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "env": settings.ENV}


@app.on_event("startup")
async def startup():
    logger.info("MiniHarvey starting — ENV=%s", settings.ENV)
    logger.info("Allowed origins: %s", settings.allowed_origins_list)
