"use client";

import * as React from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Brain,
  CandlestickChart,
  Clock,
  Crosshair,
  Gauge,
  LayoutDashboard,
  Loader2,
  Minus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Wifi,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfessionalChart } from "@/components/professional-chart";
import { cleanSymbol } from "@/lib/symbol-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Wallet,
  BellRing,
  PlayCircle,
} from "lucide-react";

// ---------- Risk-managed signal types ----------
interface SafeSignalRow {
  signal: {
    symbol: string;
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry: number;
    stopLoss: number;
    target: number;
    riskReward: number;
    price: number;
    aiSummary?: string;
  };
  position: {
    qty: number;
    positionValue: number;
    riskAmount: number;
    rewardAmount: number;
    positionPct: number;
    riskPct: number;
  };
}

interface PaperPosition {
  id: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  status: string;
  confidence: number;
  reason: string;
  openedAt: string;
  currentPrice?: number;
  currentValue?: number;
  unrealizedPnl?: number;
  unrealizedPct?: number;
}

interface Portfolio {
  capital: number;
  invested: number;
  cash: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  totalValue: number;
  positions: PaperPosition[];
  recentClosed: PaperPosition[];
}

interface AlertLogItem {
  id: string;
  kind: string;
  symbol: string | null;
  title: string;
  body: string;
  channels: string;
  at: string;
}

// ---------- Types ----------
interface RealStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  bid: number;
  ask: number;
  high52: number;
  low52: number;
  ldcp?: number;
  open?: number;
  high?: number;
  low?: number;
  sector?: string;
}

interface RealIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePct: number;
}

interface Candle {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct?: number;
}

interface PatternMatch {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  strength: "weak" | "moderate" | "strong";
  description: string;
}

interface CompositeSignal {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasons: string[];
  entry?: number;
  stopLoss?: number;
  target?: number;
  riskReward?: number;
}

interface IndicatorSnapshot {
  price: number;
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  atr14: number;
  stochK: number;
  stochD: number;
  vwap: number;
  rsiPrev: number;
  macdPrev: number;
  closePrev: number;
}

interface QuoteData {
  indices: RealIndex[];
  scrips: RealStock[];
  featured: RealStock[];
  gainers: RealStock[];
  losers: RealStock[];
  fetchedAt: string;
  source: string;
}

interface CandlesData {
  symbol: string;
  interval: string;
  candles: Candle[];
  fetchedAt: string;
  source: string;
}

interface AnalysisData {
  composite: CompositeSignal;
  indicators: IndicatorSnapshot;
  patterns: PatternMatch[];
  aiSummary?: string;
  candles?: Candle[];
  at: number;
}

interface IpoItem {
  title: string;
  date: string;
  kind: "ipo-result" | "ipo-subscription" | "ipo-book-building" | "ipo-listing" | "ipo-other";
}

interface SignalRow {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  price: number;
  entry?: number;
  stopLoss?: number;
  target?: number;
  aiSummary?: string;
  error?: string;
}

// ---------- Screener row (full OHLCV per scrip) ----------
interface ScreenerRow {
  symbol: string;
  cleanName: string;
  futureMonth: string | null;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  changePct: number;
  volume: number;
  sector: string;
  buyBelow: number;
  sellAbove: number;
}

type SortKey = "volume" | "gainers" | "losers" | "changePct";

// ---------- All-stocks analysis row ----------
interface ScripAnalysisRow {
  symbol: string;
  sector: string;
  price: number;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: number;
  signals: string[];
  patterns: PatternMatch[];
  score: number;
}

interface BestTradeRow {
  analysis: ScripAnalysisRow;
  consensus?: {
    consensus: string;
    votes: Array<{ provider: string; action: string; reasoning: string; error?: string }>;
    agreeCount: number;
    totalCount: number;
  };
  position: {
    qty: number;
    positionValue: number;
    riskAmount: number;
    rewardAmount: number;
    positionPct: number;
    riskPct: number;
  };
}

