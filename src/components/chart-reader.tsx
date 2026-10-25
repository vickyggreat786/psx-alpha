"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ChartReaderPanel — professional candlestick chart reader.
//
// Reads REAL candle history (/api/psx/candles, range=6mo daily) and produces a
// deterministic, rule-based technical readout:
//   • Verdict banner — BULLISH / BEARISH / NEUTRAL + confidence (score-based)
//   • Auto chart read — market structure (HH/HL vs LH/LL), price vs SMA 20/50,
//     momentum (RSI zone + MACD cross), volume trend, volatility (ATR%),
//     Bollinger position — one chip per factor, colour-coded
//   • Pattern balance meter (bull vs bear events, last 60 sessions)
//   • Latest-candle patterns + recent dated pattern events
//   • Key S/R levels with distance % and touch counts
// Every number comes from the same real candle chain the chart uses.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import {
  Crosshair,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Gauge,
  Activity,
  BarChart3,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanSymbol } from "@/lib/symbol-utils";
import { Badge } from "@/components/ui/badge";
import { detectPatternEvents } from "@/lib/patterns";
import {
  sma as calcSma,
  rsi as calcRsi,
  macd as calcMacd,
  atr as calcAtr,
  bollinger as calcBb,
  computeSrLevels,
  type SrResult,
} from "@/lib/indicators";

interface Candle {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct?: number;
}

type FactorTone = "bull" | "bear" | "neutral";

interface ReadFactor {
  key: string;
  label: string;
  state: string;
  tone: FactorTone;
}

interface Props {
  symbol: string;
  className?: string;
}

