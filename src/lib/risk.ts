// Risk management library — enforces safe-investment rules
// All functions are pure (no side effects) so they're easy to test.

import type { CompositeSignal } from "./patterns";

export interface SafeSignal {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0-100
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: number;
  price: number;
  reasons: string[];
  aiSummary?: string;
}

export interface RiskConfig {
  minConfidence: number; // default 75
  minRiskReward: number; // default 2.5
  maxPositionPct: number; // % of capital per trade, default 8
  capital: number; // total virtual capital, default 1_000_000
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  minConfidence: 75,
  minRiskReward: 2.5,
  maxPositionPct: 8,
  capital: 1_000_000,
};

// ---------- Signal safety filter ----------
// Returns null if signal fails any of the safety rules.
export function filterSafeSignal(
  sig: CompositeSignal & { symbol: string; price: number; aiSummary?: string },
  config: RiskConfig = DEFAULT_RISK_CONFIG
): SafeSignal | null {
  // Only BUY signals are "safe" — SELL signals are for exiting, not initiating.
  if (sig.action !== "BUY") return null;

  // Confidence must be high
  if (sig.confidence < config.minConfidence) return null;

  // Must have entry, stop, target
  if (
    sig.entry === undefined ||
    sig.stopLoss === undefined ||
    sig.target === undefined
  ) {
    return null;
  }

  const risk = Math.abs(sig.entry - sig.stopLoss);
  const reward = Math.abs(sig.target - sig.entry);
  if (risk <= 0) return null;
  const rr = reward / risk;
  if (rr < config.minRiskReward) return null;

  // Stop loss must be within reasonable distance (max 8% from entry — avoid
  // catastrophic single-trade loss)
  const stopPct = (risk / sig.entry) * 100;
  if (stopPct > 8) return null;

  return {
    symbol: sig.symbol,
    action: sig.action,
    confidence: sig.confidence,
    entry: sig.entry,
    stopLoss: sig.stopLoss,
    target: sig.target,
    riskReward: rr,
    price: sig.price,
    reasons: sig.reasons,
    aiSummary: sig.aiSummary,
  };
}

// ---------- Position sizing ----------
// Given safe signal + capital, compute qty + risk amount + position value.
export interface PositionSize {
  qty: number;
  positionValue: number;
  riskAmount: number; // max loss if stop hits
  rewardAmount: number; // profit if target hits
  positionPct: number; // % of capital
  riskPct: number; // % of capital at risk
}

export function computePositionSize(
  sig: SafeSignal,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PositionSize {
  const maxRisk = config.capital * (config.maxPositionPct / 100) * 0.3; // risk only 30% of position size
  const riskPerShare = Math.abs(sig.entry - sig.stopLoss);
  let qty = Math.floor(maxRisk / riskPerShare);

  // Cap by max position size
  const maxPositionValue = config.capital * (config.maxPositionPct / 100);
  const maxQtyByValue = Math.floor(maxPositionValue / sig.entry);
  if (qty > maxQtyByValue) qty = maxQtyByValue;

  // Min 1 share if affordable
  if (qty < 1 && sig.entry <= config.capital) qty = 1;

  const positionValue = qty * sig.entry;
  const riskAmount = qty * riskPerShare;
  const rewardAmount = qty * Math.abs(sig.target - sig.entry);

  return {
    qty,
    positionValue,
    riskAmount,
    rewardAmount,
    positionPct: (positionValue / config.capital) * 100,
    riskPct: (riskAmount / config.capital) * 100,
  };
}

// ---------- Diversification check ----------
// Don't open a new position if user already has too many in the same sector.
export function isDiversified(
  newSymbol: string,
  existingPositions: { symbol: string; sector?: string }[],
  maxPerSector = 2
): boolean {
  // We don't have sector info per scrip here directly; treat symbol prefix as
  // sector proxy (e.g., "ENGRO-AUG" → "ENGRO"). This avoids concentrating too
  // much in one underlying.
  const newBase = newSymbol.split("-")[0];
  const count = existingPositions.filter((p) =>
    p.symbol.startsWith(newBase)
  ).length;
  return count < maxPerSector;
}

// ---------- Format helpers for notifications ----------
export function formatSignalMessage(sig: SafeSignal, size: PositionSize): string {
  const lines = [
    `🟢 BUY SIGNAL: ${sig.symbol}`,
    `Price: ${sig.price.toFixed(2)}`,
    `Entry: ${sig.entry.toFixed(2)}`,
    `Stop loss: ${sig.stopLoss.toFixed(2)} (max loss Rs ${size.riskAmount.toFixed(0)}, ${size.riskPct.toFixed(1)}% of capital)`,
    `Target: ${sig.target.toFixed(2)} (profit potential Rs ${size.rewardAmount.toFixed(0)})`,
    `Risk/Reward: 1:${sig.riskReward.toFixed(1)}`,
    `Confidence: ${sig.confidence.toFixed(0)}%`,
    `Qty: ${size.qty} shares (Rs ${size.positionValue.toFixed(0)}, ${size.positionPct.toFixed(1)}% of capital)`,
  ];
  if (sig.aiSummary) lines.push(`\n💬 ${sig.aiSummary.slice(0, 200)}`);
  return lines.join("\n");
}

export function formatExitMessage(
  symbol: string,
  side: "target" | "stop",
  entry: number,
  exit: number,
  qty: number,
  pnl: number
): string {
  const emoji = side === "target" ? "🎯" : "🛑";
  const result = pnl >= 0 ? "PROFIT" : "LOSS";
  const pct = entry > 0 ? ((pnl / (entry * qty)) * 100).toFixed(2) : "0";
  return [
    `${emoji} ${result}: ${symbol}`,
    `Entry: ${entry.toFixed(2)}`,
    `Exit: ${exit.toFixed(2)} (${side === "target" ? "target hit" : "stop-loss hit"})`,
    `Qty: ${qty} shares`,
    `P&L: Rs ${pnl.toFixed(0)} (${pct}%)`,
  ].join("\n");
}
