"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProfessionalChart — custom-SVG professional candlestick chart (no Recharts).
//
// Pro features:
//   • History windows: 1D / 1W / 1M / 3M / 1Y / 5Y / MAX (per-window fetching)
//   • Candle interval selector: Daily / Weekly / Monthly (server aggregation)
//   • Chart types: Candles / Line / Area
//   • Overlays: SMA 20/50, EMA 9/21, Bollinger Bands(20,2), VWAP,
//     Support/Resistance levels, trade-plan levels — all toggleable
//   • Sub-panels: Volume (+MA20), RSI(14), MACD(12,26,9) — toggleable
//   • Wheel-zoom + drag-pan + double-click reset (visible-range model)
//   • Synced crosshair (mouse + touch) across all panels
//   • TradingView-style OHLCV legend + floating bar tooltip with patterns
//   • Last-price line + right-edge chip; hovered-close chip on the axis
//   • Linear / log price scale; fullscreen mode; keyboard navigation
//   • Candlestick pattern markers (from detectPatternEvents)
//   • Exact price↔pixel mapping (no chart-lib scale hacks)
//
// Data is always REAL: Twelve Data → Yahoo Finance → DB → PSX live OHLC
// (server-side priority chain in /api/psx/candles).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import {
  CandlestickChart,
  RefreshCw,
  AlertTriangle,
  Maximize2,
  Minimize2,
  ZoomIn,
  Crosshair as CrosshairIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanSymbol } from "@/lib/symbol-utils";
