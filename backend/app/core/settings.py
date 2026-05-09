from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Cloudflare Workers AI. Accept either CLOUDFLARE_API_TOKEN or
    # CLOUDFLARE_API_KEY in .env — we prefer TOKEN but stay compatible.
    CLOUDFLARE_API_TOKEN: str = Field(
        default="",
        validation_alias=AliasChoices("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY"),
    )
    CLOUDFLARE_ACCOUNT_ID: str = ""
    CLOUDFLARE_LLM_MODEL: str = "@cf/meta/llama-3.1-70b-instruct"

    # Indian legal search
    INDIAN_KANOON_API_TOKEN: str = ""

    # Google Custom Search + YouTube Data API
    # YOUTUBE_API_KEY falls back to GOOGLE_API_KEY if not set (same GCP key can serve both).
    GOOGLE_API_KEY: str = ""
    GOOGLE_SEARCH_CX: str = ""
    YOUTUBE_API_KEY: str = ""

    # Auth
    CLERK_SECRET_KEY: str = ""
    # Clerk JWT issuer — the `iss` claim every Clerk session token carries.
    # Find it under Clerk dashboard → API Keys → "Show JWT public key" → issuer URL.
    # Looks like `https://amazing-bird-12.clerk.accounts.dev` (no trailing slash).
    # REQUIRED — the API refuses every request with 503 when this is empty.
    CLERK_JWT_ISSUER: str = ""
    CLERK_JWKS_TTL_SECONDS: int = 3600

    # App config
    ENV: str = "dev"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    SESSION_TTL_SECONDS: int = 600
    RATE_LIMIT_CALLS_PER_MIN: int = 30
    MAX_SEARCH_RESULTS: int = 10

    # Neon Postgres. Empty string ⇒ in-memory fallback (offline dev).
    # DATABASE_URL is the pooled connection (PgBouncer) for the running app.
    # DATABASE_URL_UNPOOLED is the direct connection for Alembic migrations.
    DATABASE_URL: str = ""
    DATABASE_URL_UNPOOLED: str = ""
    DB_POOL_SIZE: int = 5
    DB_POOL_OVERFLOW: int = 10
    IS_DB_ECHO_LOG: bool = False

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def db_enabled(self) -> bool:
        return bool(self.DATABASE_URL)

    @property
    def async_database_url(self) -> str:
        """SQLAlchemy async URL — swaps the postgresql:// driver for asyncpg."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg doesn't understand libpq query params — strip the ones
        # Neon adds (sslmode, channel_binding). SSL is enabled separately
        # via connect_args={"ssl": True} when we build the engine.
        if "?" in url:
            url = url.split("?", 1)[0]
        return url

    @property
    def sync_database_url(self) -> str:
        """Sync URL for Alembic — uses psycopg2-style driver."""
        return self.DATABASE_URL_UNPOOLED or self.DATABASE_URL

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
