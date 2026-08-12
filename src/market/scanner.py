"""Universe pre-scan: rank short-term and long-term candidates."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd
import yfinance as yf

from src.config import get_settings
from src.market.prices import compute_technical_features
from src.market.universe import UniverseSymbol, get_default_universe

logger = logging.getLogger(__name__)


def _safe_pct(latest: float, past: float) -> float | None:
    if past == 0:
        return None
    return round(float((latest / past - 1) * 100), 3)


def enrich_features(df: pd.DataFrame, base: dict[str, Any]) -> dict[str, Any]:
    """Add short/long horizon helpers on top of base technical features."""
    if df.empty or "error" in base:
        return base

    close = df["close"]
    volume = df["volume"]
    latest = float(close.iloc[-1])
    features = dict(base)

    if len(close) >= 3:
        features["ret_2d_pct"] = _safe_pct(latest, float(close.iloc[-3]))
    if len(close) >= 6:
        features["ret_5d_pct"] = _safe_pct(latest, float(close.iloc[-6]))
    if len(close) >= 21:
        features["ret_20d_pct"] = _safe_pct(latest, float(close.iloc[-21]))

    avg_vol = float(volume.tail(20).mean()) if len(volume) >= 20 else float(volume.mean())
    last_vol = float(volume.iloc[-1])
    features["volume_ratio"] = round(last_vol / avg_vol, 3) if avg_vol else None

    high_20 = float(df["high"].tail(20).max())
    features["dist_to_high_20_pct"] = round((latest / high_20 - 1) * 100, 3) if high_20 else None

    if len(close) >= 200:
        sma200 = float(close.rolling(200).mean().iloc[-1])
        features["sma200"] = round(sma200, 4)
        features["above_sma200"] = bool(latest > sma200)

    return features


def score_short_term(features: dict[str, Any]) -> float:
    """Higher = more attractive for 1–2 day swing/day-trade style entries."""
    if "error" in features:
        return -999.0

    score = 0.0
    rsi = features.get("rsi14")
    change = features.get("change_pct") or 0.0
    ret_2d = features.get("ret_2d_pct") or 0.0
    vol_ratio = features.get("volume_ratio") or 1.0
    dist_high = features.get("dist_to_high_20_pct")
    macd = features.get("macd")
    macd_signal = features.get("macd_signal")

    # Momentum without extreme overbought
    if rsi is not None:
        if 45 <= rsi <= 68:
            score += 2.0
        elif 68 < rsi <= 75:
            score += 0.5
        elif rsi > 80:
            score -= 1.5
        elif rsi < 35:
            score += 0.8  # mean-reversion bounce candidate

    if change > 0:
        score += min(change, 5.0) * 0.25
    if ret_2d and ret_2d > 0:
        score += min(ret_2d, 8.0) * 0.15

    if vol_ratio >= 1.5:
        score += 1.5
    elif vol_ratio >= 1.2:
        score += 0.8

    if dist_high is not None and -3.0 <= dist_high <= 0.5:
        score += 1.2  # near breakout / holding highs

    if macd is not None and macd_signal is not None and macd > macd_signal:
        score += 1.0

    if features.get("above_sma20"):
        score += 0.5

    return round(score, 3)


def score_long_term(features: dict[str, Any]) -> float:
    """Higher = more attractive for multi-month / long-term hold candidates."""
    if "error" in features:
        return -999.0

    score = 0.0
    ret_20d = features.get("ret_20d_pct") or 0.0
    rsi = features.get("rsi14")

    if features.get("above_sma50"):
        score += 1.5
    if features.get("above_sma200"):
        score += 2.0
    elif "sma200" in features and not features.get("above_sma200"):
        score -= 1.0

    if features.get("above_sma20"):
        score += 0.5

    # Prefer constructive but not parabolic 20d moves
    if 0 <= ret_20d <= 15:
        score += 1.2
    elif ret_20d > 25:
        score -= 0.8
    elif ret_20d < -15:
        score -= 1.0

    if rsi is not None and 40 <= rsi <= 65:
        score += 1.0

    avg_vol = features.get("avg_volume_20") or 0
    if avg_vol >= 500_000:
        score += 0.5

    return round(score, 3)


def _download_batch(symbols: list[str], period: str = "1y") -> dict[str, pd.DataFrame]:
    """Download OHLCV for many tickers in one yfinance call."""
    if not symbols:
        return {}

    data = yf.download(
        tickers=" ".join(symbols),
        period=period,
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        threads=True,
        progress=False,
    )
    frames: dict[str, pd.DataFrame] = {}
    if data is None or data.empty:
        return frames

    # Single ticker: columns are OHLCV directly
    if len(symbols) == 1:
        sym = symbols[0]
        df = data.copy()
        df.columns = [str(c).lower() for c in df.columns]
        cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
        frames[sym] = df[cols].dropna()
        return frames

    for sym in symbols:
        try:
            if sym not in data.columns.get_level_values(0):
                continue
            df = data[sym].copy()
            df.columns = [str(c).lower() for c in df.columns]
            cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
            if not cols:
                continue
            cleaned = df[cols].dropna()
            if not cleaned.empty:
                frames[sym] = cleaned
        except Exception as exc:  # noqa: BLE001
            logger.debug("Failed to slice %s: %s", sym, exc)
    return frames


def scan_universe(
    universe: list[UniverseSymbol] | None = None,
    short_top_n: int | None = None,
    long_top_n: int | None = None,
    min_avg_volume: float | None = None,
) -> list[dict[str, Any]]:
    """
    Rank the universe and return candidates for deep LLM analysis.

    Each item includes `horizons`: list containing "SHORT" and/or "LONG".
    """
    settings = get_settings()
    universe = universe or get_default_universe()
    short_top_n = short_top_n if short_top_n is not None else settings.scan_short_top_n
    long_top_n = long_top_n if long_top_n is not None else settings.scan_long_top_n
    min_avg_volume = (
        min_avg_volume if min_avg_volume is not None else settings.scan_min_avg_volume
    )

    symbols = [u["symbol"] for u in universe]
    meta = {u["symbol"]: u for u in universe}
    frames = _download_batch(symbols)

    scored: list[dict[str, Any]] = []
    for sym, meta_row in meta.items():
        df = frames.get(sym)
        if df is None or df.empty:
            continue
        features = enrich_features(df, compute_technical_features(df))
        if "error" in features:
            continue
        avg_vol = float(features.get("avg_volume_20") or 0)
        if avg_vol < min_avg_volume:
            continue
        short_score = score_short_term(features)
        long_score = score_long_term(features)
        scored.append(
            {
                "symbol": sym,
                "market": meta_row["market"],
                "name": meta_row["name"],
                "ohlcv_features": features,
                "short_score": short_score,
                "long_score": long_score,
            }
        )

    short_ranked = sorted(scored, key=lambda x: x["short_score"], reverse=True)[:short_top_n]
    long_ranked = sorted(scored, key=lambda x: x["long_score"], reverse=True)[:long_top_n]

    merged: dict[str, dict[str, Any]] = {}
    for item in short_ranked:
        row = dict(item)
        row["horizons"] = ["SHORT"]
        merged[item["symbol"]] = row
    for item in long_ranked:
        if item["symbol"] in merged:
            if "LONG" not in merged[item["symbol"]]["horizons"]:
                merged[item["symbol"]]["horizons"].append("LONG")
        else:
            row = dict(item)
            row["horizons"] = ["LONG"]
            merged[item["symbol"]] = row

    result = list(merged.values())
    logger.info(
        "Universe scan: %s symbols scored, short_top=%s long_top=%s deep=%s",
        len(scored),
        short_top_n,
        long_top_n,
        len(result),
    )
    return result
