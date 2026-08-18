"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Optional

from uuid import UUID as UuidType

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class Market(StrEnum):
    KR = "KR"
    US = "US"


class SignalAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class RunStatus(StrEnum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class RunMode(StrEnum):
    WATCHLIST = "watchlist"
    SCAN = "scan"


class SignalHorizon(StrEnum):
    SHORT = "SHORT"
    LONG = "LONG"


class SignalSource(StrEnum):
    WATCHLIST = "WATCHLIST"
    SCAN = "SCAN"


class WatchlistItem(Base):
    """Symbols to analyze on each run."""

    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("symbol", name="uq_watchlist_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    market: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AnalysisRun(Base):
    """One full analysis execution (watchlist or universe scan)."""

    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=RunStatus.RUNNING)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default=RunMode.WATCHLIST)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    signals: Mapped[list[Signal]] = relationship(back_populates="run", cascade="all, delete-orphan")


class Signal(Base):
    """Buy/Sell/Hold recommendation for a single symbol and horizon."""

    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("analysis_runs.id"), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    market: Mapped[str] = mapped_column(String(8), nullable=False)
    action: Mapped[str] = mapped_column(String(8), nullable=False)
    horizon: Mapped[str] = mapped_column(
        String(8), nullable=False, default=SignalHorizon.SHORT, index=True
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False, default=SignalSource.WATCHLIST)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    entry_hint: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    take_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    holding_period_hint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    run: Mapped[AnalysisRun] = relationship(back_populates="signals")


class PortfolioPosition(Base):
    """Per-user holdings used by the web portfolio screen."""

    __tablename__ = "portfolio_positions"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_portfolio_user_symbol"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[UuidType] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    market: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PortfolioCash(Base):
    """Per-user cash balance for the web portfolio screen."""

    __tablename__ = "portfolio_cash"

    user_id: Mapped[UuidType] = mapped_column(UUID(as_uuid=True), primary_key=True)
    cash_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
