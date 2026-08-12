"""Portfolio context agent — adjusts rationale using holdings."""

from __future__ import annotations

from src.agents.state import AgentState


def _note_for(action: str | None, position: dict | None, horizon: str) -> str:
    horizon_label = "단타(1-2일)" if horizon == "SHORT" else "장기"
    if position and float(position.get("quantity") or 0) > 0:
        qty = position["quantity"]
        avg_cost = position.get("avg_cost")
        if action == "BUY":
            return (
                f"[{horizon_label}] Already holding {qty} @ {avg_cost}. "
                "Treat BUY as add-on only if conviction remains high."
            )
        if action == "SELL":
            return (
                f"[{horizon_label}] Holding {qty} @ {avg_cost}. "
                "SELL aligns with reducing or exiting."
            )
        return f"[{horizon_label}] Holding {qty} @ {avg_cost}. HOLD keeps exposure unchanged."

    if action == "SELL":
        return f"[{horizon_label}] No open position; SELL is avoid/watch, not an exit order."
    if action == "BUY":
        return f"[{horizon_label}] No open position; BUY is a candidate new entry."
    return f"[{horizon_label}] No open position; remain on watch."


def portfolio_context(state: AgentState) -> dict:
    """Annotate each horizon signal with portfolio awareness (no orders)."""
    positions = {
        p["symbol"]: p for p in (state.get("portfolio_positions") or []) if p.get("symbol")
    }
    updated: list = []

    for item in state.get("symbols", []):
        symbol = item["symbol"]
        position = positions.get(symbol)
        signals = list(item.get("signals") or [])
        annotated: list = []
        for signal in signals:
            signal = dict(signal)
            horizon = signal.get("horizon") or "SHORT"
            signal["portfolio_note"] = _note_for(signal.get("action"), position, horizon)
            annotated.append(signal)

        primary = annotated[0] if annotated else dict(item.get("signal") or {})
        if primary and "portfolio_note" not in primary:
            primary["portfolio_note"] = _note_for(
                primary.get("action"), position, primary.get("horizon") or "SHORT"
            )

        updated.append(
            {
                **item,
                "signals": annotated,
                "signal": primary,
                "portfolio": position or {},
            }
        )

    return {"symbols": updated}
