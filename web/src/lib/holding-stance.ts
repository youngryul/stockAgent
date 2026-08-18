import type { Signal } from "@/lib/types";

export type HoldingStance = "add-buy" | "sell" | "new-buy";

export const HOLDING_STANCE_LABELS: Record<HoldingStance, string> = {
  "add-buy": "추가매수",
  sell: "매도",
  "new-buy": "신규매수",
};

export const HOLDING_STANCE_CARD: Record<HoldingStance, string> = {
  "add-buy": "border-buy/50 bg-buy/10",
  sell: "border-sell/50 bg-sell/10",
  "new-buy": "border-fresh/50 bg-fresh/10",
};

export const HOLDING_STANCE_BAR: Record<HoldingStance, string> = {
  "add-buy": "bg-buy",
  sell: "bg-sell",
  "new-buy": "bg-fresh",
};

export const HOLDING_STANCE_BADGE: Record<HoldingStance, string> = {
  "add-buy": "border-buy text-buy bg-buy/15",
  sell: "border-sell text-sell bg-sell/15",
  "new-buy": "border-fresh text-fresh bg-fresh/15",
};

/**
 * Classify a signal against the signed-in user's holdings.
 * Held BUY is add-on, held SELL is exit, unheld BUY is a new entry.
 * @param signal - Dashboard signal
 */
export function holdingStance(signal: Pick<Signal, "action" | "isHeld">): HoldingStance | null {
  if (signal.action === "BUY" && signal.isHeld) {
    return "add-buy";
  }
  if (signal.action === "SELL" && signal.isHeld) {
    return "sell";
  }
  if (signal.action === "BUY" && !signal.isHeld) {
    return "new-buy";
  }
  return null;
}

/**
 * Pick the row color for a symbol: sell first, then add-on buy, then new buy.
 * @param signals - Latest scan signals for one symbol
 */
export function groupHoldingStance(signals: Pick<Signal, "action" | "isHeld">[]): HoldingStance | null {
  if (signals.some((item) => holdingStance(item) === "sell")) {
    return "sell";
  }
  if (signals.some((item) => holdingStance(item) === "add-buy")) {
    return "add-buy";
  }
  if (signals.some((item) => holdingStance(item) === "new-buy")) {
    return "new-buy";
  }
  return null;
}
