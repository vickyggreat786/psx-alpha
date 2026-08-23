"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { CandlestickChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanSymbol } from "@/lib/symbol-utils";
import { Badge } from "@/components/ui/badge";

interface Candle {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct?: number;
}

interface Props {
  candles: Candle[];
  symbol: string;
  indicators?: any;
  tradePlan?: any;
  loading?: boolean;
}

const COLORS = {
  bull: "#16A34A",
  bullLight: "#22C55E",
  bear: "#DC2626",
  bearLight: "#EF4444",
  sma20: "#A855F7",
  sma50: "#3B82F6",
  bb: "#64748B",
  vwap: "#F59E0B",
  wick: "currentColor",
};

// ---------- Indicators ----------
function sma(v: number[], p: number): (number | null)[] {
  const o: (number | null)[] = [];
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { o.push(null); continue; }
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += v[j];
    o.push(s / p);
  }
  return o;
}

function bb(c: number[], p = 20, m = 2) {
  const mid = sma(c, p);
  const u: (number | null)[] = [];
  const l: (number | null)[] = [];
  for (let i = 0; i < c.length; i++) {
    if (mid[i] === null) { u.push(null); l.push(null); continue; }
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (c[j] - (mid[i] as number)) ** 2;
    const sd = Math.sqrt(s / p);
    u.push((mid[i] as number) + m * sd);
    l.push((mid[i] as number) - m * sd);
  }
  return { u, mid, l };
}

function vwap(c: Candle[]): (number | null)[] {
  const o: (number | null)[] = [];
  let pv = 0, v = 0;
  for (const c2 of c) {
    const tp = (c2.high + c2.low + c2.close) / 3;
    if (c2.volume > 0) { pv += tp * c2.volume; v += c2.volume; }
    o.push(v > 0 ? pv / v : null);
  }
  return o;
}

// ---------- Custom Candlestick shape ----------
// Each "bar" in the chart is a candle. We draw:
//   - A thin vertical line from low to high (the wick)
//   - A rectangle from open to close (the body)
//   - Filled green if close >= open, filled red otherwise
//
// Recharts passes the data row's keys (open, high, low, close, payload) as
// top-level props to the shape function. We capture the y-scale + bar width
// via closure when constructing the shape.
function makeCandleShape(yScale: (price: number) => number, barW: number) {
  return function CandleShape(props: any) {
    const { x, y, width, height, payload } = props;
    if (!payload) return null;
    const open = payload.open;
    const high = payload.high;
    const low = payload.low;
    const close = payload.close;

    if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
      return null;
    }

    const isUp = close >= open;
    const color = isUp ? COLORS.bull : COLORS.bear;
    const colorLight = isUp ? COLORS.bullLight : COLORS.bearLight;

    const cx = x + width / 2;
    const wickTop = yScale(high);
    const wickBottom = yScale(low);
    const bodyTop = yScale(Math.max(open, close));
    const bodyBottom = yScale(Math.min(open, close));
    const bodyH = Math.max(1, bodyBottom - bodyTop);
    const bodyW = Math.max(2, Math.min(barW, width * 0.85));
    const bodyX = cx - bodyW / 2;

    return (
      <g>
        {/* Wick — thin vertical line from low to high */}
        <line
          x1={wickX1(cx, bodyW)}
          x2={wickX1(cx, bodyW)}
          y1={wickTop}
          y2={wickBottom}
          stroke={color}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
        {/* Body — rectangle from open to close */}
        <rect
          x={bodyX}
          y={bodyTop}
          width={bodyW}
          height={bodyH}
          fill={color}
          stroke={color}
          strokeWidth={1}
          shapeRendering="crispEdges"
          rx={0.5}
        />
        {/* Highlight on up candles for pro look */}
        {isUp && bodyH > 2 && (
          <line
            x1={bodyX + 1}
            x2={bodyX + bodyW - 1}
            y1={bodyTop + 1}
            y2={bodyTop + 1}
            stroke={colorLight}
            strokeWidth={0.5}
            opacity={0.5}
          />
        )}
      </g>
    );
  };
}

