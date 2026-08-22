"use client";

import * as React from "react";
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { CandlestickChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanSymbol } from "@/lib/symbol-utils";
import { Badge } from "@/components/ui/badge";

interface Candle { date?: string; open: number; high: number; low: number; close: number; volume: number; changePct?: number; }
interface Props { candles: Candle[]; symbol: string; indicators?: any; tradePlan?: any; loading?: boolean; }

const COLORS = { bull: "#00C853", bear: "#D50000", sma20: "#7C4DFF", sma50: "#2196F3", bb: "#64748B", vwap: "#FF9800" };

function sma(v: number[], p: number): (number|null)[] {
  const o: (number|null)[] = [];
  for (let i = 0; i < v.length; i++) { if (i < p-1) { o.push(null); continue; } let s=0; for (let j=i-p+1; j<=i; j++) s+=v[j]; o.push(s/p); }
  return o;
}
function bb(c: number[], p=20, m=2) {
  const mid = sma(c, p); const u:(number|null)[]=[]; const l:(number|null)[]=[];
  for (let i=0; i<c.length; i++) { if (mid[i]===null) { u.push(null); l.push(null); continue; } let s=0; for (let j=i-p+1; j<=i; j++) s+=(c[j]-mid[i]!)**2; const sd=Math.sqrt(s/p); u.push(mid[i]!+m*sd); l.push(mid[i]!-m*sd); }
  return { u, mid, l };
}
function vwap(c: Candle[]): (number|null)[] {
  const o:(number|null)[]=[]; let pv=0, v=0;
  for (const c2 of c) { const tp=(c2.high+c2.low+c2.close)/3; if(c2.volume>0){pv+=tp*c2.volume; v+=c2.volume;} o.push(v>0?pv/v:null); }
  return o;
}