// ---------- Component ----------
export function PsxAlphaView() {
  const { toast } = useToast();

  const [quote, setQuote] = React.useState<QuoteData | null>(null);
  const [candles, setCandles] = React.useState<Candle[]>([]);
  const [analysisCandles, setAnalysisCandles] = React.useState<Candle[]>([]);
  const [analysis, setAnalysis] = React.useState<AnalysisData | null>(null);
  const [signals, setSignals] = React.useState<SignalRow[]>([]);
  const [ipos, setIpos] = React.useState<IpoItem[]>([]);

  // Default symbol — use the first available scrip from featured list (real stock, not KSE100 index)
  // KSE100 is an index, not a tradable stock — we don't show its trade plan
  const [symbol, setSymbol] = React.useState<string>("");
  const [search, setSearch] = React.useState("");

  const [loadingQuote, setLoadingQuote] = React.useState(true);
  const [loadingCandles, setLoadingCandles] = React.useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = React.useState(true);
  const [loadingSignals, setLoadingSignals] = React.useState(true);
  const [loadingIpos, setLoadingIpos] = React.useState(true);

  // Paper trading + alerts state
  const [portfolio, setPortfolio] = React.useState<Portfolio | null>(null);
  const [safeSignals, setSafeSignals] = React.useState<SafeSignalRow[]>([]);
  const [nearMissSignals, setNearMissSignals] = React.useState<Array<SafeSignalRow & { missReason: string }>>([]);
  const [safeStats, setSafeStats] = React.useState<{ total_scanned: number; total_buy: number } | null>(null);
  const [alertsLog, setAlertsLog] = React.useState<AlertLogItem[]>([]);
  const [screenerRows, setScreenerRows] = React.useState<ScreenerRow[]>([]);
  const [screenerSort, setScreenerSort] = React.useState<SortKey>("volume");
  const [screenerSector, setScreenerSector] = React.useState<string>("");
  const [screenerFilter, setScreenerFilter] = React.useState<string>("");
  const [activeSection, setActiveSection] = React.useState<string>("overview");
  // AI ensemble + best trades state
  const [analyzeAll, setAnalyzeAll] = React.useState<{
    total: number;
    buy_count: number;
    sell_count: number;
    hold_count: number;
    top_buy: ScripAnalysisRow[];
    top_sell: ScripAnalysisRow[];
    all: ScripAnalysisRow[];
  } | null>(null);
  const [bestTrades, setBestTrades] = React.useState<{
    capital: number;
    providers: { id: string; label: string }[];
    best_buy: BestTradeRow[];
    best_sell: BestTradeRow[];
    total_scanned: number;
  } | null>(null);
  const [loadingAnalyzeAll, setLoadingAnalyzeAll] = React.useState(false);
  const [loadingBestTrades, setLoadingBestTrades] = React.useState(false);
  const [analysisFilter, setAnalysisFilter] = React.useState<"ALL" | "BUY" | "SELL" | "HOLD">("ALL");
  const [newListings, setNewListings] = React.useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<{
    market: { open: boolean; note: string };
    psx: { connected: boolean; lastFetchAgo: string; scripsCount: number };
    investing: { connected: boolean; lastFetchAgo: string; candlesCount: number };
    uptime: { human: string };
  } | null>(null);
  const [autoExecute, setAutoExecute] = React.useState(false);
  const [executingAuto, setExecutingAuto] = React.useState(false);

  const [refreshing, setRefreshing] = React.useState(false);

  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch quote (real-time prices)
  const fetchQuote = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/quote", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setQuote(json.data);
        setLastUpdate(new Date());
        setError(null);
      } else throw new Error(json.error);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  // Fetch candles
  const fetchCandles = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/candles", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setCandles(json.data.candles);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCandles(false);
    }
  }, []);

  // Fetch analysis for current symbol
  const fetchAnalysis = React.useCallback(
    async (sym: string) => {
      setLoadingAnalysis(true);
      try {
        const res = await fetch(
          `/api/psx/analyze?symbol=${encodeURIComponent(sym)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (json.ok) {
          setAnalysis(json.data);
          // Extract per-scrip candles for chart (non-KSE100)
          if (json.data.candles && json.data.candles.length > 0) {
            setAnalysisCandles(json.data.candles);
          }
        } else {
          toast({
            title: "Analysis failed",
            description: json.error ?? "Unknown error",
            variant: "destructive",
          });
          setAnalysis(null);
        }
      } catch (e) {
        console.error(e);
        setAnalysis(null);
      } finally {
        setLoadingAnalysis(false);
      }
    },
    [toast]
  );

  // Fetch watchlist signals
  const fetchSignals = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/signals", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setSignals(json.data.signals);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  // Fetch IPOs
  const fetchIpos = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/ipo", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setIpos(json.data.ipos);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingIpos(false);
    }
  }, []);

  // Fetch safe signals (full-scan version — scans all ~150 scrips, not just 12)
  const fetchSafeSignals = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/safe-signals", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setSafeSignals(json.data.safe_signals);
        setNearMissSignals(json.data.near_misses ?? []);
        setSafeStats({
          total_scanned: json.data.total_scanned,
          total_buy: json.data.total_buy,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch screener rows (all scrips with full OHLCV + buy/sell ref)
  const fetchScreener = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200", sort: screenerSort });
      if (screenerSector) params.set("sector", screenerSector);
      const res = await fetch(
        `/api/psx/screener?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (json.ok) setScreenerRows(json.data.rows);
    } catch (e) {
      console.error(e);
    }
  }, [screenerSort, screenerSector]);

  // Fetch 24/7 connection status (market open/closed + psx/investing health)
  const fetchConnectionStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/status", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setConnectionStatus(json.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch all-stocks analysis (146 scrips analyzed in fast mode)
  const fetchAnalyzeAll = React.useCallback(async () => {
    setLoadingAnalyzeAll(true);
    try {
      const res = await fetch("/api/psx/analyze-all", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setAnalyzeAll(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAnalyzeAll(false);
    }
  }, []);

  // Fetch best trades (top 5 BUY + top 5 SELL with full AI ensemble)
  const fetchBestTrades = React.useCallback(async () => {
    setLoadingBestTrades(true);
    try {
      const res = await fetch("/api/psx/best-trades", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setBestTrades(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBestTrades(false);
    }
  }, []);

  // Check for new PSX listings (auto-detect new stocks)
  const fetchNewListings = React.useCallback(async () => {
    try {
      const res = await fetch("/api/psx/new-listings", { cache: "no-store" });
      const json = await res.json();
      if (json.ok && !json.data.first_scan) {
        setNewListings(json.data.new_listings || []);
        if ((json.data.new_listings || []).length > 0) {
          toast({
            title: "🆕 New stock(s) detected on PSX!",
            description: (json.data.new_listings || []).join(", "),
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [toast]);

  // Fetch paper portfolio
  const fetchPortfolio = React.useCallback(async () => {
    try {
      const res = await fetch("/api/paper/portfolio", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setPortfolio(json.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch alerts log
  const fetchAlertsLog = React.useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/log", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setAlertsLog(json.data.alerts);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Run event detection (check open positions against current prices)
  const runEventCheck = React.useCallback(async () => {
    try {
      await fetch("/api/paper/events", {
        method: "POST",
        cache: "no-store",
      });
      // Refresh portfolio + alerts log after
      await Promise.all([fetchPortfolio(), fetchAlertsLog()]);
    } catch (e) {
      console.error(e);
    }
  }, [fetchPortfolio, fetchAlertsLog]);

  // Initial load
  React.useEffect(() => {
    fetchQuote();
    fetchCandles();
    fetchAnalysis("KSE100");
    fetchSignals();
    fetchIpos();
    fetchSafeSignals();
    fetchScreener();
    fetchConnectionStatus();
    fetchAnalyzeAll();
    fetchBestTrades();
    fetchNewListings();
    fetchPortfolio();
    fetchAlertsLog();
  }, [
    fetchQuote,
    fetchCandles,
    fetchAnalysis,
    fetchSignals,
    fetchIpos,
    fetchSafeSignals,
    fetchScreener,
    fetchConnectionStatus,
    fetchAnalyzeAll,
    fetchBestTrades,
    fetchNewListings,
    fetchPortfolio,
    fetchAlertsLog,
  ]);

  // Refetch screener when sort/sector changes
  React.useEffect(() => {
    fetchScreener();
  }, [fetchScreener]);

  // Poll quote every 20s — also runs event detection + new listings check
  React.useEffect(() => {
    const t = setInterval(() => {
      setRefreshing(true);
      Promise.all([
        fetchQuote(),
        fetchScreener(),
        fetchConnectionStatus(),
        fetchNewListings(),
        fetchPortfolio(),
        runEventCheck(),
        fetchSafeSignals(),
      ]).finally(() => setRefreshing(false));
    }, 20_000); // 20s — real-time refresh per user request
    return () => clearInterval(t);
  }, [fetchQuote, fetchScreener, fetchConnectionStatus, fetchNewListings, fetchPortfolio, runEventCheck, fetchSafeSignals]);

  // Re-run analysis when symbol changes (skip if no symbol selected yet)
  React.useEffect(() => {
    if (symbol) {
      fetchAnalysis(symbol);
    }
  }, [symbol, fetchAnalysis]);

  // Re-fetch signals every 2 min (was 5 min — faster updates)
  React.useEffect(() => {
    const t = setInterval(() => fetchSignals(), 2 * 60_000);
    return () => clearInterval(t);
  }, [fetchSignals]);

  // ---------- View switching: only show active section ----------
  // Maps nav item IDs to which section divs should be visible
  const sectionGroups: Record<string, string[]> = {
    overview: ["section-overview", "section-all-analysis"],
    stocks: ["section-stocks", "section-chart", "section-analysis"],
    signals: ["section-signals"],
    safe: ["section-safe"],
    portfolio: ["section-portfolio"],
    alerts: ["section-alerts"],
    extras: ["section-extras"],
  };
  const visibleSections = sectionGroups[activeSection] || ["section-overview"];
  const isSectionVisible = (id: string) => visibleSections.includes(id);

  // ---------- Derived state ----------
  const kse100 = quote?.indices.find((i) => i.symbol === "KSE100");
  const featuredStocks = quote?.featured ?? [];
  const allSymbols: RealStock[] = React.useMemo(() => {
    if (!quote) return [];
    return [
      ...quote.featured,
      ...quote.scrips.filter(
        (s) => !quote.featured.some((f) => f.symbol === s.symbol)
      ),
    ];
  }, [quote]);

  const currentStock =
    symbol === "KSE100"
      ? featuredStocks.find((s) => s.symbol === "KSE100")
      : quote?.scrips.find((s) => s.symbol === symbol) ??
        featuredStocks.find((s) => s.symbol === symbol);

  const isIndex = symbol === "KSE100";
  const idxOrStock = isIndex ? kse100 : currentStock;
  const change = idxOrStock?.change ?? (analysis?.indicators?.price && analysis.indicators.closePrev
    ? analysis.indicators.price - analysis.indicators.closePrev
    : 0);
  const changePct = idxOrStock?.changePct ?? (analysis?.indicators?.closePrev
    ? ((analysis.indicators.price - analysis.indicators.closePrev) / analysis.indicators.closePrev) * 100
    : 0);
  const isUp = change >= 0;
  const priceOrValue = isIndex
    ? kse100?.value ?? analysis?.indicators?.price ?? candles.at(-1)?.close ?? 0
    : currentStock?.price ?? 0;

  // Chart data with indicators overlay
  const chartData = React.useMemo(() => {
    return candles.map((c) => ({
      date: (c.date ?? "").slice(5),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      sma20: analysis?.indicators?.sma20 ?? null,
      bbUpper: analysis?.indicators?.bbUpper ?? null,
      bbLower: analysis?.indicators?.bbLower ?? null,
      vwap: analysis?.indicators?.vwap ?? null,
    }));
  }, [candles, analysis]);

  const filteredSymbols = React.useMemo(() => {
    if (!search.trim()) return allSymbols.slice(0, 50);
    const q = search.toLowerCase();
    return allSymbols
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.sector ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allSymbols, search]);

  const buySignals = signals.filter((s) => s.action === "BUY");
  const sellSignals = signals.filter((s) => s.action === "SELL");

  // Set default symbol to first real scrip when quote loads (so chart + trade plan show on app open)
  React.useEffect(() => {
    if (!symbol && quote?.featured && quote.featured.length > 0) {
      const firstScrip = quote.featured.find((s) => s.symbol !== "KSE100");
      if (firstScrip) {
        setSymbol(firstScrip.symbol);
      }
    }
  }, [quote, symbol]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchQuote(),
      fetchAnalysis(symbol),
      fetchSignals(),
      fetchSafeSignals(),
      fetchScreener(),
      fetchPortfolio(),
      fetchAlertsLog(),
    ]);
    setRefreshing(false);
  };

  // ---------- Test alert (logs to AlertLog table for the user to verify) ----------
  const sendTestAlert = async () => {
    try {
      const res = await fetch("/api/alerts/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "test",
          title: "🔔 Test alert",
          body: `If you can see this entry, the Alerts Log is working.\nFired at: ${new Date().toLocaleString("en-PK")}\n\nOnce you enable Auto-trade in Safe Setups, every position open, target hit, and stop hit will appear here automatically.`,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "✅ Test alert logged",
          description: "Check the Alerts Log below — your test entry should appear at the top.",
        });
        fetchAlertsLog();
      } else {
        toast({
          title: "Test failed",
          description: json.error ?? "Unknown",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Network error",
        variant: "destructive",
      });
    }
  };

  // ---------- Auto-execute safe signals ----------
  const toggleAutoExecute = () => setAutoExecute((v) => !v);

  // When auto-execute is on, fire on the top safe signal (if not already holding)
  React.useEffect(() => {
    if (!autoExecute) return;
    if (safeSignals.length === 0) return;
    const top = safeSignals[0];
    if (!top) return;
    // Check if already holding
    const alreadyHolding = portfolio?.positions.some(
      (p) => p.symbol === top.signal.symbol
    );
    if (alreadyHolding) return;
    // Execute
    (async () => {
      setExecutingAuto(true);
      try {
        const res = await fetch("/api/paper/auto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "BUY",
            symbol: top.signal.symbol,
            confidence: top.signal.confidence,
            entry: top.signal.entry,
            stopLoss: top.signal.stopLoss,
            target: top.signal.target,
            price: top.signal.price,
            aiSummary: top.signal.aiSummary,
          }),
        });
        const json = await res.json();
        if (json.ok) {
          toast({
            title: "🟢 Auto BUY executed",
            description: `${top.signal.symbol} — ${json.data.position.qty} shares @ ${top.signal.entry.toFixed(2)}`,
          });
          await Promise.all([
            fetchPortfolio(),
            fetchAlertsLog(),
          ]);
        } else if (json.error !== "Already holding " + top.signal.symbol) {
          // Don't toast "already holding" — it's expected
          toast({
            title: "Auto-exec skipped",
            description: json.error ?? "Unknown",
            variant: "destructive",
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setExecutingAuto(false);
      }
    })();
  }, [autoExecute, safeSignals, portfolio, toast, fetchPortfolio, fetchAlertsLog]);

  // ---------- Loading ----------
  if (loadingQuote && !quote) {
    return <LoadingShell />;
  }
  if (error && !quote) {
    return <ErrorState error={error} onRetry={handleRefresh} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/30 via-background to-background dark:from-violet-950/20 flex flex-col">
      {/* ---------- Header (compact) ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden -ml-1 p-1 rounded-md hover:bg-muted"
              aria-label="Toggle sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <div className="h-8 w-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <CandlestickChart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-sm sm:text-base leading-none tracking-tight truncate">
                PSX Alpha — Stocks
              </h1>
              <p className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block truncate">
                {connectionStatus?.market.open
                  ? "🟢 Market OPEN"
                  : "🔴 Market CLOSED"}
                {" · "}
                {connectionStatus?.psx.connected
                  ? "psx.com.pk ✓"
                  : "psx.com.pk …"}
                {" · "}
                {connectionStatus?.investing.connected
                  ? "investing.com ✓"
                  : "investing.com …"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {connectionStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-medium text-[10px] hidden sm:inline-flex",
                  connectionStatus.market.open
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                )}
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connectionStatus.market.open ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                )} />
                {connectionStatus.market.open ? "LIVE" : "CLOSED"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              />
              <span className="hidden sm:inline ml-1.5">Refresh</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ---------- Body: Sidebar + Main ---------- */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <Sidebar
          active={activeSection}
          onChange={(s) => {
            setActiveSection(s);
            setSidebarOpen(false);
            // Scroll to top when switching views
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          status={connectionStatus}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
          {/* Last update + connection strip */}
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap rounded-md bg-muted/30 px-3 py-1.5">
            <Clock className="h-3 w-3" />
            {lastUpdate
              ? `Last updated: ${lastUpdate.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}`
              : "Loading…"}
            <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 ml-1">
              <Wifi className="h-3 w-3" />
              24/7 polling active
            </span>
            {connectionStatus && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span>PSX server: {connectionStatus.psx.connected ? "✓" : "…"} ({connectionStatus.psx.lastFetchAgo})</span>
                <span className="text-muted-foreground/70">·</span>
                <span>investing.com: {connectionStatus.investing.connected ? "✓" : "…"} ({connectionStatus.investing.lastFetchAgo})</span>
                <span className="text-muted-foreground/70">·</span>
                <span>Uptime: {connectionStatus.uptime.human}</span>
              </>
            )}
          </div>

        {/* Hero + signal — shows KSE-100 (always) + currently selected stock */}
        <div id="section-overview" style={{ display: isSectionVisible("section-overview") ? undefined : "none" }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/60 overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              {/* KSE-100 INDEX — always prominent (user wants this on app open) */}
              <div className="border-b border-border/40 pb-3 mb-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  🇵🇰 Pakistan Stock Exchange — KSE-100 Index
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <h2 className="text-3xl sm:text-4xl font-bold tabular-nums">
                    {(kse100?.value ?? 0).toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>
                  {(kse100?.change ?? 0) !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-base font-semibold tabular-nums",
                        (kse100?.change ?? 0) >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {(kse100?.change ?? 0) >= 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      {(kse100?.change ?? 0) >= 0 ? "+" : ""}
                      {(kse100?.change ?? 0).toFixed(2)} ({(kse100?.changePct ?? 0).toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Currently selected stock (smaller, below KSE-100) */}
              {symbol && symbol !== "KSE100" && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cleanSymbol(symbol)}</span>
                    {currentStock?.sector ? ` · ${currentStock.sector}` : ""}
                  </p>
                  <div className="flex items-baseline gap-3 mt-0.5">
                    <p className="text-2xl font-bold tabular-nums">
                      {(currentStock?.price ?? 0).toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    {change !== 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-sm font-semibold tabular-nums",
                          isUp
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {isUp ? "+" : ""}
                        {change.toFixed(2)} ({changePct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-1 mt-2 text-xs">
                    <Stat label="LDCP" value={currentStock?.ldcp?.toFixed(2)} />
                    <Stat label="Open" value={currentStock?.open?.toFixed(2)} />
                    <Stat label="High" value={currentStock?.high?.toFixed(2)} />
                    <Stat label="Low" value={currentStock?.low?.toFixed(2)} />
                    <Stat label="Volume" value={currentStock?.volume ? `${(currentStock.volume / 1_000_000).toFixed(2)}M` : undefined} />
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          {/* AI Signal + search bar removed from Overview — moved to Stocks view */}
        </div>

        {/* ---------- STOCKS TABLE — all scrips with prices + OHLCV ---------- */}
        <div id="section-stocks" style={{ display: isSectionVisible("section-stocks") ? undefined : "none" }} className="space-y-4">
        {/* Symbol search + AI Signal — moved here from Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/60">
            <CardContent className="p-3 sm:p-4">
              <Label className="text-xs">Search Stock</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type stock name… (e.g. MEBL, ENGRO, P.S.O.)"
                className="h-9 mt-1"
              />
              {search.trim() && (
                <div className="max-h-60 overflow-y-auto border border-border/60 rounded-md bg-background shadow-md mt-1">
                  {filteredSymbols
                    .filter((s) => s.symbol !== "KSE100")
                    .map((s) => (
                      <button
                        key={s.symbol}
                        type="button"
                        onClick={() => {
                          setSymbol(s.symbol);
                          setSearch("");
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/40 border-b border-border/60 last:border-0"
                      >
                        <span className="font-medium">{cleanSymbol(s.symbol)}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {s.sector}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
          <SignalCard analysis={analysis} loading={loadingAnalysis} symbol={symbol} />
        </div>

        {(newListings?.length ?? 0) > 0 && (
          <div className="rounded-lg border-2 border-violet-400 bg-violet-50/60 dark:bg-violet-950/30 p-2.5 flex items-center gap-2">
            <span className="text-sm">🆕</span>
            <p className="text-xs text-violet-700 dark:text-violet-300">
              <span className="font-semibold">New stock(s) on PSX:</span> {newListings.join(", ")}
            </p>
          </div>
        )}
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Live Stocks — Real-time prices · Buy/Sell · Volume ({(screenerRows?.length ?? 0)})
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={screenerFilter}
                  onChange={(e) => setScreenerFilter(e.target.value)}
                  placeholder="Filter symbol…"
                  className="h-8 w-32 text-xs"
                />
                <Select value={screenerSort} onValueChange={(v) => setScreenerSort(v as SortKey)}>
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="volume">By volume</SelectItem>
                    <SelectItem value="gainers">Top gainers</SelectItem>
                    <SelectItem value="losers">Top losers</SelectItem>
                    <SelectItem value="changePct">By |%chg|</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={screenerSector || "ALL"} onValueChange={(v) => setScreenerSector(v === "ALL" ? "" : v)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All sectors</SelectItem>
                    {quote?.scrips
                      .map((s) => s.sector)
                      .filter((v, i, arr) => v && arr.indexOf(v) === i)
                      .sort()
                      .map((sec) => (
                        <SelectItem key={sec as string} value={sec as string}>{sec as string}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(screenerRows?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading live scrips from PSX…
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Symbol</th>
                      <th className="text-right py-2 px-2 font-medium">LDCP</th>
                      <th className="text-right py-2 px-2 font-medium">Open</th>
                      <th className="text-right py-2 px-2 font-medium">High</th>
                      <th className="text-right py-2 px-2 font-medium">Low</th>
                      <th className="text-right py-2 px-2 font-medium">Current</th>
                      <th className="text-right py-2 px-2 font-medium">Chg%</th>
                      <th className="text-right py-2 px-2 font-medium">Volume</th>
                      <th className="text-right py-2 px-2 font-medium">Buy&lt;</th>
                      <th className="text-right py-2 px-2 font-medium">Sell&gt;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screenerRows
                      .filter((r) =>
                        !screenerFilter ||
                        r.symbol.toLowerCase().includes(screenerFilter.toLowerCase()) ||
                        r.sector.toLowerCase().includes(screenerFilter.toLowerCase())
                      )
                      .slice(0, 50)
                      .map((r) => {
                        const up = r.changePct >= 0;
                        return (
                          <tr
                            key={r.symbol}
                            onClick={() => setSymbol(r.symbol === "KSE100" ? "KSE100" : r.symbol)}
                            className="border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
                          >
                            <td className="py-1.5 px-2 font-medium whitespace-nowrap">
                              <span>{r.cleanName || r.symbol}</span>
                              <div className="text-[9px] text-muted-foreground truncate max-w-[80px]">{r.sector}</div>
                            </td>
                            <td className="text-right py-1.5 px-2 tabular-nums">{r.ldcp.toFixed(2)}</td>
                            <td className="text-right py-1.5 px-2 tabular-nums">{r.open.toFixed(2)}</td>
                            <td className="text-right py-1.5 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.high.toFixed(2)}</td>
                            <td className="text-right py-1.5 px-2 tabular-nums text-rose-600 dark:text-rose-400">{r.low.toFixed(2)}</td>
                            <td className="text-right py-1.5 px-2 tabular-nums font-semibold">{r.current.toFixed(2)}</td>
                            <td className={cn("text-right py-1.5 px-2 tabular-nums font-medium", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                              {up ? "+" : ""}{r.changePct.toFixed(2)}%
                            </td>
                            <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                              {r.volume >= 1_000_000 ? `${(r.volume / 1_000_000).toFixed(2)}M` : r.volume >= 1000 ? `${(r.volume / 1000).toFixed(0)}K` : r.volume.toLocaleString()}
                            </td>
                            <td className="text-right py-1.5 px-2 tabular-nums text-emerald-700 dark:text-emerald-300 font-medium">
                              {r.buyBelow.toFixed(2)}
                            </td>
                            <td className="text-right py-1.5 px-2 tabular-nums text-violet-700 dark:text-violet-300 font-medium">
                              {r.sellAbove.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground text-center pt-2">
              Real-time data from psx.com.pk/market-summary · Buy&lt; = entry price · Sell&gt; = +5% target proxy · Click row to view chart &amp; AI analysis
            </p>
          </CardContent>
        </Card>
        </div>

        {/* ---------- AI ALL-STOCKS ANALYSIS ---------- */}
        <div id="section-all-analysis" style={{ display: isSectionVisible("section-all-analysis") ? undefined : "none" }} className="space-y-4">
          <Card className="border-violet-200/60 dark:border-violet-900/60">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  AI All-Stocks Analysis — every scrip analyzed
                </h4>
                <Button onClick={fetchAnalyzeAll} size="sm" variant="outline" disabled={loadingAnalyzeAll} className="h-8">
                  <RefreshCw className={cn("h-3.5 w-3.5", loadingAnalyzeAll && "animate-spin")} />
                  <span className="ml-1.5">Re-scan</span>
                </Button>
              </div>
              {analyzeAll ? (
                <>
                  {/* Stats summary */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <button
                      onClick={() => setAnalysisFilter("ALL")}
                      className={cn(
                        "rounded-md p-2 text-center transition-all",
                        analysisFilter === "ALL" ? "ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-950/30" : "bg-muted/40"
                      )}
                    >
                      <p className="text-[10px] text-muted-foreground font-medium">ALL</p>
                      <p className="text-lg font-bold">{(analyzeAll?.total ?? 0)}</p>
                    </button>
                    <button
                      onClick={() => setAnalysisFilter("BUY")}
                      className={cn(
                        "rounded-md p-2 text-center transition-all",
                        analysisFilter === "BUY" ? "ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "bg-emerald-50/50 dark:bg-emerald-950/10"
                      )}
                    >
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">🟢 BUY</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{analyzeAll.buy_count}</p>
                    </button>
                    <button
                      onClick={() => setAnalysisFilter("SELL")}
                      className={cn(
                        "rounded-md p-2 text-center transition-all",
                        analysisFilter === "SELL" ? "ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/30" : "bg-rose-50/50 dark:bg-rose-950/10"
                      )}
                    >
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 font-medium">🔴 SELL</p>
                      <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{analyzeAll.sell_count}</p>
                    </button>
                    <button
                      onClick={() => setAnalysisFilter("HOLD")}
                      className={cn(
                        "rounded-md p-2 text-center transition-all",
                        analysisFilter === "HOLD" ? "ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/30" : "bg-amber-50/50 dark:bg-amber-950/10"
                      )}
                    >
                      <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">🟡 HOLD</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{analyzeAll.hold_count}</p>
                    </button>
                  </div>

                  {/* Full sortable table filtered by action */}
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th className="text-left py-1.5 px-2 font-medium">Symbol</th>
                          <th className="text-right py-1.5 px-2 font-medium">Price</th>
                          <th className="text-center py-1.5 px-2 font-medium">Action</th>
                          <th className="text-right py-1.5 px-2 font-medium">Conf%</th>
                          <th className="text-right py-1.5 px-2 font-medium">R/R</th>
                          <th className="text-right py-1.5 px-2 font-medium">Entry</th>
                          <th className="text-right py-1.5 px-2 font-medium">Stop</th>
                          <th className="text-right py-1.5 px-2 font-medium">Target</th>
                          <th className="text-left py-1.5 px-2 font-medium hidden sm:table-cell">Top Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyzeAll.all
                          .filter((a) => analysisFilter === "ALL" || a.action === analysisFilter)
                          .slice(0, 30)
                          .map((a) => {
                            const actionColor = a.action === "BUY" ? "text-emerald-600 dark:text-emerald-400" : a.action === "SELL" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
                            const actionBg = a.action === "BUY" ? "bg-emerald-100 dark:bg-emerald-950/40" : a.action === "SELL" ? "bg-rose-100 dark:bg-rose-950/40" : "bg-amber-100 dark:bg-amber-950/40";
                            return (
                              <tr
                                key={a.symbol}
                                onClick={() => setSymbol(a.symbol)}
                                className="border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
                              >
                                <td className="py-1 px-2 font-medium whitespace-nowrap">{cleanSymbol(a.symbol)}</td>
                                <td className="text-right py-1 px-2 tabular-nums">{a.price.toFixed(2)}</td>
                                <td className="text-center py-1 px-2">
                                  <span className={cn("inline-block px-1.5 py-0 rounded text-[9px] font-bold", actionBg, actionColor)}>
                                    {a.action}
                                  </span>
                                </td>
                                <td className="text-right py-1 px-2 tabular-nums">{a.confidence.toFixed(0)}%</td>
                                <td className="text-right py-1 px-2 tabular-nums">1:{a.riskReward.toFixed(1)}</td>
                                <td className="text-right py-1 px-2 tabular-nums">{a.entry.toFixed(2)}</td>
                                <td className="text-right py-1 px-2 tabular-nums text-rose-600 dark:text-rose-400">{a.stopLoss.toFixed(2)}</td>
                                <td className="text-right py-1 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{a.target.toFixed(2)}</td>
                                <td className="py-1 px-2 text-[9px] text-muted-foreground hidden sm:table-cell truncate max-w-[120px]">
                                  {a.signals[0]?.slice(0, 50) ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center pt-2">
                    Showing {analysisFilter === "ALL" ? (analyzeAll?.total ?? 0) : (analyzeAll?.all ?? []).filter(a => a.action === analysisFilter).length} {analysisFilter !== "ALL" ? analysisFilter : ""} stocks · Click row to view chart + trade plan
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {loadingAnalyzeAll ? "Scanning all scrips…" : "Click 'Re-scan' to analyze all stocks"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ---------- BEST TRADES WITH ENSEMBLE ---------- */}
          <Card className="border-violet-200/60 dark:border-violet-900/60">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Best Trades — top 5 BUY + top 5 SELL with full AI plan
                </h4>
                <Button onClick={fetchBestTrades} size="sm" variant="outline" disabled={loadingBestTrades} className="h-8">
                  <RefreshCw className={cn("h-3.5 w-3.5", loadingBestTrades && "animate-spin")} />
                  <span className="ml-1.5">Re-compute</span>
                </Button>
              </div>
              {bestTrades ? (
                <>
                  {(bestTrades?.providers?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-muted-foreground mb-3">
                      AI providers: {bestTrades.providers.map(p => p.label).join(" · ")}
                    </p>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* BUY trades */}
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">🟢 Top BUY Trades</p>
                      {(bestTrades?.best_buy?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No BUY setups with R/R ≥ 2</p>
                      ) : (
                        <div className="space-y-2">
                          {bestTrades.best_buy.map((t, i) => (
                            <BestTradeCard key={t.analysis.symbol + i} trade={t} onClick={() => setSymbol(t.analysis.symbol)} />
                          ))}
                        </div>
                      )}
                    </div>
                    {/* SELL trades */}
                    <div>
                      <p className="text-xs font-medium text-rose-600 dark:text-rose-400 mb-2">🔴 Top SELL Trades</p>
                      {(bestTrades?.best_sell?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No SELL setups with R/R ≥ 2</p>
                      ) : (
                        <div className="space-y-2">
                          {bestTrades.best_sell.map((t, i) => (
                            <BestTradeCard key={t.analysis.symbol + i} trade={t} onClick={() => setSymbol(t.analysis.symbol)} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {loadingBestTrades ? "Computing best trades + AI ensemble…" : "Click 'Re-compute' to get top trades"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Candlestick chart + indicators */}
        <div id="section-chart" style={{ display: isSectionVisible("section-chart") ? undefined : "none" }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/60">
            <CardContent className="p-4 sm:p-5">
              <ProfessionalChart
                candles={symbol === "KSE100" ? candles : analysisCandles}
                symbol={symbol}
                indicators={analysis?.indicators}
                tradePlan={analysis?.composite}
                loading={loadingCandles || loadingAnalysis}
              />
            </CardContent>
          </Card>

          {/* Indicators */}
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Technical Indicators
              </h4>
              {analysis ? (
                <div className="space-y-3">
                  {/* RSI gauge */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">RSI (14)</span>
                      <span className="font-medium tabular-nums">
                        {analysis.indicators.rsi14.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 relative overflow-hidden">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-background border-2 border-foreground"
                        style={{ left: `calc(${Math.min(100, Math.max(0, analysis.indicators.rsi14))}% - 6px)` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>Oversold (30)</span>
                      <span>Overbought (70)</span>
                    </div>
                  </div>

                  {/* MACD */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Ind label="MACD" value={analysis.indicators.macd.toFixed(2)} tone={analysis.indicators.macd >= analysis.indicators.macdSignal ? "bull" : "bear"} />
                    <Ind label="Signal" value={analysis.indicators.macdSignal.toFixed(2)} tone="neutral" />
                    <Ind label="Stoch %K" value={analysis.indicators.stochK.toFixed(1)} tone={analysis.indicators.stochK < 20 ? "bull" : analysis.indicators.stochK > 80 ? "bear" : "neutral"} />
                    <Ind label="Stoch %D" value={analysis.indicators.stochD.toFixed(1)} tone="neutral" />
                    <Ind label="SMA 20" value={analysis.indicators.sma20.toFixed(2)} tone={analysis.indicators.price > analysis.indicators.sma20 ? "bull" : "bear"} />
                    <Ind label="ATR 14" value={analysis.indicators.atr14.toFixed(2)} tone="neutral" />
                    <Ind label="BB Upper" value={analysis.indicators.bbUpper.toFixed(2)} tone="neutral" />
                    <Ind label="BB Lower" value={analysis.indicators.bbLower.toFixed(2)} tone="neutral" />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {loadingAnalysis ? "Analyzing…" : "Indicators unavailable"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Analysis + Patterns + Trade plan */}
        <div id="section-analysis" style={{ display: isSectionVisible("section-analysis") ? undefined : "none" }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                AI Analysis — {cleanSymbol(symbol)}
              </h4>
              {analysis?.aiSummary ? (
                <p className="text-sm leading-relaxed text-foreground/90">
                  {analysis.aiSummary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {loadingAnalysis ? "Generating AI analysis…" : "Summary unavailable"}
                </p>
              )}

              {analysis?.composite.reasons.length ? (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Signal reasons (composite of all indicators + patterns)
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {analysis.composite.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Crosshair className="h-3.5 w-3.5 mt-0.5 text-violet-500 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Trade Plan — {cleanSymbol(symbol)}
              </h4>
              {symbol === "KSE100" ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  <Minus className="h-5 w-5 mx-auto mb-1 opacity-50" />
                  KSE-100 is an index, not a tradable stock. Select a scrip from the Stocks table or search above to see its trade plan.
                </div>
              ) : analysis?.composite.action && analysis.composite.entry ? (
                <div className="space-y-3">
                  {/* Big BUY/SELL/HOLD banner — show trade plan for ALL actions including HOLD (lean direction) */}
                  <div className={cn(
                    "rounded-lg p-3 text-center border-2",
                    analysis.composite.action === "BUY"
                      ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : analysis.composite.action === "SELL"
                      ? "border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30"
                      : "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
                  )}>
                    <p className={cn(
                      "text-3xl font-bold tracking-tight",
                      analysis.composite.action === "BUY"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : analysis.composite.action === "SELL"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}>
                      {analysis.composite.action} {symbol}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Confidence: <span className="font-semibold">{analysis.composite.confidence.toFixed(0)}%</span>
                      {" · "}R/R: <span className="font-semibold">1:{analysis.composite.riskReward?.toFixed(1) ?? "—"}</span>
                      {analysis.composite.action === "HOLD" && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">· setup shown as potential entry</span>
                      )}
                    </p>
                  </div>
                  {/* BUY / STOP / SELL big numbers */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950/40 p-2 text-center">
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">ENTRY</p>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {analysis.composite.entry?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-rose-100 dark:bg-rose-950/40 p-2 text-center">
                      <p className="text-[10px] text-rose-700 dark:text-rose-300 font-medium">STOP LOSS</p>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
                        {analysis.composite.stopLoss?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-violet-100 dark:bg-violet-950/40 p-2 text-center">
                      <p className="text-[10px] text-violet-700 dark:text-violet-300 font-medium">TARGET</p>
                      <p className="text-lg sm:text-xl font-bold tabular-nums text-violet-700 dark:text-violet-300">
                        {analysis.composite.target?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground text-center">
                    Risk: Rs {(analysis.composite.entry && analysis.composite.stopLoss
                      ? Math.abs(analysis.composite.entry - analysis.composite.stopLoss)
                      : 0).toFixed(2)} per share ·
                    Reward: Rs {(analysis.composite.entry && analysis.composite.target
                      ? Math.abs(analysis.composite.target - analysis.composite.entry)
                      : 0).toFixed(2)} per share
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {analysis ? (
                    <>
                      <Minus className="h-5 w-5 mx-auto mb-1 opacity-50" />
                      Not enough data to compute a trade plan.
                    </>
                  ) : (
                    "Computing trade plan…"
                  )}
                </div>
              )}

              {/* Patterns */}
              <div className="mt-4 pt-3 border-t border-border/60">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Candlestick Patterns
                </p>
                {analysis?.patterns && analysis.patterns.length > 0 ? (
                  <ul className="space-y-1.5">
                    {analysis.patterns.map((p, i) => (
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
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {p.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No significant patterns detected</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* BUY / SELL signal grid */}
        <div id="section-signals" style={{ display: isSectionVisible("section-signals") ? undefined : "none" }}>
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Live Trade Signals — auto-scanned across top movers
              </h4>
              <span className="text-xs text-muted-foreground">
                {loadingSignals ? "Scanning…" : `${(signals?.length ?? 0)} symbols analyzed`}
              </span>
            </div>
            {loadingSignals ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : (signals?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No signals available
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {signals.map((s) => (
                  <SignalRowCard key={s.symbol} signal={s} onClick={() => setSymbol(s.symbol)} active={s.symbol === symbol} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* ---------- Safe BUY setups (risk-managed) ---------- */}
        <div id="section-safe" style={{ display: isSectionVisible("section-safe") ? undefined : "none" }}>
        <Card className="border-emerald-200/60 dark:border-emerald-900/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Safe BUY Setups — pro risk-managed screener
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Scans <span className="font-medium tabular-nums">{safeStats?.total_scanned ?? "—"}</span> PSX-listed companies · {safeStats?.total_buy ?? "—"} show BUY bias · Thresholds: ≥75% confidence · ≥2.5:1 R/R · stop ≤8%
                </p>
              </div>
              <Button
                variant={autoExecute ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoExecute}
                disabled={executingAuto}
                className={cn(
                  "h-8",
                  autoExecute
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : ""
                )}
              >
                <PlayCircle className="h-3.5 w-3.5 mr-1" />
                {autoExecute ? "Auto-trade ON" : "Enable auto-trade"}
              </Button>
            </div>

            {safeSignals.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-300/60 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/10 p-4 text-center">
                <ShieldCheck className="h-7 w-7 mx-auto mb-2 text-amber-500" />
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  No A+ setups right now — market is selective.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 max-w-md mx-auto">
                  The screener only shows signals where profit potential ≥ 2.5× the
                  risk, confidence ≥ 75%, AND stop-loss is within 8%. This protects
                  capital. Below are the closest near-miss setups for your review.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {safeSignals.length} A+ safe setup{safeSignals.length === 1 ? "" : "s"} — all criteria met
                </p>
                {safeSignals.slice(0, 5).map((row, i) => (
                  <div
                    key={row.signal.symbol + i}
                    className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/10 p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm"
                  >
                    <div className="sm:col-span-1">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">{row.signal.symbol}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {row.signal.confidence.toFixed(0)}% conf · 1:{row.signal.riskReward.toFixed(1)} R/R
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs sm:col-span-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Entry</p>
                        <p className="font-medium tabular-nums">{row.signal.entry.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Stop</p>
                        <p className="font-medium tabular-nums text-rose-600 dark:text-rose-400">{row.signal.stopLoss.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Target</p>
                        <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{row.signal.target.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="text-xs sm:col-span-1 sm:text-right">
                      <p className="text-[10px] text-muted-foreground">Position size</p>
                      <p className="font-medium tabular-nums">
                        {row.position.qty} sh · Rs {row.position.positionValue.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Risk Rs {row.position.riskAmount.toFixed(0)} ({row.position.riskPct.toFixed(1)}%)
                      </p>
                    </div>
                    {row.signal.aiSummary && (
                      <p className="text-[10px] text-muted-foreground sm:col-span-4 line-clamp-2 leading-relaxed mt-1">
                        {row.signal.aiSummary}
                      </p>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground text-center pt-2">
                  Virtual capital: Rs 1,000,000 · Max 8% per trade · Max 2.4% risk per trade
                </p>
              </div>
            )}

            {/* ---------- Near-miss setups — don't meet ALL criteria but worth watching ---------- */}
            {nearMissSignals.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Near-miss setups — close to qualifying (review manually before trading)
                </p>
                <div className="space-y-1.5">
                  {nearMissSignals.slice(0, 5).map((row, i) => (
                    <div
                      key={row.signal.symbol + i}
                      className="rounded-md border border-amber-200/40 dark:border-amber-800/40 bg-amber-50/20 dark:bg-amber-950/5 p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
                    >
                      <div className="sm:col-span-1">
                        <p className="font-semibold text-amber-700 dark:text-amber-300">{row.signal.symbol}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {row.signal.confidence.toFixed(0)}% conf · 1:{row.signal.riskReward.toFixed(1)} R/R
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-1 sm:col-span-2">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Entry</p>
                          <p className="font-medium tabular-nums">{row.signal.entry.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Stop</p>
                          <p className="font-medium tabular-nums text-rose-600 dark:text-rose-400">{row.signal.stopLoss.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Target</p>
                          <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{row.signal.target.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="sm:col-span-1 sm:text-right">
                        <p className="text-[9px] text-muted-foreground">Why not A+</p>
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-tight">{row.missReason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* ---------- Paper Trading Portfolio ---------- */}
        <div id="section-portfolio" style={{ display: isSectionVisible("section-portfolio") ? undefined : "none" }}>
        <Card className="border-border/60">
          <CardContent className="p-4 sm:p-5">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Paper Trading Portfolio — virtual Rs 1,000,000
            </h4>
            {portfolio ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">Cash available</p>
                    <p className="font-semibold tabular-nums">Rs {portfolio.cash.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">Invested</p>
                    <p className="font-semibold tabular-nums">Rs {portfolio.invested.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">Current value</p>
                    <p className="font-semibold tabular-nums">Rs {portfolio.totalValue.toLocaleString("en-PK", { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className={cn("rounded-md p-2", portfolio.unrealizedPnl >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30")}>
                    <p className="text-[10px] text-muted-foreground">Unrealized P&L</p>
                    <p className={cn("font-semibold tabular-nums", portfolio.unrealizedPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                      {portfolio.unrealizedPnl >= 0 ? "+" : ""}Rs {portfolio.unrealizedPnl.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
                      <span className="text-[10px] ml-1">({(portfolio?.unrealizedPct ?? 0) >= 0 ? "+" : ""}{(portfolio?.unrealizedPct ?? 0).toFixed(2)}%)</span>
                    </p>
                  </div>
                </div>
                {(portfolio?.positions?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No open positions. Enable "Auto-trade" above to start trading safe signals automatically.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {(portfolio?.positions ?? []).map((p) => {
                      const statusClass =
                        p.status === "stop_hit"
                          ? "border-rose-300 dark:border-rose-800"
                          : p.status === "target_hit"
                          ? "border-emerald-300 dark:border-emerald-800"
                          : "border-border/60";
                      return (
                        <div key={p.id} className={cn("rounded-md border p-2 grid grid-cols-4 sm:grid-cols-6 gap-1 text-xs", statusClass)}>
                          <div className="font-medium">{p.symbol}</div>
                          <div className="text-muted-foreground">{p.qty} sh</div>
                          <div className="text-muted-foreground">Entry {p.entryPrice.toFixed(2)}</div>
                          <div className="text-muted-foreground">Stop {p.stopLoss.toFixed(2)}</div>
                          <div className="text-muted-foreground">Target {p.target.toFixed(2)}</div>
                          <div className="text-right">
                            {p.currentPrice !== undefined && (
                              <>
                                <p className="tabular-nums font-medium">
                                  Now {p.currentPrice.toFixed(2)}
                                </p>
                                <p className={cn("text-[10px] tabular-nums", (p.unrealizedPnl ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                  {(p.unrealizedPnl ?? 0) >= 0 ? "+" : ""}Rs {(p.unrealizedPnl ?? 0).toFixed(0)} ({(p.unrealizedPct ?? 0).toFixed(2)}%)
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Loading portfolio…</p>
            )}
          </CardContent>
        </Card>
        </div>

        {/* ---------- Alerts Log ---------- */}
        {/* Pro-level on-screen alert log — shows every paper-trade event
            (position opened, target hit, stop hit) and any test alerts.
            Always visible so the user can verify the log is working. */}
        <div id="section-alerts" style={{ display: isSectionVisible("section-alerts") ? undefined : "none" }}>
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Alerts Log — paper-trade activity feed
                </h4>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {(alertsLog?.length ?? 0)} entr{(alertsLog?.length ?? 0) === 1 ? "y" : "ies"}
                  </Badge>
                  <Button onClick={sendTestAlert} variant="outline" size="sm" className="h-8">
                    <BellRing className="h-3.5 w-3.5 mr-1" />
                    Fire test alert
                  </Button>
                </div>
              </div>
              {(alertsLog?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">No alerts logged yet</p>
                  <p className="text-[10px] text-muted-foreground mt-1 max-w-md mx-auto">
                    Alerts appear here automatically when: 🟢 a safe BUY setup opens a paper
                    position · 🎯 a position hits its target · 🛑 a position hits its stop loss.
                    Click <span className="font-medium">Fire test alert</span> to verify the log is working.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {alertsLog.map((a) => (
                    <li key={a.id} className="rounded-md border border-border/60 p-2.5 text-xs hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium flex items-center gap-1.5">
                          <span className={
                            a.kind === "target_hit" ? "text-emerald-600 dark:text-emerald-400" :
                            a.kind === "stop_hit" ? "text-rose-600 dark:text-rose-400" :
                            a.kind === "new_signal" ? "text-emerald-600 dark:text-emerald-400" :
                            "text-amber-600 dark:text-amber-400"
                          }>
                            {a.kind === "target_hit" ? "🎯" : a.kind === "stop_hit" ? "🛑" : a.kind === "new_signal" ? "🟢" : "🔔"}
                          </span>
                          {a.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {new Date(a.at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {a.body.slice(0, 300)}{a.body.length > 300 ? "…" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* IPOs + All Indices */}
        <div id="section-extras" style={{ display: isSectionVisible("section-extras") ? undefined : "none" }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Bell className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                IPOs &amp; Listings — auto-detected from PSX
              </h4>
              {loadingIpos ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Loading…
                </p>
              ) : (ipos?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent IPO announcements
                </p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {ipos.map((ipo, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-border/60 p-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium leading-snug">
                          {ipo.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-4 capitalize shrink-0"
                        >
                          {ipo.kind.replace("ipo-", "")}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {ipo.date}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                Source:{" "}
                <a
                  href="https://dps.psx.com.pk/announcements"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  dps.psx.com.pk/announcements
                </a>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <LayoutDashboard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                All PSX Indices (real-time)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                {(quote?.indices ?? []).map((idx) => (
                  <button
                    key={idx.symbol}
                    onClick={() => idx.symbol === "KSE100" && setSymbol("KSE100")}
                    className="rounded-lg border border-border/60 p-2.5 text-left hover:bg-muted/40"
                  >
                    <p className="text-xs text-muted-foreground truncate">
                      {idx.symbol}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {idx.value.toLocaleString("en-PK", {
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] tabular-nums font-medium",
                        idx.change >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {idx.change >= 0 ? "+" : ""}
                      {idx.changePct.toFixed(2)}%
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top movers */}
        <div style={{ display: isSectionVisible("section-extras") ? undefined : "none" }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Top Gainers (real)
              </h4>
              <ul className="space-y-1">
                {(quote?.gainers ?? []).map((s) => (
                  <MoverRow key={s.symbol + s.price} stock={s} onClick={() => setSymbol(s.symbol)} />
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                Top Losers (real)
              </h4>
              <ul className="space-y-1">
                {(quote?.losers ?? []).map((s) => (
                  <MoverRow key={s.symbol + s.price} stock={s} onClick={() => setSymbol(s.symbol)} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-muted-foreground text-center pb-2 flex items-center justify-center gap-1 flex-wrap">
          <AlertCircle className="h-3 w-3" />
          Real-time data from{" "}
          <a
            href="https://www.psx.com.pk/market-summary"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            psx.com.pk
          </a>{" "}
          +{" "}
          <a
            href="https://www.investing.com/indices/karachi-100-historical-data"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            investing.com
          </a>
          . AI signals are educational, not financial advice. Verify before trading.
        </p>
      </main>
      </div>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border/60 bg-background/50">
        <div className="px-3 sm:px-6 py-3 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>Built with Next.js 16 · Prisma · Tailwind · Recharts · z-ai-web-dev-sdk</p>
          <p className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
            PSX Alpha · Stocks
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------- Sub Components ----------
interface SidebarProps {
  active: string;
  onChange: (s: string) => void;
  open: boolean;
  onClose: () => void;
  status: {
    market: { open: boolean; note: string };
    psx: { connected: boolean; lastFetchAgo: string; scripsCount: number };
    investing: { connected: boolean; lastFetchAgo: string; candlesCount: number };
    uptime: { human: string };
  } | null;
}

const NAV_ITEMS: Array<{ id: string; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "stocks", label: "Stocks + Chart + AI", icon: Activity },
  { id: "signals", label: "Trade Signals", icon: Zap },
  { id: "safe", label: "Safe Setups", icon: ShieldCheck },
  { id: "portfolio", label: "Portfolio", icon: Wallet },
  { id: "alerts", label: "Alerts Log", icon: TrendingUp },
  { id: "extras", label: "IPOs + Indices", icon: Bell },
];

function Sidebar({ active, onChange, open, onClose, status }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "z-40 w-56 sm:w-60 shrink-0 border-r border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-all lg:block lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto",
          open
            ? "fixed inset-y-0 left-0 block"
            : "hidden lg:block"
        )}
      >
        <nav className="p-2 sm:p-3 space-y-0.5">
          {/* Connection status block */}
          {status && (
            <div className="rounded-md bg-muted/40 p-2 mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Market</span>
                <span className={cn(
                  "font-semibold",
                  status.market.open ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}>
                  {status.market.open ? "● OPEN" : "● CLOSED"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">psx.com.pk</span>
                <span className={cn(
                  "font-medium",
                  status.psx.connected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                )}>
                  {status.psx.connected ? "✓" : "…"} {status.psx.lastFetchAgo}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">investing.com</span>
                <span className={cn(
                  "font-medium",
                  status.investing.connected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                )}>
                  {status.investing.connected ? "✓" : "…"} {status.investing.lastFetchAgo}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium tabular-nums">{status.uptime.human}</span>
              </div>
              <p className="text-[9px] text-muted-foreground pt-1 border-t border-border/40">
                Polling every 20s, 24/7
              </p>
            </div>
          )}

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

// ---------- Best Trade Card (with ensemble consensus) ----------
function BestTradeCard({ trade, onClick }: { trade: BestTradeRow; onClick: () => void }) {
  const a = trade.analysis;
  const isBuy = a.action === "BUY";
  const tone = isBuy ? "emerald" : "rose";
  const cardClasses = isBuy
    ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10"
    : "border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/10";
  const textClasses = isBuy
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
  // Consensus display logic — show appropriate status when AI is unavailable.
  const consensusLabel = (() => {
    const c = trade.consensus?.consensus;
    if (!c) return null;
    if (c === "TECHNICAL_ONLY") return { text: "TECHNICAL ONLY — AI unavailable", tone: "text-amber-600 dark:text-amber-400" };
    if (c === "TIMEOUT") return { text: "AI timeout", tone: "text-amber-600 dark:text-amber-400" };
    if (c === "ERROR") return { text: "AI error", tone: "text-rose-600 dark:text-rose-400" };
    if (c === "DISAGREE") return { text: "AI disagree", tone: "text-amber-600 dark:text-amber-400" };
    return { text: c, tone: textClasses };
  })();
  return (
    <div className={cn("rounded-lg border p-2.5", cardClasses)}>
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-sm">{cleanSymbol(a.symbol)}</span>
          <span className={cn("text-xs font-bold", textClasses)}>{a.action}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px] mb-1.5">
          <div>
            <p className="text-muted-foreground">Entry</p>
            <p className="font-medium tabular-nums">{a.entry.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Stop</p>
            <p className="font-medium tabular-nums text-rose-600 dark:text-rose-400">{a.stopLoss.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{a.target.toFixed(2)}</p>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Conf: {a.confidence.toFixed(0)}%</span>
          <span>1:{a.riskReward.toFixed(1)} R/R</span>
          <span>{trade.position.qty} sh · Rs {trade.position.positionValue.toFixed(0)}</span>
        </div>
        {trade.consensus && (
          <div className="mt-2 pt-1.5 border-t border-border/40">
            <p className="text-[9px] font-medium text-muted-foreground mb-1">
              AI ensemble:{" "}
              {consensusLabel ? (
                <span className={consensusLabel.tone}>{consensusLabel.text}</span>
              ) : null}
              {trade.consensus.agreeCount > 0 && (
                <>
                  {" "}({trade.consensus.agreeCount}/{trade.consensus.totalCount} agree)
                </>
              )}
            </p>
            {trade.consensus.votes.slice(0, 2).map((v, i) => (
              <p key={i} className="text-[9px] text-muted-foreground">
                <span className="font-medium">{v.provider}:</span>{" "}
                {v.error ? (
                  <span className="text-rose-500/80">{v.error.slice(0, 60)}</span>
                ) : (
                  <>{v.action} — {v.reasoning.slice(0, 80)}</>
                )}
              </p>
            ))}
          </div>
        )}
        {(a.signals?.length ?? 0) > 0 && (
          <p className="text-[9px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/40 line-clamp-2">
            <span className="font-medium">Signals:</span> {a.signals.slice(0, 2).join(" · ")}
          </p>
        )}
      </button>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-violet-50/30 via-background to-background dark:from-violet-950/20">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center mb-3 animate-pulse">
          <CandlestickChart className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground">
          Loading real-time PSX data…
        </p>
        <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2 text-muted-foreground" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-rose-50/30 via-background to-background dark:from-rose-950/20">
      <Card className="border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20 max-w-md">
        <CardContent className="p-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Real-time data unavailable</h3>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button
            onClick={onRetry}
            className="mt-4 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SignalCard({ analysis, loading, symbol }: { analysis: AnalysisData | null; loading: boolean; symbol: string }) {
  if (loading && !analysis) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-5 h-full flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!analysis) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground text-center py-4">
            Analysis unavailable
          </p>
        </CardContent>
      </Card>
    );
  }
  const sig = analysis.composite;
  const tone =
    sig.action === "BUY"
      ? "emerald"
      : sig.action === "SELL"
      ? "rose"
      : "amber";
  const toneClasses: Record<string, { card: string; bar: string; text: string }> = {
    emerald: {
      card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20",
      bar: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    rose: {
      card: "border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20",
      bar: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
    },
    amber: {
      card: "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20",
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
    },
  };
  const t = toneClasses[tone];

  return (
    <Card className={cn("border", t.card)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3 w-3" /> AI Signal · {cleanSymbol(symbol)}
          </span>
          <span className={cn("text-2xl font-bold", t.text)}>{sig.action}</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Confidence</span>
            <span className="font-medium tabular-nums">
              {sig.confidence.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", t.bar)}
              style={{ width: `${sig.confidence}%` }}
            />
          </div>
        </div>
        {sig.entry !== undefined && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
            <div className="rounded-md bg-background/60 p-1.5">
              <p className="text-muted-foreground">Entry</p>
              <p className="font-medium tabular-nums">{sig.entry?.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-background/60 p-1.5">
              <p className="text-muted-foreground">Stop</p>
              <p className="font-medium tabular-nums">{sig.stopLoss?.toFixed(2)}</p>
            </div>
            <div className="rounded-md bg-background/60 p-1.5">
              <p className="text-muted-foreground">Target</p>
              <p className="font-medium tabular-nums">{sig.target?.toFixed(2)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SignalRowCard({
  signal,
  onClick,
  active,
}: {
  signal: SignalRow;
  onClick: () => void;
  active: boolean;
}) {
  const tone =
    signal.action === "BUY"
      ? "emerald"
      : signal.action === "SELL"
      ? "rose"
      : "amber";
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20",
    rose: "border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20",
    amber: "border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20",
  } as const;
  const textTone = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
  } as const;
  const barTone = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
  } as const;
  const t = toneClasses[tone];
  const tx = textTone[tone];
  const tb = barTone[tone];

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-3 transition-all hover:shadow-md",
        t,
        active && "ring-2 ring-offset-2 ring-offset-background ring-violet-400"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{signal.symbol}</span>
        <span className={cn("text-sm font-bold", tx)}>{signal.action}</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
        <span className="tabular-nums">Price: {signal.price.toFixed(2)}</span>
        <span className="tabular-nums font-medium">
          {signal.confidence.toFixed(0)}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5">
        <div
          className={cn("h-full", tb)}
          style={{ width: `${signal.confidence}%` }}
        />
      </div>
      {signal.aiSummary && (
        <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
          {signal.aiSummary}
        </p>
      )}
    </button>
  );
}

function MoverRow({
  stock,
  onClick,
}: {
  stock: RealStock;
  onClick: () => void;
}) {
  const isUp = stock.changePct >= 0;
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/40 text-left"
      >
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{stock.symbol}</p>
          {stock.sector && (
            <p className="text-[10px] text-muted-foreground truncate">
              {stock.sector}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-medium tabular-nums text-sm">
            {stock.price.toLocaleString("en-PK", {
              maximumFractionDigits: 2,
            })}
          </p>
          <p
            className={cn(
              "text-[10px] tabular-nums font-medium",
              isUp
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            )}
          >
            {isUp ? "+" : ""}
            {stock.changePct.toFixed(2)}%
          </p>
        </div>
      </button>
    </li>
  );
}

function Stat({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium tabular-nums">
        {value === undefined || value === null ? "—" : value}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Ind({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="rounded-md bg-muted/40 p-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums",
          tone === "bull"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bear"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Plan({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          tone === "bull"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bear"
            ? "text-rose-600 dark:text-rose-400"
            : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
