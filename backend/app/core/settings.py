from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Cloudflare AI (same as MiniPerplexity).
    # Accept either CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY in .env —
    # MiniPerplexity uses the latter; we prefer TOKEN but stay compatible.
    CLOUDFLARE_API_TOKEN: str = Field(
        default="",
        validation_alias=AliasChoices("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY"),
    )
    CLOUDFLARE_ACCOUNT_ID: str = ""

    # Indian legal search
    INDIAN_KANOON_API_TOKEN: str = ""

    # Google Custom Search + YouTube Data API
    # YOUTUBE_API_KEY falls back to GOOGLE_API_KEY if not set (same GCP key can serve both).
    GOOGLE_API_KEY: str = ""
    GOOGLE_SEARCH_CX: str = ""
    YOUTUBE_API_KEY: str = ""

    # Auth
    CLERK_SECRET_KEY: str = ""

    # App config
    ENV: str = "dev"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    SESSION_TTL_SECONDS: int = 600
    RATE_LIMIT_CALLS_PER_MIN: int = 30
    MAX_SEARCH_RESULTS: int = 10

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
