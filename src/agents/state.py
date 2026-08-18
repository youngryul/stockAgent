"""Shared LangGraph state and signal schemas."""

from __future__ import annotations

from typing import Any, Literal, Optional, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class AgentInsight(BaseModel):
    """Structured opinion from a specialist agent."""

    model_config = ConfigDict(extra="forbid")

    bias: Literal["bullish", "bearish", "neutral"] = "neutral"
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    summary: str = Field(default="", description="Short Korean summary")
    key_points: list[str] = Field(
        default_factory=list,
        description="Optional extra Korean bullets. Do not use a free-form object.",
    )


class TradeSignal(BaseModel):
    """Final trading recommendation for one symbol and horizon."""

    symbol: str
    name: str = ""
    market: Literal["KR", "US"]
    action: Literal["BUY", "SELL", "HOLD"]
    horizon: Literal["SHORT", "LONG"] = "SHORT"
    confidence: float = Field(ge=0.0, le=1.0)
    entry_hint: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    holding_period_hint: str = ""
    rationale: str
    news_summary: str = ""
    technical_summary: str = ""
    fundamental_summary: str = ""
    portfolio_note: str = ""
    source: Literal["WATCHLIST", "SCAN", "PORTFOLIO"] = "WATCHLIST"
    short_score: Optional[float] = None
    long_score: Optional[float] = None
    previous_action: Optional[str] = None
    previous_confidence: Optional[float] = None
    previous_at: Optional[str] = None
    change_summary: str = ""


class SymbolBundle(TypedDict, total=False):
    symbol: str
    market: str
    name: str
    horizons: list[str]
    short_score: float
    long_score: float
    source: str
    ohlcv_features: dict[str, Any]
    fundamentals: dict[str, Any]
    news: list[dict[str, Any]]
    news_insight: dict[str, Any]
    technical_insight: dict[str, Any]
    fundamental_insight: dict[str, Any]
    signals: list[dict[str, Any]]
    signal: dict[str, Any]
    portfolio: dict[str, Any]
    previous_by_horizon: dict[str, Any]


class AgentState(TypedDict, total=False):
    """LangGraph state for one analysis run."""

    run_id: int
    mode: str  # watchlist | scan
    symbols: list[SymbolBundle]
    portfolio_positions: list[dict[str, Any]]
    errors: list[str]
