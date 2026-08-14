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
                f"[{horizon_label}] 이미 {qty}주 보유 중 (평균단가 {avg_cost}). "
                "확신이 높을 때만 추가 매수를 검토하세요."
            )
        if action == "SELL":
            return (
                f"[{horizon_label}] {qty}주 보유 중 (평균단가 {avg_cost}). "
                "매도는 축소 또는 청산과 맞습니다."
            )
        return f"[{horizon_label}] {qty}주 보유 중 (평균단가 {avg_cost}). 관망 시 비중은 유지됩니다."

    if action == "SELL":
        return f"[{horizon_label}] 보유 포지션 없음. 매도는 청산이 아니라 회피/관찰 신호입니다."
    if action == "BUY":
        return f"[{horizon_label}] 보유 포지션 없음. 매수는 신규 진입 후보입니다."
    return f"[{horizon_label}] 보유 포지션 없음. 관찰을 유지하세요."


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