import { Badge } from "@/components/ui/badge";
import { detectPatternEvents, type PatternEvent } from "@/lib/patterns";
import {
  sma as calcSma,
  ema as calcEma,
  bollinger as calcBb,
  rsi as calcRsi,
  macd as calcMacd,
  computeSrLevels,
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

interface TradePlan {
  entry?: number;
  stopLoss?: number;
  target?: number;
}

interface Props {
  symbol: string;
  tradePlan?: TradePlan;
  className?: string;
}

type TfKey = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "MAX";
// Candle interval — includes intraday defaults used by the 1D/1W windows.
// The D/W/M selector only offers the daily-plus set.
type IntervalKey = "5m" | "15m" | "1d" | "1wk" | "1mo";
type ChartType = "candles" | "line" | "area";
type ScaleMode = "linear" | "log";

const TIMEFRAMES: {
  key: TfKey;
  label: string;
  range: string;
  interval: IntervalKey;
  hint: string;
}[] = [
  { key: "1D", label: "1D", range: "1d", interval: "5m", hint: "1 day (intraday when available)" },
  { key: "1W", label: "1W", range: "5d", interval: "15m", hint: "1 week (intraday when available)" },
  { key: "1M", label: "1M", range: "1mo", interval: "1d", hint: "1 month · daily candles" },
  { key: "3M", label: "3M", range: "3mo", interval: "1d", hint: "3 months · daily candles" },
  { key: "1Y", label: "1Y", range: "1y", interval: "1d", hint: "1 year · daily candles" },
  { key: "5Y", label: "5Y", range: "5y", interval: "1wk", hint: "5 years · weekly candles" },
  { key: "MAX", label: "MAX", range: "max", interval: "1mo", hint: "Full history · monthly candles" },
];

const INTERVALS: { key: IntervalKey; label: string; hint: string }[] = [
  { key: "1d", label: "D", hint: "Daily candles" },
  { key: "1wk", label: "W", hint: "Weekly candles" },
  { key: "1mo", label: "M", hint: "Monthly candles" },
];

const C = {
  bull: "#16A34A",
  bullLight: "#22C55E",
  bear: "#DC2626",
  bearLight: "#EF4444",
  sma20: "#A855F7",
  sma50: "#3B82F6",
  ema9: "#F97316",
  ema21: "#14B8A6",
  bb: "#64748B",
  vwap: "#F59E0B",
  srRes: "#F43F5E",
  srSup: "#10B981",
  rsi: "#8B5CF6",
  macd: "#3B82F6",
  macdSignal: "#F59E0B",
  last: "#0EA5E9",
  grid: "rgba(128,128,128,0.16)",
  gridStrong: "rgba(128,128,128,0.28)",
};

// Chart padding (px). Right padding hosts the price-axis labels/chips.
const PAD = { l: 4, r: 62, t: 14, b: 20 };

// Visible-window bounds while zoomed in
const MIN_VISIBLE = 12;

// ---------- small utils ----------
const fin = (v: number | undefined | null): number | null =>
  v != null && Number.isFinite(v) ? v : null;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function fmtNum(v: number | null, d = 2): string {
  return v == null ? "—" : v.toFixed(d);
}

function fmtVol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

// "2026-10-23" → "23 Oct" · "2026-10-23 09:30" → "09:30"
// Long spans (1Y+) fold in the year: "Oct '25".
function fmtDateLabel(date: string | undefined, interval: string, span: number): string {
  if (!date) return "";
  const [dPart, tPart] = date.split(" ");
  if (tPart) return tPart.slice(0, 5);
  const dt = new Date(`${dPart}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dPart;
  if (interval === "1mo") {
    return dt.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (interval === "1wk" || span > 250) {
    return dt.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (span > 120) {
    return dt.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
  }
  return dt.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
}

function fmtDateFull(date: string | undefined): string {
  if (!date) return "—";
  const [dPart, tPart] = date.split(" ");
  const dt = new Date(`${dPart}T00:00:00Z`);
  const ds = Number.isNaN(dt.getTime())
    ? dPart
    : dt.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
  return tPart ? `${ds}, ${tPart}` : ds;
}

// Nice axis ticks (1/2/5×10^n steps)
function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const span = max - min;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

// ---------- prepared bar ----------
interface Bar extends Candle {
  idx: number; // LOCAL index within the visible window (x mapping)
  g: number; // GLOBAL index within the fetched series
  prevClose: number | null;
  chg: number | null;
  s20: number | null;
  s50: number | null;
  e9: number | null;
  e21: number | null;
  bbU: number | null;
  bbL: number | null;
  bbM: number | null;
  vwap: number | null;
  rsi: number | null;
  macdL: number | null;
  macdS: number | null;
  macdH: number | null;
}

interface SrcInfo {
  source: string;
  fetchedAt: string;
  servedInterval?: string;
}

export function ProfessionalChart({ symbol, tradePlan, className }: Props) {
  const [tfKey, setTfKey] = React.useState<TfKey>("3M");
  const [intervalOverride, setIntervalOverride] = React.useState<IntervalKey | null>(null);
  const [chartType, setChartType] = React.useState<ChartType>("candles");
  const [scaleMode, setScaleMode] = React.useState<ScaleMode>("linear");
  const [full, setFull] = React.useState(false);
  const [store, setStore] = React.useState<Partial<Record<string, Candle[]>>>({});
  const [served, setServed] = React.useState<Partial<Record<string, IntervalKey>>>({});
  const [srcInfo, setSrcInfo] = React.useState<SrcInfo | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const [hovered, setHovered] = React.useState<number | null>(null); // GLOBAL index

  const [showSma, setShowSma] = React.useState(true);
  const [showEma, setShowEma] = React.useState(false);
  const [showBb, setShowBb] = React.useState(true);
  const [showVwap, setShowVwap] = React.useState(false);
  const [showSr, setShowSr] = React.useState(true);
  const [showVol, setShowVol] = React.useState(true);
  const [showRsi, setShowRsi] = React.useState(true);
  const [showMacd, setShowMacd] = React.useState(false);

  // Visible window (GLOBAL indices); null = show everything
  const [view, setView] = React.useState<{ start: number; end: number } | null>(null);
  const dragRef = React.useRef<{ x: number; start: number; end: number; moved: boolean } | null>(null);

  const fetchedRef = React.useRef<Set<string>>(new Set());

  const tf = TIMEFRAMES.find((t) => t.key === tfKey) ?? TIMEFRAMES[3];
  const effInterval: IntervalKey = intervalOverride ?? tf.interval;
  const candles = store[`${symbol}|${tfKey}|${effInterval}`];

  // Reset window + hover when the symbol / timeframe / interval changes
  const sig = `${symbol}|${tfKey}|${effInterval}`;
  React.useEffect(() => {
    setView(null);
    setHovered(null);
  }, [sig]);

  // Reset everything when the symbol changes
  const symRef = React.useRef(symbol);
  React.useEffect(() => {
    if (symRef.current !== symbol) {
      symRef.current = symbol;
      fetchedRef.current = new Set();
      setStore({});
      setServed({});
      setSrcInfo(null);
      setError(null);
    }
  }, [symbol]);

  // Fetch candles for the active timeframe+interval (once per symbol|tf|iv)
  React.useEffect(() => {
    const key = `${symbol}|${tfKey}|${effInterval}`;
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);
    let cancelled = false;
    setFetching(true);
    setError(null);
    fetch(
      `/api/psx/candles?symbol=${encodeURIComponent(symbol)}&range=${tf.range}&interval=${effInterval}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then(
        (j: {
          ok: boolean;
          error?: string;
          data?: { candles?: Candle[]; interval?: string; source?: string; fetchedAt?: string };
        }) => {
          if (cancelled) return;
          if (j.ok && j.data?.candles && j.data.candles.length > 0) {
            setStore((s) => ({ ...s, [key]: j.data!.candles! }));
            setSrcInfo({
              source: j.data.source ?? "unknown",
              fetchedAt: j.data.fetchedAt ?? new Date().toISOString(),
              servedInterval: j.data.interval,
            });
            if (j.data.interval && ["1d", "1wk", "1mo"].includes(j.data.interval)) {
              const siv = j.data.interval as IntervalKey;
              if (siv !== effInterval) {
                setServed((s) => ({ ...s, [key]: siv }));
              }
            }
          } else {
            fetchedRef.current.delete(key); // allow retry
            setError(j.error || "No candle data available for this timeframe");
          }
        }
      )
      .catch((e: unknown) => {
        if (cancelled) return;
        fetchedRef.current.delete(key);
        setError(e instanceof Error ? e.message : "Failed to load candles");
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, tfKey, tf.range, effInterval, reloadNonce]);

  // ---------- prepare indicator-enriched bars (full series) ----------
  const prepared = React.useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const nAll = candles.length;
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume || 0);
    const s20 = calcSma(closes, 20);
    const s50 = calcSma(closes, 50);
    const e9 = calcEma(closes, 9);
    const e21 = calcEma(closes, 21);
    const bb = calcBb(closes, 20, 2);
    const rsiArr = calcRsi(closes, 14);
    const macdRes = calcMacd(closes, 12, 26, 9);
    const volMa = calcSma(volumes, 20);

    // Anchored VWAP from series start
    let pv = 0;
    let vv = 0;
    const vw: (number | null)[] = [];
    for (const c of candles) {
      const tp = (c.high + c.low + c.close) / 3;
      if (c.volume > 0) {
        pv += tp * c.volume;
        vv += c.volume;
      }
      vw.push(vv > 0 ? pv / vv : null);
    }

    const all: Bar[] = candles.map((c, i) => {
      const prevClose = i > 0 ? closes[i - 1] : null;
      const chg = prevClose
        ? ((c.close - prevClose) / prevClose) * 100
        : (c.changePct ?? null);
      return {
        ...c,
        idx: i,
        g: i,
        prevClose,
        chg,
        s20: fin(s20[i]),
        s50: fin(s50[i]),
        e9: fin(e9[i]),
        e21: fin(e21[i]),
        bbU: fin(bb.upper[i]),
        bbL: fin(bb.lower[i]),
        bbM: fin(bb.middle[i]),
        vwap: fin(vw[i]),
        rsi: fin(rsiArr[i]),
        macdL: fin(macdRes.macd[i]),
        macdS: fin(macdRes.signal[i]),
        macdH: fin(macdRes.histogram[i]),
      };
    });

    const events: PatternEvent[] = detectPatternEvents(
      candles,
      Math.min(nAll, 90),
      8,
      "moderate"
    );
    const sr = computeSrLevels(candles, Math.min(180, nAll));
    return { all, events, sr, volMa };
  }, [candles]);

  // ---------- visible window ----------
  const nAll = prepared?.all.length ?? 0;
  const vs = view ? clamp(view.start, 0, Math.max(0, nAll - MIN_VISIBLE)) : 0;
  const ve = view ? clamp(view.end, vs + MIN_VISIBLE, nAll) : nAll;

  const bars = React.useMemo(() => {
    if (!prepared) return null;
    return prepared.all.slice(vs, ve).map((b, li) => ({ ...b, idx: li }));
  }, [prepared, vs, ve]);

  const volMaWin = React.useMemo(() => {
    if (!prepared) return null;
    return prepared.volMa.slice(vs, ve);
  }, [prepared, vs, ve]);

  const winEvents = React.useMemo(() => {
    if (!prepared) return [] as PatternEvent[];
    return prepared.events
      .filter((e) => e.index >= vs && e.index < ve)
      .map((e) => ({ ...e, index: e.index - vs }));
  }, [prepared, vs, ve]);

  const evByIdx = React.useMemo(() => {
    const m = new Map<number, PatternEvent[]>();
    for (const e of winEvents) {
      const arr = m.get(e.index) ?? [];
      arr.push(e);
      m.set(e.index, arr);
    }
    return m;
  }, [winEvents]);

  // ---------- measured width ----------
  // Callback ref: the chart body mounts only once candles arrive, so a plain
  // mount-effect would observe nothing (wrapRef null) and the width would
  // stay stuck at the initial 880px. State-based ref re-attaches reliably.
  const [wrapEl, setWrapEl] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(880);
  React.useEffect(() => {
    if (!wrapEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(320, e.contentRect.width));
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);

  const n = bars?.length ?? 0;
  const last = prepared && nAll > 0 ? prepared.all[nAll - 1] : null;
  const hoveredGlobal = hovered;
  const hoveredBar =
    hoveredGlobal != null &&
    bars &&
    hoveredGlobal >= vs &&
    hoveredGlobal < ve
      ? bars[hoveredGlobal - vs]
      : null;
  const legendBar = hoveredBar ?? (bars && n > 0 ? bars[n - 1] : null) ?? last;

  const priceH = width < 640 ? 280 : 360;
  const volH = showVol ? (width < 640 ? 54 : 68) : 0;
  const rsiH = showRsi ? (width < 640 ? 64 : 76) : 0;
  const macdH = showMacd ? (width < 640 ? 68 : 84) : 0;

  // ---------- zoom / pan helpers ----------
  const applyZoom = React.useCallback(
    (factor: number, anchorLocal: number | null) => {
      if (nAll <= 0) return;
      const curStart = view ? view.start : 0;
      const curEnd = view ? view.end : nAll;
      const count = curEnd - curStart;
      const newCount = clamp(Math.round(count * factor), MIN_VISIBLE, nAll);
      const anchor =
        anchorLocal != null
          ? curStart + anchorLocal
          : curStart + Math.floor(count / 2);
      const ratio = count > 0 ? (anchor - curStart) / count : 0.5;
      let newStart = Math.round(anchor - newCount * ratio);
      newStart = clamp(newStart, 0, nAll - newCount);
      setView({ start: newStart, end: newStart + newCount });
    },
    [nAll, view]
  );

  const zoomIn = React.useCallback(() => applyZoom(1 / 1.4, null), [applyZoom]);
  const zoomOut = React.useCallback(() => applyZoom(1.4, null), [applyZoom]);
  const resetView = React.useCallback(() => setView(null), []);

  // Non-passive wheel listener (zoom) — must preventDefault, so React's
  // onWheel (passive on some browsers) is not enough.
  const priceSvgRef = React.useRef<SVGSVGElement | null>(null);
  const wheelStateRef = React.useRef({ nAll: 0, view: null as { start: number; end: number } | null, band: 1, vs: 0 });
  wheelStateRef.current = { nAll, view, band: n > 0 ? plotBand(width, n) : 1, vs };
  React.useEffect(() => {
    const el = priceSvgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = wheelStateRef.current;
      if (st.nAll <= 0) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const li = Math.floor((mx - PAD.l) / st.band);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const curStart = st.view ? st.view.start : 0;
      const curEnd = st.view ? st.view.end : st.nAll;
      const count = curEnd - curStart;
      const newCount = clamp(Math.round(count * factor), MIN_VISIBLE, st.nAll);
      const anchor = curStart + clamp(li, 0, count - 1);
      const ratio = count > 0 ? (anchor - curStart) / count : 0.5;
      let newStart = Math.round(anchor - newCount * ratio);
      newStart = clamp(newStart, 0, st.nAll - newCount);
      setView({ start: newStart, end: newStart + newCount });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars !== null, full]);

  // Keyboard navigation
  const onChartKeyDown = (e: React.KeyboardEvent) => {
    if (nAll <= 0) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHovered((h) => {
        const base = h != null ? h : ve - 1;
        return clamp(base - step, vs, ve - 1);
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHovered((h) => {
        const base = h != null ? h : vs - 1 + step;
        return clamp(base + step, vs, ve - 1);
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      const span = Math.max(MIN_VISIBLE, ve - vs);
      setView({ start: 0, end: Math.min(nAll, span) });
      setHovered(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setView(null);
      setHovered(nAll - 1);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomIn();
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomOut();
    } else if (e.key === "0") {
      e.preventDefault();
      resetView();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      setFull((v) => !v);
    } else if (e.key === "Escape") {
      if (full) setFull(false);
      else if (view) resetView();
    }
  };

  // ---------- scales ----------
  const plotW = Math.max(80, width - PAD.l - PAD.r);
  const band = n > 0 ? plotW / n : plotW;
  const xc = (i: number) => PAD.l + band * (i + 0.5);
  const bodyW = Math.max(1, Math.min(24, band * 0.7));

  let priceDomain: { min: number; max: number } | null = null;
  // Guard: only trust the trade plan when its levels are sane for the visible
  // view (protects against stale/foreign plans from another symbol or timeframe
  // blowing up the price axis — e.g. a KSE100 plan on a Rs 3 scrip).
  const lastCloseGuard = bars && n > 0 ? bars[n - 1].close : 0;
  const planSane =
    !!tradePlan && lastCloseGuard > 0
      ? [tradePlan.entry, tradePlan.stopLoss, tradePlan.target].every(
          (v) =>
            v == null ||
            (Number.isFinite(v) && Math.abs(v - lastCloseGuard) / lastCloseGuard < 0.5)
        )
      : false;
  if (bars && n > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (const b of bars) {
      min = Math.min(min, b.low);
      max = Math.max(max, b.high);
      if (showBb) {
        if (b.bbU != null) max = Math.max(max, b.bbU);
        if (b.bbL != null) min = Math.min(min, b.bbL);
      }
      if (showSma) {
        if (b.s20 != null) { min = Math.min(min, b.s20); max = Math.max(max, b.s20); }
        if (b.s50 != null) { min = Math.min(min, b.s50); max = Math.max(max, b.s50); }
      }
      if (showEma) {
        if (b.e9 != null) { min = Math.min(min, b.e9); max = Math.max(max, b.e9); }
        if (b.e21 != null) { min = Math.min(min, b.e21); max = Math.max(max, b.e21); }
      }
      if (showVwap && b.vwap != null) { min = Math.min(min, b.vwap); max = Math.max(max, b.vwap); }
    }
    if (planSane && tradePlan?.entry) { min = Math.min(min, tradePlan.entry); max = Math.max(max, tradePlan.entry); }
    if (planSane && tradePlan?.stopLoss) { min = Math.min(min, tradePlan.stopLoss); max = Math.max(max, tradePlan.stopLoss); }
    if (planSane && tradePlan?.target) { min = Math.min(min, tradePlan.target); max = Math.max(max, tradePlan.target); }
    const padPx = (max - min) * 0.06 || 1;
    priceDomain = { min: min - padPx, max: max + padPx };
  }
  const logOk =
    scaleMode === "log" &&
    !!priceDomain &&
    priceDomain.min > 0 &&
    (bars ?? []).every((b) => b.low > 0);
  const useLog = scaleMode === "log" && logOk;

  const yP = (p: number) => {
    if (!priceDomain) return 0;
    if (useLog) {
      const f = (v: number) => Math.log(Math.max(v, 1e-9));
      const span = f(priceDomain.max) - f(priceDomain.min) || 1;
      return PAD.t + (1 - (f(p) - f(priceDomain.min)) / span) * priceH;
    }
    const span = priceDomain.max - priceDomain.min || 1;
    return PAD.t + (1 - (p - priceDomain.min) / span) * priceH;
  };

  // ---------- line path helper ----------
  function linePath(
    get: (b: Bar) => number | null,
    y: (v: number) => number
  ): string {
    if (!bars) return "";
    let d = "";
    let started = false;
    for (const b of bars) {
      const v = get(b);
      if (v == null) {
        started = false;
        continue;
      }
      const x = xc(b.idx);
      const yy = y(v);
      d += `${started ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)} `;
      started = true;
    }
    return d.trim();
  }

  const xTicks = React.useMemo(() => {
    if (!bars || n === 0) return [] as number[];
    const maxLabels = width < 640 ? 4 : 9;
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, n, width]);

  const yTicks = priceDomain
    ? niceTicks(priceDomain.min, priceDomain.max, width < 640 ? 4 : 6)
    : [];

  const fmtAxisPrice = (v: number) =>
    Math.abs(v) >= 10000
      ? `${(v / 1000).toFixed(0)}k`
      : Math.abs(v) >= 1000
      ? `${(v / 1000).toFixed(1)}k`
      : v.toFixed(v >= 100 ? 1 : 2);

  const up = (b: Bar | null | undefined) => !!b && b.close >= b.open;
  const lastUp = last ? up(last) : true;

  const servedIv = served[`${symbol}|${tfKey}|${effInterval}`];
  const tfBadgeLabel = servedIv
    ? `${servedIv === "1wk" ? "weekly" : "daily"} candles`
    : effInterval === "5m" || effInterval === "15m"
    ? "intraday"
    : effInterval === "1wk"
    ? "weekly candles"
    : effInterval === "1mo"
    ? "monthly candles"
    : "daily candles";

  const retry = () => {
    fetchedRef.current.delete(`${symbol}|${tfKey}|${effInterval}`);
    setReloadNonce((x) => x + 1);
  };

  // ─────────────────────────────── render ───────────────────────────────
  return (
    <div
      className={cn(
        "space-y-2 outline-none",
        full ? "fixed inset-0 z-[70] overflow-auto bg-background p-3 sm:p-5" : className
      )}
      data-testid="pro-chart"
      tabIndex={0}
      onKeyDown={onChartKeyDown}
    >
      {/* ═══ Header: symbol + price + timeframe buttons ═══ */}
      <ChartHeader
        symbol={symbol}
        last={last}
        lastUp={lastUp}
        legendBar={legendBar}
        tfBadgeLabel={tfBadgeLabel}
        servedIv={servedIv}
        tfKey={tfKey}
        setTfKey={(k) => {
          setTfKey(k);
          setIntervalOverride(null);
        }}
        store={store}
        fetching={fetching}
        effInterval={effInterval}
        setIntervalOverride={(iv) => setIntervalOverride(iv === intervalOverride ? null : iv)}
        intervalOverride={intervalOverride}
      />

      {/* ═══ Controls: chart type + indicator toggles ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
            {(
              [
                { k: "candles", l: "Candles" },
                { k: "line", l: "Line" },
                { k: "area", l: "Area" },
              ] as { k: ChartType; l: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setChartType(t.k)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  chartType === t.k
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
            {INTERVALS.map((iv) => (
              <button
                key={iv.key}
                onClick={() => setIntervalOverride(intervalOverride === iv.key ? null : iv.key)}
                title={iv.hint}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors",
                  effInterval === iv.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
            {(
              [
                { k: "linear" as ScaleMode, l: "Lin" },
                { k: "log" as ScaleMode, l: "Log" },
              ]
            ).map((s) => (
              <button
                key={s.k}
                onClick={() => setScaleMode(s.k)}
                title={`${s.l === "Log" ? "Logarithmic" : "Linear"} price scale`}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  scaleMode === s.k
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { on: showSma, set: setShowSma, c: C.sma20, l: "SMA 20/50" },
              { on: showEma, set: setShowEma, c: C.ema9, l: "EMA 9/21" },
              { on: showBb, set: setShowBb, c: C.bb, l: "BB(20,2)" },
              { on: showVwap, set: setShowVwap, c: C.vwap, l: "VWAP" },
              { on: showSr, set: setShowSr, c: C.srSup, l: "S/R" },
              { on: showVol, set: setShowVol, c: "#64748B", l: "Vol" },
              { on: showRsi, set: setShowRsi, c: C.rsi, l: "RSI" },
              { on: showMacd, set: setShowMacd, c: C.macd, l: "MACD" },
            ] as { on: boolean; set: (f: (v: boolean) => boolean) => void; c: string; l: string }[]
          ).map((t) => (
            <button
              key={t.l}
              onClick={() => t.set((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors",
                t.on ? "bg-muted text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: t.on ? t.c : "transparent",
                  border: `1px solid ${t.c}`,
                }}
              />
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Chart body ═══ */}
      {fetching && !bars && (
        <div className="h-[360px] rounded-lg bg-muted/10 flex items-center justify-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-violet-500" />
          <p className="text-sm text-muted-foreground">Loading {tfKey} candles…</p>
        </div>
      )}
      {!fetching && error && !bars && (
        <div className="h-[360px] rounded-lg bg-muted/10 flex flex-col items-center justify-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={retry}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
      {bars && n === 0 && (
        <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
          No data for {cleanSymbol(symbol)}
        </div>
      )}
      {bars && n > 0 && (
        <div
          ref={setWrapEl}
          className="relative rounded-lg bg-muted/10 p-1 select-none"
        >
          {/* ── TradingView-style legend overlay ── */}
          <div className="absolute top-2 left-3 z-10 pointer-events-none text-[10px] leading-relaxed max-w-[calc(100%-90px)]">
            <div className="flex items-center gap-2 flex-wrap font-medium tabular-nums">
              <span className="text-muted-foreground">{fmtDateFull(legendBar?.date)}</span>
              <span className="text-muted-foreground">O</span>
              <LegendVal b={legendBar} get={(b) => b.open} up={up} />
              <span className="text-muted-foreground">H</span>
              <LegendVal b={legendBar} get={(b) => b.high} up={up} />
              <span className="text-muted-foreground">L</span>
              <LegendVal b={legendBar} get={(b) => b.low} up={up} />
              <span className="text-muted-foreground">C</span>
              <LegendVal b={legendBar} get={(b) => b.close} up={up} />
              <span
                className={cn(
                  "font-semibold",
                  (legendBar?.chg ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {legendBar?.chg == null ? "" : `${legendBar.chg >= 0 ? "+" : ""}${legendBar.chg.toFixed(2)}%`}
              </span>
              <span className="text-muted-foreground">Vol</span>
              <span className="text-foreground">{fmtVol(legendBar?.volume)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap tabular-nums mt-0.5">
              {showSma && legendBar?.s20 != null && (
                <span style={{ color: C.sma20 }}>SMA20 {fmtNum(legendBar.s20)}</span>
              )}
              {showSma && legendBar?.s50 != null && (
                <span style={{ color: C.sma50 }}>SMA50 {fmtNum(legendBar.s50)}</span>
              )}
              {showEma && legendBar?.e9 != null && (
                <span style={{ color: C.ema9 }}>EMA9 {fmtNum(legendBar.e9)}</span>
              )}
              {showEma && legendBar?.e21 != null && (
                <span style={{ color: C.ema21 }}>EMA21 {fmtNum(legendBar.e21)}</span>
              )}
              {showBb && legendBar?.bbU != null && (
                <span style={{ color: C.bb }}>
                  BB {fmtNum(legendBar.bbL)} / {fmtNum(legendBar.bbU)}
                </span>
              )}
              {showVwap && legendBar?.vwap != null && (
                <span style={{ color: C.vwap }}>VWAP {fmtNum(legendBar.vwap)}</span>
              )}
              {showRsi && legendBar?.rsi != null && (
                <span style={{ color: C.rsi }}>RSI {fmtNum(legendBar.rsi, 1)}</span>
              )}
            </div>
          </div>

          {/* fullscreen toggle */}
          <button
            onClick={() => setFull((v) => !v)}
            title={full ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
            className="absolute top-2 right-3 z-20 p-1 rounded bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          {/* ═══ PRICE PANEL ═══ */}
          <svg
            ref={priceSvgRef}
            width={width}
            height={priceH + PAD.t + PAD.b}
            onMouseDown={(e) => {
              dragRef.current = {
                x: e.clientX,
                start: vs,
                end: ve,
                moved: false,
              };
            }}
            onMouseMove={(e) => {
              const drag = dragRef.current;
              if (drag && drag.moved) {
                const dx = e.clientX - drag.x;
                const deltaBars = Math.round(dx / band);
                if (deltaBars !== 0) {
                  const span = drag.end - drag.start;
                  let ns = clamp(drag.start - deltaBars, 0, nAll - span);
                  setView({ start: ns, end: ns + span });
                  setHovered(null);
                }
                return;
              }
              if (drag && Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
              if (drag && drag.moved) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const li = Math.floor((mx - PAD.l) / band);
              setHovered(clamp(vs + li, vs, ve - 1));
            }}
            onMouseUp={() => {
              dragRef.current = null;
            }}
            onMouseLeave={() => {
              dragRef.current = null;
              setHovered(null);
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = e.touches[0].clientX - rect.left;
                const li = Math.floor((mx - PAD.l) / band);
                setHovered(clamp(vs + li, vs, ve - 1));
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = e.touches[0].clientX - rect.left;
                const li = Math.floor((mx - PAD.l) / band);
                setHovered(clamp(vs + li, vs, ve - 1));
              }
            }}
            onDoubleClick={resetView}
            className={cn("block", dragRef.current?.moved ? "cursor-grabbing" : "cursor-crosshair")}
          >
            <defs>
              <linearGradient id="pcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C4DFF" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#7C4DFF" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* grid + y labels */}
            {yTicks.map((t) => (
              <g key={`gy${t}`}>
                <line
                  x1={PAD.l}
                  x2={PAD.l + plotW}
                  y1={yP(t)}
                  y2={yP(t)}
                  stroke={C.grid}
                  strokeWidth={1}
                />
                <text
                  x={PAD.l + plotW + 6}
                  y={yP(t) + 3}
                  fontSize={9}
                  className="fill-muted-foreground"
                  style={{ fill: "var(--muted-foreground, #71717a)" }}
                >
                  {fmtAxisPrice(t)}
                </text>
              </g>
            ))}

            {/* x labels */}
            {xTicks.map((i) => (
              <text
                key={`gx${i}`}
                x={xc(i)}
                y={priceH + PAD.t + 14}
                fontSize={9}
                textAnchor="middle"
                style={{ fill: "var(--muted-foreground, #71717a)" }}
              >
                {fmtDateLabel(bars[i].date, servedIv ?? effInterval, nAll)}
              </text>
            ))}

            {/* BB fill */}
            {showBb && (
              <>
                <path
                  d={`${linePath((b) => b.bbU, yP)} ${bars
                    .slice()
                    .reverse()
                    .map((b) =>
                      b.bbL != null
                        ? `L${xc(b.idx).toFixed(1)} ${yP(b.bbL).toFixed(1)}`
                        : ""
                    )
                    .join(" ")} Z`}
                  fill={C.bb}
                  opacity={0.06}
                />
                <path d={linePath((b) => b.bbU, yP)} fill="none" stroke={C.bb} strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                <path d={linePath((b) => b.bbL, yP)} fill="none" stroke={C.bb} strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
              </>
            )}

            {/* Line / Area type */}
            {chartType !== "candles" && (
              <>
                {chartType === "area" && (
                  <path
                    d={`${linePath((b) => b.close, yP)} L${xc(n - 1)} ${PAD.t + priceH} L${xc(0)} ${PAD.t + priceH} Z`}
                    fill="url(#pcArea)"
                  />
                )}
                <path
                  d={linePath((b) => b.close, yP)}
                  fill="none"
                  stroke="#7C4DFF"
                  strokeWidth={1.8}
                />
              </>
            )}

            {/* Candles */}
            {chartType === "candles" &&
              bars.map((b) => {
                const isUp = up(b);
                const col = isUp ? C.bull : C.bear;
                const cx = xc(b.idx);
                const yHi = yP(b.high);
                const yLo = yP(b.low);
                const yTop = yP(Math.max(b.open, b.close));
                const yBot = yP(Math.min(b.open, b.close));
                const bodyH = Math.max(1, yBot - yTop);
                const bw = Math.max(1, Math.min(bodyW, band * 0.85));
                return (
                  <g key={b.g}>
                    <line
                      x1={cx}
                      x2={cx}
                      y1={yHi}
                      y2={yLo}
                      stroke={col}
                      strokeWidth={Math.min(1.2, Math.max(0.6, band * 0.08))}
                    />
                    <rect
                      x={cx - bw / 2}
                      y={yTop}
                      width={bw}
                      height={bodyH}
                      fill={col}
                      opacity={bw < 2 ? 0.9 : 1}
                    />
                  </g>
                );
              })}

            {/* SMA 20/50 */}
            {showSma && (
              <>
                <path d={linePath((b) => b.s20, yP)} fill="none" stroke={C.sma20} strokeWidth={1.4} />
                <path d={linePath((b) => b.s50, yP)} fill="none" stroke={C.sma50} strokeWidth={1.4} />
              </>
            )}
            {/* EMA 9/21 */}
            {showEma && (
              <>
                <path d={linePath((b) => b.e9, yP)} fill="none" stroke={C.ema9} strokeWidth={1.3} />
                <path d={linePath((b) => b.e21, yP)} fill="none" stroke={C.ema21} strokeWidth={1.3} />
              </>
            )}
            {/* VWAP */}
            {showVwap && (
              <path d={linePath((b) => b.vwap, yP)} fill="none" stroke={C.vwap} strokeWidth={1.2} strokeDasharray="3 2" opacity={0.85} />
            )}

            {/* Support / Resistance levels (from full-series pivots) */}
            {showSr && prepared?.sr && (
              <>
                {prepared.sr.resistances.map((r, i) => {
                  const y = yP(r.price);
                  if (y < PAD.t - 10 || y > PAD.t + priceH + 10) return null;
                  return (
                    <g key={`sr-r${i}`} opacity={0.75}>
                      <line x1={PAD.l} x2={PAD.l + plotW} y1={y} y2={y} stroke={C.srRes} strokeWidth={1} strokeDasharray="7 4" />
                      <text x={PAD.l + 4} y={y - 3} fontSize={8.5} fontWeight={600} fill={C.srRes}>
                        R{i + 1} {r.price.toFixed(r.price >= 100 ? 0 : 2)}
                      </text>
                    </g>
                  );
                })}
                {prepared.sr.supports.map((s, i) => {
                  const y = yP(s.price);
                  if (y < PAD.t - 10 || y > PAD.t + priceH + 10) return null;
                  return (
                    <g key={`sr-s${i}`} opacity={0.75}>
                      <line x1={PAD.l} x2={PAD.l + plotW} y1={y} y2={y} stroke={C.srSup} strokeWidth={1} strokeDasharray="7 4" />
                      <text x={PAD.l + 4} y={y + 10} fontSize={8.5} fontWeight={600} fill={C.srSup}>
                        S{i + 1} {s.price.toFixed(s.price >= 100 ? 0 : 2)}
                      </text>
                    </g>
                  );
                })}
              </>
            )}

            {/* Trade plan levels (only when sane for this view) */}
            {planSane && tradePlan?.entry && (
              <PlanLine y={yP(tradePlan.entry)} color={C.bull} label={`BUY ${tradePlan.entry.toFixed(2)}`} plotW={plotW} />
            )}
            {planSane && tradePlan?.stopLoss && (
              <PlanLine y={yP(tradePlan.stopLoss)} color={C.bear} label={`SL ${tradePlan.stopLoss.toFixed(2)}`} plotW={plotW} />
            )}
            {planSane && tradePlan?.target && (
              <PlanLine y={yP(tradePlan.target)} color="#7C4DFF" label={`TGT ${tradePlan.target.toFixed(2)}`} plotW={plotW} />
            )}

            {/* Last price line + chip */}
            {last && (
              <>
                <line
                  x1={PAD.l}
                  x2={PAD.l + plotW}
                  y1={yP(last.close)}
                  y2={yP(last.close)}
                  stroke={lastUp ? C.bullLight : C.bearLight}
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  opacity={0.7}
                />
                <rect
                  x={PAD.l + plotW + 2}
                  y={yP(last.close) - 7}
                  width={PAD.r - 6}
                  height={14}
                  rx={2}
                  fill={lastUp ? C.bull : C.bear}
                />
                <text
                  x={PAD.l + plotW + 5}
                  y={yP(last.close) + 3.5}
                  fontSize={9.5}
                  fontWeight={700}
                  fill="#fff"
                >
                  {fmtAxisPrice(last.close)}
                </text>
              </>
            )}

            {/* Hovered-close chip on the axis */}
            {hoveredBar && (!last || hoveredBar.g !== last.g) && (
              <>
                <rect
                  x={PAD.l + plotW + 2}
                  y={yP(hoveredBar.close) - 7}
                  width={PAD.r - 6}
                  height={14}
                  rx={2}
                  fill="#7C3AED"
                />
                <text
                  x={PAD.l + plotW + 5}
                  y={yP(hoveredBar.close) + 3.5}
                  fontSize={9.5}
                  fontWeight={700}
                  fill="#fff"
                >
                  {fmtAxisPrice(hoveredBar.close)}
                </text>
              </>
            )}

            {/* Pattern markers */}
            {winEvents.map((e) => {
              const b = bars[e.index];
              if (!b) return null;
              const cx = xc(e.index);
              const bullish = e.type === "bullish";
              const neutral = e.type === "neutral";
              const yy = bullish ? yP(b.low) + 13 : yP(b.high) - 8;
              const glyph = neutral ? "◆" : bullish ? "▲" : "▼";
              const col = neutral ? "#F59E0B" : bullish ? C.bullLight : C.bearLight;
              return (
                <text
                  key={`${e.name}-${e.index}`}
                  x={cx}
                  y={yy}
                  fontSize={band > 6 ? 9 : 7}
                  textAnchor="middle"
                  fill={col}
                  style={{ pointerEvents: "all", cursor: "help" }}
                >
                  <title>{`${e.name} (${e.strength}, ${e.type}) — ${fmtDateFull(b.date)}`}</title>
                  {glyph}
                </text>
              );
            })}

            {/* Crosshair */}
            {hoveredBar && (
              <>
                <line
                  x1={xc(hoveredBar.idx)}
                  x2={xc(hoveredBar.idx)}
                  y1={PAD.t}
                  y2={PAD.t + priceH}
                  stroke="#A855F7"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <line
                  x1={PAD.l}
                  x2={PAD.l + plotW}
                  y1={yP(hoveredBar.close)}
                  y2={yP(hoveredBar.close)}
                  stroke="#A855F7"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.4}
                />
              </>
            )}
          </svg>

          {/* ── Floating bar tooltip (follows crosshair) ── */}
          {hoveredBar && !dragRef.current?.moved && (
            <div
              className="absolute z-30 pointer-events-none rounded-lg border border-border/70 bg-background/95 backdrop-blur shadow-lg px-2.5 py-2 text-[10px] leading-relaxed w-[188px]"
              style={{
                left: clamp(
                  hoveredBar.idx * band + 14 > width - 204
                    ? hoveredBar.idx * band - 202
                    : hoveredBar.idx * band + 14,
                  4,
                  Math.max(4, width - 204)
                ),
                top: 46,
              }}
            >
              <p className="font-semibold text-foreground/80 mb-1">
                {fmtDateFull(hoveredBar.date)}
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
                <TooltipRow k="Open" v={fmtNum(hoveredBar.open)} />
                <TooltipRow k="High" v={fmtNum(hoveredBar.high)} tone="up" />
                <TooltipRow k="Low" v={fmtNum(hoveredBar.low)} tone="down" />
                <TooltipRow
                  k="Close"
                  v={fmtNum(hoveredBar.close)}
                  tone={up(hoveredBar) ? "up" : "down"}
                />
              </div>
              <div className="mt-1 pt-1 border-t border-border/50 grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
                <TooltipRow
                  k="Change"
                  v={hoveredBar.chg == null ? "—" : `${hoveredBar.chg >= 0 ? "+" : ""}${hoveredBar.chg.toFixed(2)}%`}
                  tone={(hoveredBar.chg ?? 0) >= 0 ? "up" : "down"}
                />
                <TooltipRow k="Volume" v={fmtVol(hoveredBar.volume)} />
              </div>
              {(hoveredBar.s20 != null || hoveredBar.e9 != null || hoveredBar.rsi != null) && (
                <div className="mt-1 pt-1 border-t border-border/50 flex flex-wrap gap-x-2 gap-y-0.5 tabular-nums">
                  {hoveredBar.s20 != null && <span style={{ color: C.sma20 }}>S20 {hoveredBar.s20.toFixed(1)}</span>}
                  {hoveredBar.s50 != null && <span style={{ color: C.sma50 }}>S50 {hoveredBar.s50.toFixed(1)}</span>}
                  {hoveredBar.e9 != null && <span style={{ color: C.ema9 }}>E9 {hoveredBar.e9.toFixed(1)}</span>}
                  {hoveredBar.rsi != null && <span style={{ color: C.rsi }}>RSI {hoveredBar.rsi.toFixed(0)}</span>}
                </div>
              )}
              {evByIdx.get(hoveredBar.idx)?.length ? (
                <div className="mt-1 pt-1 border-t border-border/50 flex flex-wrap gap-1">
                  {evByIdx.get(hoveredBar.idx)!.map((e, i) => (
                    <span
                      key={i}
                      className={cn(
                        "px-1 rounded text-[9px] font-medium",
                        e.type === "bullish"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : e.type === "bearish"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {e.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* ── VOLUME PANEL ── */}
          {showVol && bars && (
            <VolPanel
              bars={bars}
              volMa={volMaWin}
              width={width}
              height={volH}
              band={band}
              bodyW={bodyW}
              xc={xc}
              hoveredLocal={hoveredBar ? hoveredBar.idx : null}
              setHoveredGlobal={(li) => setHovered(clamp(vs + li, vs, ve - 1))}
              clearHovered={() => setHovered(null)}
              PAD={PAD}
            />
          )}

          {/* ── RSI PANEL ── */}
          {showRsi && bars && (
            <RsiPanel
              bars={bars}
              width={width}
              height={rsiH}
              xc={xc}
              hoveredLocal={hoveredBar ? hoveredBar.idx : null}
              setHoveredGlobal={(li) => setHovered(clamp(vs + li, vs, ve - 1))}
              clearHovered={() => setHovered(null)}
              band={band}
              PAD={PAD}
            />
          )}

          {/* ── MACD PANEL ── */}
          {showMacd && bars && (
            <MacdPanel
              bars={bars}
              width={width}
              height={macdH}
              xc={xc}
              hoveredLocal={hoveredBar ? hoveredBar.idx : null}
              setHoveredGlobal={(li) => setHovered(clamp(vs + li, vs, ve - 1))}
              clearHovered={() => setHovered(null)}
              band={band}
              PAD={PAD}
            />
          )}

          {/* hover date + pattern info footer strip */}
          {hoveredBar && (
            <div className="absolute bottom-1 right-14 text-[9px] text-muted-foreground tabular-nums pointer-events-none">
              {fmtDateFull(hoveredBar.date)}
              {evByIdx.get(hoveredBar.idx)?.length
                ? ` · ${evByIdx.get(hoveredBar.idx)!.map((e) => e.name).join(" + ")}`
                : ""}
            </div>
          )}

          {/* zoom hint (visible when partially zoomed) */}
          {view && (view.start > 0 || view.end < nAll) && (
            <div className="absolute bottom-1 left-3 flex items-center gap-1 text-[9px] text-muted-foreground pointer-events-none">
              <ZoomIn className="h-2.5 w-2.5" />
              {vs + 1}–{ve} of {nAll} · scroll to zoom, drag to pan, double-click to reset
            </div>
          )}
        </div>
      )}

      {/* ═══ Footer: period stats + OHLC cards ═══ */}
      {bars && n > 0 && last && (
        <>
          <div className="grid grid-cols-4 gap-2 pt-1">
            <StatCard label="OPEN" value={last.open.toFixed(2)} />
            <StatCard label="HIGH" value={last.high.toFixed(2)} tone="up" />
            <StatCard label="LOW" value={last.low.toFixed(2)} tone="down" />
            <StatCard
              label="CLOSE"
              value={last.close.toFixed(2)}
              tone={lastUp ? "up" : "down"}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
            <span>
              candles: <span className="font-medium text-foreground tabular-nums">{nAll}</span>
            </span>
            <span>
              · period chg:{" "}
              <PeriodChg bars={bars} />
            </span>
            <span>
              · period H: <span className="font-medium text-foreground tabular-nums">{fmtNum(periodHigh(bars))}</span>
            </span>
            <span>
              · period L: <span className="font-medium text-foreground tabular-nums">{fmtNum(periodLow(bars))}</span>
            </span>
            <span>
              · avg vol: <span className="font-medium text-foreground tabular-nums">{fmtVol(periodAvgVol(bars))}</span>
            </span>
            {winEvents.length > 0 && (
              <span>
                · patterns: <span className="font-medium text-foreground">{winEvents.length}</span>
              </span>
            )}
          </div>
          {srcInfo && (
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/80">
              <CrosshairIcon className="h-2.5 w-2.5" />
              <span className="truncate" title={srcInfo.source}>
                {srcInfo.source}
              </span>
              <span>· fetched {new Date(srcInfo.fetchedAt).toLocaleTimeString()}</span>
              <button
                onClick={retry}
                className="ml-1 inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
                title="Reload candles"
              >
                <RefreshCw className="h-2.5 w-2.5" /> refresh
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// plot band helper used by the wheel listener before `band` exists
function plotBand(width: number, count: number): number {
  const plotW = Math.max(80, width - PAD.l - PAD.r);
  return count > 0 ? plotW / count : plotW;
}

function periodHigh(bars: Bar[] | null): number | null {
  if (!bars || bars.length === 0) return null;
  return Math.max(...bars.map((b) => b.high));
}
function periodLow(bars: Bar[] | null): number | null {
  if (!bars || bars.length === 0) return null;
  return Math.min(...bars.map((b) => b.low));
}
function periodAvgVol(bars: Bar[] | null): number | null {
  if (!bars || bars.length === 0) return null;
  return bars.reduce((a, b) => a + (b.volume || 0), 0) / bars.length;
}

function PeriodChg({ bars }: { bars: Bar[] | null }) {
  if (!bars || bars.length < 2) return <span>—</span>;
  const chg = ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        chg >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      )}
    >
      {chg >= 0 ? "+" : ""}
      {chg.toFixed(2)}%
    </span>
  );
}

function LegendVal({
  b,
  get,
  up: isUp,
}: {
  b: Bar | null | undefined;
  get: (b: Bar) => number;
  up: (b: Bar | null | undefined) => boolean;
}) {
  return (
    <span className={isUp(b) ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
      {fmtNum(b ? get(b) : null)}
    </span>
  );
}

function TooltipRow({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={cn(
          "font-medium",
          tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : "text-foreground"
        )}
      >
        {v}
      </span>
    </span>
  );
}

// ───────────────────────── header sub-component ─────────────────────────
function ChartHeader({
  symbol,
  last,
  lastUp,
  legendBar,
  tfBadgeLabel,
  servedIv,
  tfKey,
  setTfKey,
  store,
  fetching,
  effInterval,
  setIntervalOverride,
  intervalOverride,
}: {
  symbol: string;
  last: Bar | null;
  lastUp: boolean;
  legendBar: Bar | null | undefined;
  tfBadgeLabel: string;
  servedIv?: IntervalKey;
  tfKey: TfKey;
  setTfKey: (k: TfKey) => void;
  store: Partial<Record<string, Candle[]>>;
  fetching: boolean;
  effInterval: IntervalKey;
  setIntervalOverride: (iv: IntervalKey) => void;
  intervalOverride: IntervalKey | null;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <h4 className="text-sm font-semibold flex items-center gap-1.5 shrink-0">
          <CandlestickChart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          {cleanSymbol(symbol)}
        </h4>
        {last && (
          <>
            <span
              className={cn(
                "text-lg font-bold tabular-nums leading-none",
                lastUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {last.close.toFixed(2)}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] tabular-nums",
                (legendBar?.chg ?? 0) >= 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
              )}
            >
              {(legendBar?.chg ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(legendBar?.chg ?? 0).toFixed(2)}%
            </Badge>
          </>
        )}
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-muted-foreground">
          {tfBadgeLabel}
        </Badge>
        {servedIv && (
          <span className="text-[9px] text-amber-600 dark:text-amber-400">
            intraday history unavailable — showing {servedIv === "1wk" ? "weekly" : "daily"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {TIMEFRAMES.map((t) => {
          const active = t.key === tfKey;
          const loaded = !!store[`${symbol}|${t.key}|${t.interval}`];
          return (
            <button
              key={t.key}
              onClick={() => setTfKey(t.key)}
              title={t.hint}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-semibold transition-colors relative",
                active
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.label}
              {active && fetching && !loaded && (
                <RefreshCw className="h-2 w-2 absolute -top-0.5 -right-0.5 animate-spin" />
              )}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" />
        {INTERVALS.map((iv) => (
          <button
            key={iv.key}
            onClick={() => setIntervalOverride(iv.key)}
            title={iv.hint}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors",
              effInterval === iv.key
                ? "bg-violet-600/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/40"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              intervalOverride === iv.key && "ring-2"
            )}
          >
            {iv.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function PlanLine({ y, color, label, plotW }: { y: number; color: string; label: string; plotW: number }) {
  return (
    <g>
      <line x1={PAD.l} x2={PAD.l + plotW} y1={y} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray="6 3" opacity={0.75} />
      <text x={PAD.l + plotW - 4} y={y - 3} fontSize={9} fontWeight={600} textAnchor="end" fill={color}>
        {label}
      </text>
    </g>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1 text-center",
        tone === "up"
          ? "border-emerald-200/40 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10"
          : tone === "down"
          ? "border-rose-200/40 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10"
          : "border-border/40 bg-muted/20"
      )}
    >
      <p
        className={cn(
          "text-[9px] font-medium",
          tone === "up"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "down"
            ? "text-rose-700 dark:text-rose-300"
            : "text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums",
          tone === "up"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "down"
            ? "text-rose-700 dark:text-rose-300"
            : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// Shared hover logic for sub-panels (local index → global via setHoveredGlobal)
function subOnMouseMove(
  e: React.MouseEvent<SVGSVGElement>,
  band: number,
  count: number,
  setHoveredGlobal: (li: number) => void
) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const li = Math.floor((mx - PAD.l) / band);
  setHoveredGlobal(Math.max(0, Math.min(count - 1, li)));
}

function VolPanel({
  bars, volMa, width, height, band, bodyW, xc, hoveredLocal, setHoveredGlobal, clearHovered, PAD: P,
}: {
  bars: Bar[];
  volMa: (number | null)[] | null;
  width: number;
  height: number;
  band: number;
  bodyW: number;
  xc: (i: number) => number;
  hoveredLocal: number | null;
  setHoveredGlobal: (li: number) => void;
  clearHovered: () => void;
  PAD: { l: number; r: number; t: number; b: number };
}) {
  const maxV = Math.max(...bars.map((b) => b.volume || 0), 1);
  const y = (v: number) => P.t * 0.5 + (1 - v / (maxV * 1.1)) * height;
  let maD = "";
  let started = false;
  if (volMa) {
    for (let i = 0; i < bars.length; i++) {
      const v = volMa[i];
      if (v == null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      maD += `${started ? "L" : "M"}${xc(bars[i].idx).toFixed(1)} ${y(v).toFixed(1)} `;
      started = true;
    }
  }
  return (
    <div className="relative">
      <p className="text-[9px] text-muted-foreground absolute top-0.5 left-2 z-10 pointer-events-none">
        Volume <span className="font-medium text-foreground">{fmtVol(bars[bars.length - 1]?.volume)}</span>
        {volMa && volMa[volMa.length - 1] != null && (
          <span className="ml-2" style={{ color: C.last }}>
            MA20 {fmtVol(volMa[volMa.length - 1]!)}
          </span>
        )}
      </p>
      <svg
        width={width}
        height={height + P.t}
        className="block"
        onMouseMove={(e) => subOnMouseMove(e, band, bars.length, setHoveredGlobal)}
        onMouseLeave={clearHovered}
      >
        <line x1={P.l} x2={P.l + width - P.r} y1={P.t * 0.5 + height} y2={P.t * 0.5 + height} stroke={C.grid} />
        {bars.map((b) => {
          const col = b.close >= b.open ? C.bull : C.bear;
          const yTop = y(b.volume || 0);
          return (
            <rect
              key={b.g}
              x={xc(b.idx) - Math.max(1, bodyW * 0.7) / 2}
              y={yTop}
              width={Math.max(1, bodyW * 0.7)}
              height={Math.max(0.5, P.t * 0.5 + height - yTop)}
              fill={col}
              opacity={0.55}
            />
          );
        })}
        {maD && <path d={maD} fill="none" stroke={C.last} strokeWidth={1.1} opacity={0.9} />}
        {/* max volume label */}
        <text
          x={P.l + width - P.r + 6}
          y={y(maxV) + 3}
          fontSize={8}
          style={{ fill: "var(--muted-foreground, #71717a)" }}
        >
          {fmtVol(maxV)}
        </text>
        {hoveredLocal != null && hoveredLocal < bars.length && (
          <line
            x1={xc(hoveredLocal)}
            x2={xc(hoveredLocal)}
            y1={0}
            y2={height + P.t}
            stroke="#A855F7"
            strokeWidth={0.8}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}
      </svg>
    </div>
  );
}

function RsiPanel({
  bars, width, height, xc, hoveredLocal, setHoveredGlobal, clearHovered, band, PAD: P,
}: {
  bars: Bar[];
  width: number;
  height: number;
  xc: (i: number) => number;
  hoveredLocal: number | null;
  setHoveredGlobal: (li: number) => void;
  clearHovered: () => void;
  band: number;
  PAD: { l: number; r: number; t: number; b: number };
}) {
  const plotH = height;
  const y = (v: number) => P.t + (1 - v / 100) * plotH;
  let d = "";
  let started = false;
  for (const b of bars) {
    if (b.rsi == null) {
      started = false;
      continue;
    }
    d += `${started ? "L" : "M"}${xc(b.idx).toFixed(1)} ${y(b.rsi).toFixed(1)} `;
    started = true;
  }
  const lastRsi = bars[bars.length - 1]?.rsi ?? null;
  return (
    <div className="relative">
      <p className="text-[9px] absolute top-0.5 left-2 z-10 pointer-events-none" style={{ color: C.rsi }}>
        RSI(14){" "}
        <span className="font-semibold tabular-nums">
          {lastRsi == null ? "—" : lastRsi.toFixed(1)}
          {lastRsi != null ? (lastRsi > 70 ? " · overbought" : lastRsi < 30 ? " · oversold" : "") : ""}
        </span>
      </p>
      <svg
        width={width}
        height={height + P.t + 4}
        className="block"
        onMouseMove={(e) => subOnMouseMove(e, band, bars.length, setHoveredGlobal)}
        onMouseLeave={clearHovered}
      >
        <rect x={P.l} y={y(70)} width={width - P.r - P.l} height={y(30) - y(70)} fill={C.rsi} opacity={0.05} />
        {[30, 50, 70].map((lvl) => (
          <g key={lvl}>
            <line
              x1={P.l}
              x2={P.l + width - P.r - P.l}
              y1={y(lvl)}
              y2={y(lvl)}
              stroke={lvl === 50 ? C.grid : C.gridStrong}
              strokeDasharray={lvl === 50 ? "2 3" : "4 2"}
              strokeWidth={0.8}
            />
            <text x={P.l + width - P.r + 6} y={y(lvl) + 3} fontSize={8} style={{ fill: "var(--muted-foreground, #71717a)" }}>
              {lvl}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={C.rsi} strokeWidth={1.3} />
        {hoveredLocal != null && hoveredLocal >= 0 && hoveredLocal < bars.length && (
          <line x1={xc(hoveredLocal)} x2={xc(hoveredLocal)} y1={P.t} y2={P.t + plotH} stroke="#A855F7" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
        )}
      </svg>
    </div>
  );
}

function MacdPanel({
  bars, width, height, xc, hoveredLocal, setHoveredGlobal, clearHovered, band, PAD: P,
}: {
  bars: Bar[];
  width: number;
  height: number;
  xc: (i: number) => number;
  hoveredLocal: number | null;
  setHoveredGlobal: (li: number) => void;
  clearHovered: () => void;
  band: number;
  PAD: { l: number; r: number; t: number; b: number };
}) {
  let m = 0;
  for (const b of bars) {
    for (const v of [b.macdL, b.macdS, b.macdH]) if (v != null) m = Math.max(m, Math.abs(v));
  }
  m = m * 1.15 || 1;
  const y = (v: number) => P.t + (1 - (v + m) / (2 * m)) * height;
  const path = (get: (b: Bar) => number | null) => {
    let d = "";
    let started = false;
    for (const b of bars) {
      const v = get(b);
      if (v == null) {
        started = false;
        continue;
      }
      d += `${started ? "L" : "M"}${xc(b.idx).toFixed(1)} ${y(v).toFixed(1)} `;
      started = true;
    }
    return d;
  };
  const lastM = bars[bars.length - 1]?.macdL ?? null;
  return (
    <div className="relative">
      <p className="text-[9px] absolute top-0.5 left-2 z-10 pointer-events-none">
        <span style={{ color: C.macd }}>MACD(12,26,9)</span>{" "}
        <span className="font-semibold tabular-nums text-foreground">{lastM == null ? "—" : lastM.toFixed(2)}</span>
      </p>
      <svg
        width={width}
        height={height + P.t + 4}
        className="block"
        onMouseMove={(e) => subOnMouseMove(e, band, bars.length, setHoveredGlobal)}
        onMouseLeave={clearHovered}
      >
        <line x1={P.l} x2={P.l + width - P.r - P.l} y1={y(0)} y2={y(0)} stroke={C.gridStrong} strokeWidth={0.8} />
        {bars.map((b) =>
          b.macdH == null ? null : (
            <rect
              key={b.g}
              x={xc(b.idx) - Math.max(1, band * 0.3) / 2}
              y={Math.min(y(b.macdH), y(0))}
              width={Math.max(1, band * 0.3)}
              height={Math.max(0.5, Math.abs(y(b.macdH) - y(0)))}
              fill={b.macdH >= 0 ? C.bull : C.bear}
              opacity={0.5}
            />
          )
        )}
        <path d={path((b) => b.macdL)} fill="none" stroke={C.macd} strokeWidth={1.2} />
        <path d={path((b) => b.macdS)} fill="none" stroke={C.macdSignal} strokeWidth={1.2} />
        {hoveredLocal != null && hoveredLocal >= 0 && hoveredLocal < bars.length && (
          <line x1={xc(hoveredLocal)} x2={xc(hoveredLocal)} y1={P.t} y2={P.t + height} stroke="#A855F7" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
        )}
      </svg>
    </div>
  );
}
