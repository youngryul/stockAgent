type HeldPosition = {
  quantity: number;
  avgCost: number;
};

/**
 * Build a Korean portfolio note for one signal using the signed-in user's holdings.
 * @param action - BUY, SELL, or HOLD
 * @param horizon - SHORT or LONG
 * @param position - Matching holding, if any
 */
export function portfolioNoteFor(
  action: string,
  horizon: string,
  position: HeldPosition | undefined,
): string {
  const horizonLabel = horizon === "LONG" ? "장기" : "단타(1-2일)";
  if (position && position.quantity > 0) {
    const qty = position.quantity;
    const avgCost = position.avgCost;
    if (action === "BUY") {
      return `[${horizonLabel}] 이미 ${qty}주 보유 중 (평균단가 ${avgCost}). 확신이 높을 때만 추가 매수를 검토하세요.`;
    }
    if (action === "SELL") {
      return `[${horizonLabel}] ${qty}주 보유 중 (평균단가 ${avgCost}). 매도는 축소 또는 청산과 맞습니다.`;
    }
    return `[${horizonLabel}] ${qty}주 보유 중 (평균단가 ${avgCost}). 관망 시 비중은 유지됩니다.`;
  }
  if (action === "SELL") {
    return `[${horizonLabel}] 보유 포지션 없음. 매도는 청산이 아니라 회피/관찰 신호입니다.`;
  }
  if (action === "BUY") {
    return `[${horizonLabel}] 보유 포지션 없음. 매수는 신규 진입 후보입니다.`;
  }
  return `[${horizonLabel}] 보유 포지션 없음. 관찰을 유지하세요.`;
}
