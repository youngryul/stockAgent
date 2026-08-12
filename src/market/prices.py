"""OHLCV and fundamental snapshot helpers via yfinance."""

from __future__ import annotations

from typing import Any

import pandas as pd
import yfinance as yf


def fetch_ohlcv(symbol: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
    """Download OHLCV bars for a symbol."""
    ticker = yf.Ticker(symbol)
    history = ticker.history(period=period, interval=interval, auto_adjust=True)
    if history is None or history.empty:
        return pd.DataFrame()
    history = history.rename(columns=str.lower)
    return history[["open", "high", "low", "close", "volume"]].dropna()


def compute_technical_features(df: pd.DataFrame) -> dict[str, Any]:
    """Compute simple technical indicators from OHLCV."""
    if df.empty or len(df) < 30:
        return {"error": "insufficient_bars", "bars": int(len(df))}

    close = df["close"]
    volume = df["volume"]

    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean() if len(df) >= 50 else None
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))

    latest = close.iloc[-1]
    prev = close.iloc[-2]
    high_20 = df["high"].tail(20).max()
    low_20 = df["low"].tail(20).min()

    features: dict[str, Any] = {
        "last_close": round(float(latest), 4),
        "prev_close": round(float(prev), 4),
        "change_pct": round(float((latest / prev - 1) * 100), 3),
        "sma20": round(float(sma20.iloc[-1]), 4),
        "rsi14": round(float(rsi.iloc[-1]), 2) if pd.notna(rsi.iloc[-1]) else None,
        "macd": round(float(macd.iloc[-1]), 4),
        "macd_signal": round(float(signal.iloc[-1]), 4),
        "high_20": round(float(high_20), 4),
        "low_20": round(float(low_20), 4),
        "avg_volume_20": round(float(volume.tail(20).mean()), 2),
        "volume_last": round(float(volume.iloc[-1]), 2),
        "above_sma20": bool(latest > sma20.iloc[-1]),
    }
    if sma50 is not None and pd.notna(sma50.iloc[-1]):
        features["sma50"] = round(float(sma50.iloc[-1]), 4)
        features["above_sma50"] = bool(latest > sma50.iloc[-1])
    return features


def fetch_fundamental_snapshot(symbol: str) -> dict[str, Any]:
    """Pull a compact fundamental snapshot from yfinance info."""
    ticker = yf.Ticker(symbol)
    info = ticker.info or {}
    keys = [
        "longName",
        "sector",
        "industry",
        "marketCap",
        "trailingPE",
        "forwardPE",
        "priceToBook",
        "profitMargins",
        "returnOnEquity",
        "revenueGrowth",
        "earningsGrowth",
        "debtToEquity",
        "currentRatio",
        "dividendYield",
        "targetMeanPrice",
        "recommendationKey",
        "currency",
    ]
    snapshot = {key: info.get(key) for key in keys if info.get(key) is not None}
    snapshot["symbol"] = symbol
    return snapshot