export function ProfessionalChart({ candles, symbol, indicators, tradePlan, loading }: Props) {
  const [tf, setTf] = React.useState(22);
  const [showVol, setShowVol] = React.useState(true);
  const [showSMA, setShowSMA] = React.useState(true);
  const [showBB, setShowBB] = React.useState(true);

  const visible = candles.slice(-tf);
  const fullCloses = candles.map(c => c.close);
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
      open: c.open, high: c.high, low: c.low, close: c.close,
      volume: c.volume, changePct: c.changePct ?? 0,
      isUp: c.close >= c.open,
      sma20: s20[idx] ?? null,
      sma50: s50[idx] ?? null,
      bbU: bands.u[idx] ?? null,
      bbL: bands.l[idx] ?? null,
      vwap: vw[idx] ?? null,
    };
  });

  if (loading) return <div className="h-[400px] flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading chart…</p></div>;
  if (data.length === 0) return <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">No data for {symbol}</div>;

  const last = visible[visible.length - 1];
  const priceUp = (last?.changePct ?? 0) >= 0;
  const minP = Math.min(...data.map(d => d.low)) * 0.99;
  const maxP = Math.max(...data.map(d => d.high)) * 1.01;
  const barW = Math.max(4, Math.min(20, 600 / data.length * 0.7));

  const fmt = (v: number) => v?.toFixed?.(2) ?? "—";
  const fmtVol = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <CandlestickChart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            {cleanSymbol(symbol)}
          </h4>
          <span className="text-base font-bold tabular-nums">{last.close.toFixed(2)}</span>
          {last && <Badge variant="outline" className={cn("text-[10px]", priceUp ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300")}>
            {priceUp ? "▲" : "▼"} {(last.changePct ?? 0).toFixed(2)}%
          </Badge>}
        </div>
        <div className="flex items-center gap-1">
          {[{l:"1W",v:7},{l:"2W",v:14},{l:"1M",v:22},{l:"2M",v:44},{l:"3M",v:66}].map(t => (
            <button key={t.v} onClick={() => setTf(t.v)} disabled={candles.length < t.v}
              className={cn("px-2 py-0.5 rounded text-[10px] font-medium disabled:opacity-30",
                tf === t.v ? "bg-violet-600 text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowSMA(v => !v)} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]", showSMA ? "bg-muted text-foreground" : "text-muted-foreground/50")}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showSMA ? COLORS.sma20 : undefined, border: `1px solid ${COLORS.sma20}` }} /> SMA20
        </button>
        <button onClick={() => setShowBB(v => !v)} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]", showBB ? "bg-muted text-foreground" : "text-muted-foreground/50")}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showBB ? COLORS.bb : undefined, border: `1px solid ${COLORS.bb}` }} /> BB(20,2)
        </button>
        <button onClick={() => setShowVol(v => !v)} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]", showVol ? "bg-muted text-foreground" : "text-muted-foreground/50")}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showVol ? COLORS.bb : undefined, border: `1px solid ${COLORS.bb}` }} /> Vol
        </button>
      </div>

      {/* Main chart — Area + indicators */}
      <div className="h-[340px] sm:h-[400px] w-full rounded-lg bg-muted/10 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 60, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={priceUp ? COLORS.bull : COLORS.bear} stopOpacity={0.3} />
                <stop offset="100%" stopColor={priceUp ? COLORS.bull : COLORS.bear} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "currentColor" }} interval="preserveStartEnd" minTickGap={20} axisLine={{ stroke: "currentColor", opacity: 0.3 }} tickLine={false} />
            <YAxis yAxisId="price" domain={[minP, maxP]} tick={{ fontSize: 9, fill: "currentColor" }} width={52} orientation="right" axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(2)} />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const up = d.close >= d.open;
                return (
                  <div className="rounded-lg border border-border bg-background/95 backdrop-blur p-2.5 shadow-lg text-xs space-y-1 min-w-[180px]">
                    <p className="font-medium border-b border-border/50 pb-1">{d.full}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <span className="text-muted-foreground">O</span><span className="tabular-nums text-right">{fmt(d.open)}</span>
                      <span className="text-muted-foreground">H</span><span className="tabular-nums text-right text-emerald-600 dark:text-emerald-400">{fmt(d.high)}</span>
                      <span className="text-muted-foreground">L</span><span className="tabular-nums text-right text-rose-600 dark:text-rose-400">{fmt(d.low)}</span>
                      <span className="text-muted-foreground">C</span><span className={cn("tabular-nums text-right", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{fmt(d.close)}</span>
                      <span className="text-muted-foreground">Vol</span><span className="tabular-nums text-right">{fmtVol(d.volume)}</span>
                      <span className="text-muted-foreground">Chg</span><span className={cn("tabular-nums text-right", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{up?"+":""}{d.changePct.toFixed(2)}%</span>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: "#7C4DFF", strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            {/* BB lines */}
            {showBB && <Line yAxisId="price" dataKey="bbU" stroke={COLORS.bb} strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />}
            {showBB && <Line yAxisId="price" dataKey="bbL" stroke={COLORS.bb} strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />}
            {/* Trade levels */}
            {tradePlan?.entry && <ReferenceLine yAxisId="price" y={tradePlan.entry} stroke={COLORS.bull} strokeWidth={1} strokeDasharray="6 3" label={{ value: `BUY ${tradePlan.entry.toFixed(2)}`, fontSize: 9, fill: COLORS.bull, position: "insideTopRight" }} />}
            {tradePlan?.stopLoss && <ReferenceLine yAxisId="price" y={tradePlan.stopLoss} stroke={COLORS.bear} strokeWidth={1} strokeDasharray="6 3" label={{ value: `SL ${tradePlan.stopLoss.toFixed(2)}`, fontSize: 9, fill: COLORS.bear, position: "insideBottomRight" }} />}
            {tradePlan?.target && <ReferenceLine yAxisId="price" y={tradePlan.target} stroke="#7C4DFF" strokeWidth={1} strokeDasharray="6 3" label={{ value: `TGT ${tradePlan.target.toFixed(2)}`, fontSize: 9, fill: "#7C4DFF", position: "insideTopRight" }} />}
            {/* Area chart — closes with gradient */}
            <Area yAxisId="price" dataKey="close" stroke={priceUp ? COLORS.bull : COLORS.bear} strokeWidth={2} fill="url(#areaFill)" dot={false} isAnimationActive={false} connectNulls />
            {/* SMA20 */}
            {showSMA && <Line yAxisId="price" dataKey="sma20" stroke={COLORS.sma20} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
            {/* SMA50 */}
            {showSMA && <Line yAxisId="price" dataKey="sma50" stroke={COLORS.sma50} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
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
              <YAxis yAxisId="vol" hide domain={["auto","auto"]} />
              <Bar yAxisId="vol" dataKey="volume" barSize={barW} minPointSize={2} isAnimationActive={false}>
                {data.map((d, i) => <Cell key={i} fill={d.isUp ? COLORS.bull + "80" : COLORS.bear + "80"} />)}
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
        <span> · Vol: <span className="font-medium text-foreground tabular-nums">{fmtVol(last.volume)}</span></span>
      </div>
    </div>
  );
}