export function ChartReaderPanel({ symbol, className }: Props) {
  const [candles, setCandles] = React.useState<Candle[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const symRef = React.useRef(symbol);
  React.useEffect(() => {
    if (symRef.current !== symbol) {
      symRef.current = symbol;
      setCandles([]);
      setError(null);
    }
  }, [symbol]);

  React.useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/psx/candles?symbol=${encodeURIComponent(symbol)}&range=6mo&interval=1d`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(
        (j: { ok: boolean; error?: string; data?: { candles?: Candle[] } }) => {
          if (cancelled) return;
          if (j.ok && j.data?.candles && j.data.candles.length > 0) {
            setCandles(j.data.candles);
          } else {
            setCandles([]);
            setError(j.error || "No candle data available");
          }
        }
      )
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load candles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, nonce]);

  const read = React.useMemo(() => {
    if (!candles || candles.length < 12) return null;
    const n = candles.length;
    const closes = candles.map((c) => c.close);
    const price = closes[n - 1];

    const s20Arr = calcSma(closes, 20);
    const s50Arr = calcSma(closes, 50);
    const rsiArr = calcRsi(closes, 14);
    const macdRes = calcMacd(closes, 12, 26, 9);
    const atrArr = calcAtr(candles, 14);
    const bb = calcBb(closes, 20, 2);
    const sr = computeSrLevels(candles, Math.min(120, n));
    const events = detectPatternEvents(candles, 60, 8, "moderate");

    const s20 = s20Arr[n - 1] ?? null;
    const s50 = s50Arr[n - 1] ?? null;
    const rsi = rsiArr[n - 1] ?? null;
    const macdL = macdRes.macd[n - 1] ?? null;
    const macdS = macdRes.signal[n - 1] ?? null;
    const atr = atrArr[n - 1] ?? null;
    const bbU = bb.upper[n - 1] ?? null;
    const bbL = bb.lower[n - 1] ?? null;

    const factors: ReadFactor[] = [];

    // 1. Market structure (from S/R pivots)
    if (sr) {
      factors.push({
        key: "structure",
        label: "Structure",
        state: sr.structureLabel,
        tone:
          sr.structure === "uptrend" ? "bull" : sr.structure === "downtrend" ? "bear" : "neutral",
      });
    }

    // 2. Price vs moving averages
    if (s20 != null && s50 != null) {
      const above20 = price >= s20;
      const above50 = price >= s50;
      const golden = s20 >= s50;
      const state = above20 && above50
        ? golden ? "Above SMA20 & 50 — bullish alignment" : "Above both SMAs — recovering"
        : !above20 && !above50
        ? !golden ? "Below SMA20 & 50 — bearish alignment" : "Below both SMAs — pullback"
        : above20
        ? "Above SMA20, below SMA50 — early recovery"
        : "Below SMA20, above SMA50 — shallow pullback";
      factors.push({
        key: "trend",
        label: "Trend",
        state,
        tone: above20 && above50 ? "bull" : !above20 && !above50 ? "bear" : "neutral",
      });
    }

    // 3. Momentum (RSI + MACD)
    if (rsi != null) {
      const rsiTone: FactorTone = rsi > 55 ? "bull" : rsi < 45 ? "bear" : "neutral";
      const rsiWord = rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : rsi > 55 ? "bullish" : rsi < 45 ? "weak" : "neutral";
      let momTone = rsiTone;
      let macdWord = "";
      if (macdL != null && macdS != null) {
        const macdBull = macdL > macdS;
        macdWord = macdBull ? " · MACD above signal" : " · MACD below signal";
        if (macdL > 0 && macdBull) momTone = "bull";
        else if (macdL < 0 && !macdBull) momTone = "bear";
      }
      factors.push({
        key: "momentum",
        label: "Momentum",
        state: `RSI ${rsi.toFixed(1)} ${rsiWord}${macdWord}`,
        tone: momTone,
      });
    }

    // 4. Volume trend (last 5 avg vs 20 avg)
    const vols = candles.map((c) => c.volume || 0);
    const vol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length) || 0;
    const vol5 = vols.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vols.length) || 0;
    if (vol20 > 0) {
      const ratio = vol5 / vol20;
      factors.push({
        key: "volume",
        label: "Volume",
        state:
          ratio > 1.25
            ? `Expanding — last 5 sessions ${(ratio).toFixed(1)}× the 20-day average`
            : ratio < 0.7
            ? `Fading — last 5 sessions ${(ratio).toFixed(1)}× the 20-day average`
            : `Steady — near the 20-day average (${(ratio).toFixed(1)}×)`,
        tone: ratio > 1.25 ? "bull" : ratio < 0.7 ? "neutral" : "neutral",
      });
    }

    // 5. Volatility (ATR% vs its own median)
    if (atr != null && price > 0) {
      const atrPct = (atr / price) * 100;
      const atrPcts = atrArr
        .slice(-60)
        .filter((a): a is number => a != null)
        .map((a) => (a / price) * 100);
      atrPcts.sort((a, b) => a - b);
      const median = atrPcts.length > 0 ? atrPcts[Math.floor(atrPcts.length / 2)] : atrPct;
      const expanding = atrPct > median * 1.2;
      factors.push({
        key: "volatility",
        label: "Volatility",
        state: `ATR ${atrPct.toFixed(1)}% of price — ${expanding ? "expanding" : atrPct < median * 0.8 ? "compressed" : "normal"}`,
        tone: expanding ? "bear" : "neutral",
      });
    }

    // 6. Bollinger position
    if (bbU != null && bbL != null && bbU > bbL) {
      const pos = (price - bbL) / (bbU - bbL); // 0..1
      factors.push({
        key: "bollinger",
        label: "Bands",
        state:
          pos > 0.9
            ? "Riding the upper band — strong but stretched"
            : pos < 0.1
            ? "Pinned to the lower band — washed out or breaking down"
            : `Mid-band (${(pos * 100).toFixed(0)}% of range)`,
        tone: pos > 0.9 ? "bull" : pos < 0.1 ? "bear" : "neutral",
      });
    }

    // Verdict score: structure + trend + momentum
    let score = 0;
    for (const f of factors) {
      if (f.key === "volume" || f.key === "volatility") continue; // context, not direction
      if (f.tone === "bull") score += 1;
      else if (f.tone === "bear") score -= 1;
    }
    const bull = events.filter((e) => e.type === "bullish").length;
    const bear = events.filter((e) => e.type === "bearish").length;
    score += bull >= bear + 2 ? 1 : bear >= bull + 2 ? -1 : 0;
    const maxScore = factors.filter((f) => f.key !== "volume" && f.key !== "volatility").length + 1;
    const confidence = Math.round((Math.abs(score) / Math.max(1, maxScore)) * 100);
    const verdict: "BULLISH" | "BEARISH" | "NEUTRAL" =
      score >= 2 ? "BULLISH" : score <= -2 ? "BEARISH" : "NEUTRAL";

    const latestPatterns = detectPatternEvents(candles, 3, 4, "weak");

    return {
      price,
      factors,
      sr: sr as SrResult | null,
      events,
      bull,
      bear,
      neutral: events.filter((e) => e.type === "neutral").length,
      verdict,
      confidence,
      score,
      latestPatterns,
    };
  }, [candles]);

  const verdictStyle =
    read?.verdict === "BULLISH"
      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
      : read?.verdict === "BEARISH"
      ? "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300"
      : "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300";

  const toneIcon = (tone: FactorTone) =>
    tone === "bull" ? (
      <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
    ) : tone === "bear" ? (
      <TrendingDown className="h-3 w-3 text-rose-500 shrink-0" />
    ) : (
      <Minus className="h-3 w-3 text-muted-foreground shrink-0" />
    );

  const factorIcon = (key: string) => {
    switch (key) {
      case "structure":
        return <BarChart3 className="h-3 w-3 shrink-0 text-violet-500" />;
      case "volume":
        return <BarChart3 className="h-3 w-3 shrink-0 text-sky-500" />;
      case "volatility":
        return <Waves className="h-3 w-3 shrink-0 text-amber-500" />;
      case "momentum":
        return <Activity className="h-3 w-3 shrink-0 text-fuchsia-500" />;
      default:
        return <Gauge className="h-3 w-3 shrink-0 text-violet-500" />;
    }
  };

  return (
    <div className={cn("mt-4 pt-3 border-t border-border/60", className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Crosshair className="h-3 w-3 text-violet-500" />
          Chart Reader — auto read, patterns &amp; key levels
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">
            {candles.length > 0 ? `${candles.length} real sessions` : "last 60 sessions"}
          </span>
          <button
            onClick={() => setNonce((x) => x + 1)}
            title="Re-read chart"
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && candles.length === 0 && (
        <p className="text-xs text-muted-foreground py-3 text-center">Reading chart…</p>
      )}
      {error && candles.length === 0 && (
        <p className="text-xs text-muted-foreground/70 py-2 text-center">{error}</p>
      )}

      {read && (
        <>
          {/* ═══ Verdict banner ═══ */}
          <div className={cn("rounded-lg border px-3 py-2 mb-3 flex items-center justify-between gap-2", verdictStyle)}>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-wide flex items-center gap-1.5">
                {read.verdict === "BULLISH" ? (
                  <TrendingUp className="h-4 w-4" />
                ) : read.verdict === "BEARISH" ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                {read.verdict}
              </p>
              <p className="text-[10px] opacity-80 mt-0.5">
                Rule-based read of {candles.length} real candles · score {read.score > 0 ? "+" : ""}
                {read.score}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold tabular-nums leading-none">{read.confidence}%</p>
              <p className="text-[9px] opacity-70">confidence</p>
            </div>
          </div>

          {/* ═══ Auto chart read — factor chips ═══ */}
          <div className="space-y-1 mb-3">
            {read.factors.map((f) => (
              <div
                key={f.key}
                className={cn(
                  "flex items-start gap-1.5 rounded px-1.5 py-1 text-[11px]",
                  f.tone === "bull"
                    ? "bg-emerald-500/5"
                    : f.tone === "bear"
                    ? "bg-rose-500/5"
                    : "bg-muted/30"
                )}
              >
                {factorIcon(f.key)}
                <span className="font-medium text-foreground/80 w-16 shrink-0">{f.label}</span>
                <span
                  className={cn(
                    "min-w-0",
                    f.tone === "bull"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : f.tone === "bear"
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-muted-foreground"
                  )}
                >
                  {f.state}
                </span>
              </div>
            ))}
          </div>

          {/* ═══ Pattern balance meter ═══ */}
          {(read.bull > 0 || read.bear > 0) && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-[9px] mb-1">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ▲ {read.bull} bullish
                </span>
                <span className="text-muted-foreground">pattern balance</span>
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  {read.bear} bearish ▼
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-rose-500/70 flex">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${
                      (read.bull / Math.max(1, read.bull + read.bear)) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══ Latest candle patterns ═══ */}
          <p className="text-[10px] text-muted-foreground/70 mb-1">On the latest candle</p>
          {read.latestPatterns.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {read.latestPatterns.map((p, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs",
                    p.type === "bullish"
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                      : p.type === "bearish"
                      ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20"
                      : "border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1 py-0 h-4 capitalize",
                        p.type === "bullish"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : p.type === "bearish"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                      )}
                    >
                      {p.type} · {p.strength}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">No significant patterns on the latest candle</p>
          )}

          {/* ═══ Recent pattern events ═══ */}
          {read.events.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground/70 mb-1">Recent pattern events</p>
              <ul className="space-y-1">
                {read.events.slice(0, 5).map((e, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-[11px] rounded px-1.5 py-1 bg-muted/30"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "shrink-0",
                          e.type === "bullish"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : e.type === "bearish"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {e.type === "bullish" ? "▲" : e.type === "bearish" ? "▼" : "◆"}
                      </span>
                      <span className="font-medium truncate">{e.name}</span>
                    </span>
                    <span className="text-[9px] text-muted-foreground tabular-nums shrink-0 ml-2">
                      {e.date}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ═══ Key S/R levels + structure ═══ */}
          {read.sr && (read.sr.supports.length > 0 || read.sr.resistances.length > 0) && (
            <div>
              <p className="text-[10px] text-muted-foreground/70 mb-1">Key levels</p>
              <div className="space-y-1">
                {read.sr.resistances.map((r, i) => (
                  <div key={`r${i}`} className="flex items-center justify-between text-[11px] rounded px-1.5 py-1 bg-rose-500/5 border border-rose-500/15">
                    <span className="text-rose-600 dark:text-rose-400 font-medium">R{i + 1} · resistance</span>
                    <span className="tabular-nums font-semibold">
                      {r.price.toFixed(2)}
                      <span className="text-[9px] text-muted-foreground font-normal ml-1.5">
                        +{r.distPct.toFixed(1)}%{r.touches > 1 ? ` · ${r.touches}×` : ""}
                      </span>
                    </span>
                  </div>
                ))}
                {read.sr.supports.map((s, i) => (
                  <div key={`s${i}`} className="flex items-center justify-between text-[11px] rounded px-1.5 py-1 bg-emerald-500/5 border border-emerald-500/15">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">S{i + 1} · support</span>
                    <span className="tabular-nums font-semibold">
                      {s.price.toFixed(2)}
                      <span className="text-[9px] text-muted-foreground font-normal ml-1.5">
                        {s.distPct.toFixed(1)}%{s.touches > 1 ? ` · ${s.touches}×` : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                {read.sr.structure === "uptrend" ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : read.sr.structure === "downtrend" ? (
                  <TrendingDown className="h-3 w-3 text-rose-500" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                Structure: {read.sr.structureLabel}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