// Helper to compute wick x position (centered on body)
function wickX1(center: number, bodyW: number): number {
  return center;
}

export function ProfessionalChart({ candles, symbol, indicators, tradePlan, loading }: Props) {
  const [tf, setTf] = React.useState(22);
  const [showVol, setShowVol] = React.useState(true);
  const [showSMA, setShowSMA] = React.useState(true);
  const [showBB, setShowBB] = React.useState(true);
  const [showVwap, setShowVwap] = React.useState(false);
  const [hovered, setHovered] = React.useState<number | null>(null);

  const visible = candles.slice(-tf);
  const fullCloses = candles.map((c) => c.close);
  const startIdx = Math.max(0, candles.length - tf);

  const s20 = sma(fullCloses, Math.min(20, fullCloses.length));
  const s50 = candles.length >= 50 ? sma(fullCloses, 50) : sma(fullCloses, Math.min(fullCloses.length, 30));
  const bands = bb(fullCloses, 20, 2);
  const vw = vwap(candles);

  const data = visible.map((c, i) => {
    const idx = startIdx + i;
    return {
      date: (c.date || "").slice(5),
      full: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      changePct: c.changePct ?? 0,
      isUp: c.close >= c.open,
      sma20: s20[idx] ?? null,
      sma50: s50[idx] ?? null,
      bbU: bands.u[idx] ?? null,
      bbL: bands.l[idx] ?? null,
      vwap: vw[idx] ?? null,
    };
  });

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading chart…</p>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
        No data for {cleanSymbol(symbol)}
      </div>
    );
  }

  const last = visible[visible.length - 1];
  const priceUp = (last?.changePct ?? 0) >= 0;

  // Compute price domain — include BB upper/lower if shown
  const allPrices: number[] = [];
  for (const d of data) {
    allPrices.push(d.low, d.high);
    if (showBB && d.bbU != null) allPrices.push(d.bbU);
    if (showBB && d.bbL != null) allPrices.push(d.bbL);
    if (showSMA && d.sma20 != null) allPrices.push(d.sma20);
    if (showSMA && d.sma50 != null) allPrices.push(d.sma50);
    if (showVwap && d.vwap != null) allPrices.push(d.vwap);
  }
  if (tradePlan?.entry) allPrices.push(tradePlan.entry);
  if (tradePlan?.stopLoss) allPrices.push(tradePlan.stopLoss);
  if (tradePlan?.target) allPrices.push(tradePlan.target);

  const minP = Math.min(...allPrices) * 0.995;
  const maxP = Math.max(...allPrices) * 1.005;
  const padding = (maxP - minP) * 0.08;

  // Y-axis pixel scale: chart height is 320px (we'll hardcode for now)
  const CHART_H = 320;
  const yScale = (price: number) => {
    const ratio = (price - (minP - padding)) / ((maxP + padding) - (minP - padding));
    return CHART_H - ratio * CHART_H;
  };

  const barW = Math.max(3, Math.min(18, 600 / data.length * 0.7));

  const fmt = (v: number) => v?.toFixed?.(2) ?? "—";
  const fmtVol = (v: number) =>
    v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v);

  // Crosshair price readout (the price at hovered candle, or last)
  const hoveredIdx = hovered ?? data.length - 1;
  const hoveredCandle = data[Math.min(hoveredIdx, data.length - 1)];

  return (
    <div className="space-y-2" onMouseLeave={() => setHovered(null)}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <CandlestickChart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            {cleanSymbol(symbol)}
          </h4>
          <span className={cn(
            "text-base font-bold tabular-nums",
            priceUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}>
            {last.close.toFixed(2)}
          </span>
          {last && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] tabular-nums",
                priceUp
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
              )}
            >
              {priceUp ? "▲" : "▼"} {Math.abs(last.changePct ?? 0).toFixed(2)}%
            </Badge>
          )}
          {hoveredCandle && hoveredIdx !== data.length - 1 && (
            <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
              · {hoveredCandle.full} · O {fmt(hoveredCandle.open)} H {fmt(hoveredCandle.high)} L {fmt(hoveredCandle.low)} C {fmt(hoveredCandle.close)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[
            { l: "1W", v: 7 },
            { l: "2W", v: 14 },
            { l: "1M", v: 22 },
            { l: "2M", v: 44 },
            { l: "3M", v: 66 },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setTf(t.v)}
              disabled={candles.length < t.v}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium disabled:opacity-30 transition-colors",
                tf === t.v
                  ? "bg-violet-600 text-white"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowSMA((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
            showSMA ? "bg-muted text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: showSMA ? COLORS.sma20 : undefined, border: `1px solid ${COLORS.sma20}` }}
          />
          SMA 20/50
        </button>
        <button
          onClick={() => setShowBB((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
            showBB ? "bg-muted text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: showBB ? COLORS.bb : undefined, border: `1px solid ${COLORS.bb}` }}
          />
          BB(20,2)
        </button>
        <button
          onClick={() => setShowVwap((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
            showVwap ? "bg-muted text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: showVwap ? COLORS.vwap : undefined, border: `1px solid ${COLORS.vwap}` }}
          />
          VWAP
        </button>
        <button
          onClick={() => setShowVol((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
            showVol ? "bg-muted text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          Vol
        </button>
      </div>

      {/* Main chart — real candlesticks */}
      <div className="h-[340px] sm:h-[400px] w-full rounded-lg bg-muted/10 p-1 relative">
        {/* Hidden recharts container — we render the candles via Bar shape */}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 60, left: 4, bottom: 0 }}
            onMouseMove={(e: any) => {
              if (e?.activeTooltipIndex != null) setHovered(e.activeTooltipIndex);
            }}
          >
            <defs>
              <linearGradient id="candleGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.bull} stopOpacity={0.04} />
                <stop offset="100%" stopColor={COLORS.bear} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "currentColor" }}
              interval="preserveStartEnd"
              minTickGap={20}
              axisLine={{ stroke: "currentColor", opacity: 0.3 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="price"
              domain={[minP - padding, maxP + padding]}
              tick={{ fontSize: 9, fill: "currentColor" }}
              width={52}
              orientation="right"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(2))}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const up = d.close >= d.open;
                return (
                  <div className="rounded-lg border border-border bg-background/95 backdrop-blur p-2.5 shadow-lg text-xs space-y-1 min-w-[180px]">
                    <p className="font-medium border-b border-border/50 pb-1">{d.full}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <span className="text-muted-foreground">Open</span>
                      <span className="tabular-nums text-right">{fmt(d.open)}</span>
                      <span className="text-muted-foreground">High</span>
                      <span className="tabular-nums text-right text-emerald-600 dark:text-emerald-400">{fmt(d.high)}</span>
                      <span className="text-muted-foreground">Low</span>
                      <span className="tabular-nums text-right text-rose-600 dark:text-rose-400">{fmt(d.low)}</span>
                      <span className="text-muted-foreground">Close</span>
                      <span className={cn("tabular-nums text-right", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{fmt(d.close)}</span>
                      <span className="text-muted-foreground">Vol</span>
                      <span className="tabular-nums text-right">{fmtVol(d.volume)}</span>
                      <span className="text-muted-foreground">Chg</span>
                      <span className={cn("tabular-nums text-right", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {up ? "+" : ""}{d.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: "#A855F7", strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />

            {/* BB bands (background fill + dashed lines) */}
            {showBB && (
              <>
                <Line yAxisId="price" dataKey="bbU" stroke={COLORS.bb} strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls opacity={0.7} />
                <Line yAxisId="price" dataKey="bbL" stroke={COLORS.bb} strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls opacity={0.7} />
              </>
            )}

            {/* Trade plan reference lines (Entry/Stop/Target) */}
            {tradePlan?.entry && (
              <ReferenceLine yAxisId="price" y={tradePlan.entry} stroke={COLORS.bull} strokeWidth={1.5} strokeDasharray="6 3" label={{ value: `BUY ${tradePlan.entry.toFixed(2)}`, fontSize: 9, fill: COLORS.bull, position: "insideTopRight" }} />
            )}
            {tradePlan?.stopLoss && (
              <ReferenceLine yAxisId="price" y={tradePlan.stopLoss} stroke={COLORS.bear} strokeWidth={1.5} strokeDasharray="6 3" label={{ value: `SL ${tradePlan.stopLoss.toFixed(2)}`, fontSize: 9, fill: COLORS.bear, position: "insideBottomRight" }} />
            )}
            {tradePlan?.target && (
              <ReferenceLine yAxisId="price" y={tradePlan.target} stroke="#7C4DFF" strokeWidth={1.5} strokeDasharray="6 3" label={{ value: `TGT ${tradePlan.target.toFixed(2)}`, fontSize: 9, fill: "#7C4DFF", position: "insideTopRight" }} />
            )}

            {/* Candles — use Bar with custom shape (closure-captured yScale) */}
            <Bar
              yAxisId="price"
              dataKey="close"
              barSize={barW}
              isAnimationActive={false}
              shape={makeCandleShape(yScale, barW) as any}
            />

            {/* SMA 20 */}
            {showSMA && (
              <Line yAxisId="price" dataKey="sma20" stroke={COLORS.sma20} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            )}
            {/* SMA 50 */}
            {showSMA && (
              <Line yAxisId="price" dataKey="sma50" stroke={COLORS.sma50} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            )}
            {/* VWAP */}
            {showVwap && (
              <Line yAxisId="price" dataKey="vwap" stroke={COLORS.vwap} strokeWidth={1.2} strokeDasharray="2 2" dot={false} isAnimationActive={false} connectNulls opacity={0.85} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume subchart */}
      {showVol && (
        <div className="h-[100px] w-full rounded-lg bg-muted/10 p-1">
          <p className="text-[9px] text-muted-foreground mb-0.5 pl-2">Volume</p>
          <ResponsiveContainer width="100%" height="85%">
            <ComposedChart data={data} margin={{ top: 0, right: 60, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.05} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: "currentColor" }} interval="preserveStartEnd" minTickGap={20} axisLine={false} tickLine={false} />
              <YAxis yAxisId="vol" hide domain={["auto", "auto"]} />
              <Bar yAxisId="vol" dataKey="volume" barSize={barW} minPointSize={2} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.isUp ? COLORS.bull + "AA" : COLORS.bear + "AA"} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OHLC stat cards */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-center">
          <p className="text-[9px] text-muted-foreground font-medium">OPEN</p>
          <p className="text-sm font-bold tabular-nums">{last.open.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-emerald-200/40 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 px-2 py-1 text-center">
          <p className="text-[9px] text-emerald-700 dark:text-emerald-300 font-medium">HIGH</p>
          <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{last.high.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-rose-200/40 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 px-2 py-1 text-center">
          <p className="text-[9px] text-rose-700 dark:text-rose-300 font-medium">LOW</p>
          <p className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-300">{last.low.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-center">
          <p className="text-[9px] text-muted-foreground font-medium">CLOSE</p>
          <p className={cn("text-sm font-bold tabular-nums", priceUp ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{last.close.toFixed(2)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
        <span>candles: <span className="font-medium text-foreground">{visible.length}</span></span>
        <span>· Vol: <span className="font-medium text-foreground tabular-nums">{fmtVol(last.volume)}</span></span>
        <span>· Range: <span className="font-medium text-foreground tabular-nums">{(last.high - last.low).toFixed(2)}</span></span>
      </div>
    </div>
  );
}
