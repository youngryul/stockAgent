"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
import re
from functools import lru_cache
from urllib.parse import quote, unquote, urlparse, urlunparse

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DIRECT_SUPABASE_HOST = re.compile(r"^db\.([a-z0-9]+)\.supabase\.co$", re.IGNORECASE)


def _rewrite_supabase_direct_to_pooler(value: str) -> str:
    """Map IPv6-only db.*.supabase.co hosts to the IPv4 session pooler.

    Docker Desktop often cannot resolve the direct hostname (NXDOMAIN / no A record).
    """
    parsed = urlparse(value)
    host = parsed.hostname or ""
    match = _DIRECT_SUPABASE_HOST.match(host)
    if not match:
        return value

    project_ref = match.group(1)
    region = (os.environ.get("SUPABASE_REGION") or "ap-northeast-2").strip()
    username = unquote(parsed.username or "postgres")
    password = unquote(parsed.password or "")
    if username == "postgres":
        username = f"postgres.{project_ref}"

    netloc = (
        f"{quote(username, safe='')}:{quote(password, safe='')}"
        f"@aws-0-{region}.pooler.supabase.com:5432"
    )
    return urlunparse(
        (parsed.scheme, netloc, parsed.path or "/postgres", "", parsed.query, parsed.fragment)
    )


def normalize_database_url(url: str) -> str:
    """Convert a Postgres URI into SQLAlchemy form and reject the https Project URL."""
    value = (url or "").strip().strip('"').strip("'")
    if value.startswith("https://") or value.startswith("http://"):
        raise ValueError(
            "DATABASE_URL must be the Postgres URI from Supabase → Settings → Database, "
            "not the https Project URL from Settings → API. "
            "Use Session pooler: postgresql+psycopg2://postgres.xxxx:PASSWORD@"
            "aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
        )
    if value.startswith("postgresql://"):
        value = "postgresql+psycopg2://" + value[len("postgresql://") :]
    elif value.startswith("postgres://"):
        value = "postgresql+psycopg2://" + value[len("postgres://") :]
    value = _rewrite_supabase_direct_to_pooler(value)
    if "supabase.co" in value and "sslmode=" not in value:
        joiner = "&" if "?" in value else "?"
        value = f"{value}{joiner}sslmode=require"
    if "pooler.supabase.com" in value and "sslmode=" not in value:
        joiner = "&" if "?" in value else "?"
        value = f"{value}{joiner}sslmode=require"
    return value


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

    scan_short_top_n: int = 8
    scan_long_top_n: int = 8
    scan_min_avg_volume: float = 200_000.0
    scan_include_watchlist: bool = True
    schedule_mode: str = "scan"

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        return normalize_database_url(str(value or ""))


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
