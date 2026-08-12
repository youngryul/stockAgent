"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the stock analysis agent."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str = ""
    discord_webhook_url: str = ""
    database_url: str = "postgresql+psycopg2://stock:stock@localhost:5432/stockagent"
    llm_model: str = "gpt-4.1-mini"
    schedule_interval_minutes: int = 60
    discord_min_confidence: float = 0.6

    # Universe scan (단타/장기 추천)
    scan_short_top_n: int = 8
    scan_long_top_n: int = 8
    scan_min_avg_volume: float = 200_000.0
    scan_include_watchlist: bool = True
    schedule_mode: str = "scan"  # watchlist | scan | both


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
