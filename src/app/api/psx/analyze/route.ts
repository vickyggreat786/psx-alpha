import { NextRequest, NextResponse } from "next/server";
import {
  callZai,
  RateLimitError,
  isRateLimited,
} from "@/lib/zai-ratelimit";
import { callGroq, callOpenRouter, callGemini, callTogether, callCohere } from "@/lib/ai-ensemble";
import {
  computeSnapshot,
  type Candle,
  type IndicatorSnapshot,
} from "@/lib/indicators";
import { detectPatterns, buildCompositeSignal, type CompositeSignal } from "@/lib/patterns";
import { analyzeScripFast, blendHistory, type ScripInput } from "@/lib/analysis-engine";
import { loadScripCandles, todayCandleFromQuote } from "@/lib/scrip-history";
import { cleanSymbol } from "@/lib/symbol-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface AnalysisCache {
  composite: CompositeSignal;
  indicators: IndicatorSnapshot;
  patterns: ReturnType<typeof detectPatterns>;
  aiSummary?: string;
  candles?: Candle[];
  source?: string;
  at: number;
}
const cache = new Map<string, AnalysisCache>();
// Increase cache TTL from 1 min -> 5 min to reduce AI provider calls
// (best-trades still re-uses the analyze endpoint under the hood, so this
//  also helps reduce duplicate fetches when scanning many scrips).
const CACHE_TTL_MS = 5 * 60_000;

interface QuoteResponse {
  ok: boolean;
  data?: {
    indices: { symbol: string; value: number; change: number; changePct: number }[];
    scrips: ScripStock[];
  };
  error?: string;
}
interface ScripStock {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  ldcp?: number;
  open?: number;
  high?: number;
  low?: number;
  sector?: string;
}

interface CandlesResponse {
  ok: boolean;
  data?: { candles: Candle[] };
  error?: string;
}

async function fetchQuote(): Promise<QuoteResponse["data"]> {
  const res = await fetch("http://localhost:3000/api/psx/quote", {
    cache: "no-store",
  });
  const json = (await res.json()) as QuoteResponse;
  if (!json.ok || !json.data) throw new Error(json.error ?? "Quote unavailable");
  return json.data;
}

async function fetchCandles(): Promise<Candle[]> {
  const res = await fetch("http://localhost:3000/api/psx/candles", {
    cache: "no-store",
  });
  const json = (await res.json()) as CandlesResponse;
  if (!json.ok || !json.data) throw new Error(json.error ?? "Candles unavailable");
  return json.data.candles;
}

// NOTE: blendHistory + scripToCandle are now imported from @/lib/analysis-engine
// to ensure consistency between analyze-all and individual analyze endpoints.

async function generateAiSummary(
  symbol: string,
  snap: IndicatorSnapshot,
  composite: CompositeSignal,
  patterns: ReturnType<typeof detectPatterns>
): Promise<string> {
  const prompt = `Analyze ${symbol} (Pakistan Stock Exchange) and explain the ${composite.action} signal in 3-4 sentences.

INDICATORS:
- Price: ${snap.price.toFixed(2)}
- RSI(14): ${snap.rsi14.toFixed(1)} (prev: ${snap.rsiPrev.toFixed(1)})
- MACD: ${snap.macd.toFixed(3)} / signal ${snap.macdSignal.toFixed(3)} / hist ${snap.macdHistogram.toFixed(3)}
- SMA20: ${snap.sma20.toFixed(2)} | SMA50: ${snap.sma50.toFixed(2)}
- Bollinger: lower ${snap.bbLower.toFixed(2)} / mid ${snap.bbMiddle.toFixed(2)} / upper ${snap.bbUpper.toFixed(2)}
- ATR14: ${snap.atr14.toFixed(2)} | Stoch K/D: ${snap.stochK.toFixed(1)}/${snap.stochD.toFixed(1)} | VWAP: ${snap.vwap.toFixed(2)}
- Candlestick patterns: ${patterns.length > 0 ? patterns.map((p) => p.name).join(", ") : "none"}

Composite signal: ${composite.action} (${composite.confidence.toFixed(0)}% confidence)
Entry: ${composite.entry?.toFixed(2) ?? "—"} | Stop: ${composite.stopLoss?.toFixed(2) ?? "—"} | Target: ${composite.target?.toFixed(2) ?? "—"}

Write a direct, plain-language explanation. Mention 2-3 specific indicators. Agree with the ${composite.action} signal. End with the word "${composite.action}". Do NOT narrate or describe the request — just give the analysis.`;

  // Try Cohere FIRST — it's globally accessible and the user has a valid key.
  try {
    const cohereResponse = await callCohere(prompt);
    if (cohereResponse && cohereResponse.length > 10) {
      return cohereResponse;
    }
  } catch (e) {
    console.warn("[AI summary] Cohere failed, trying Gemini:", e instanceof Error ? e.message : "unknown");
  }

  // Try Gemini (region-blocked from HK, but in case server moves)
  try {
    const geminiResponse = await callGemini(prompt);
    if (geminiResponse && geminiResponse.length > 10) {
      return geminiResponse;
    }
  } catch (e) {
    console.warn("[AI summary] Gemini failed, trying Together:", e instanceof Error ? e.message : "unknown");
  }

  // Try Together AI (also globally accessible, free Llama 3.3 70B)
  try {
    const togetherResponse = await callTogether(prompt);
    if (togetherResponse && togetherResponse.length > 10) {
      return togetherResponse;
    }
  } catch (e) {
    console.warn("[AI summary] Together failed, trying OpenRouter:", e instanceof Error ? e.message : "unknown");
  }

  // Try OpenRouter (Nemotron 550B — free, global) — but free tier is only 50/day.
  try {
    const orResponse = await callOpenRouter(prompt);
    if (orResponse && orResponse.length > 10) {
      return orResponse;
    }
  } catch (e) {
    console.warn("[AI summary] OpenRouter failed, trying Groq:", e instanceof Error ? e.message : "unknown");
  }

  // Try Groq (region-blocked from this server)
  try {
    const groqResponse = await callGroq(prompt);
    if (groqResponse && groqResponse.length > 10) {
      return groqResponse;
    }
  } catch (e) {
    console.warn("[AI summary] Groq failed, trying GLM-4:", e instanceof Error ? e.message : "unknown");
  }

  // Fallback to z-ai GLM-4. The new callGLM has a 15s timeout so it can't hang.
  try {
    const completion = await callZai((zai) =>
      zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You are PSX Alpha, an institutional-grade technical analyst. Be direct and specific.",
          },
          { role: "user", content: prompt },
        ],
        thinking: { type: "disabled" },
      })
    );
    return (
      completion.choices[0]?.message?.content ??
      buildTechnicalFallback(symbol, composite)
    );
  } catch (e) {
    const isRL = e instanceof RateLimitError;
    if (isRL) {
      return buildTechnicalFallback(symbol, composite);
    }
    console.error("[AI summary] error:", e);
    return buildTechnicalFallback(symbol, composite);
  }
}

// Honest fallback when no AI provider is available (all region-blocked or
// rate-limited). Constructs a useful summary from the technical reasons so
// the user still gets actionable insight, plus a clear note that AI is down.
function buildTechnicalFallback(
  symbol: string,
  composite: CompositeSignal
): string {
  const reasons = composite.reasons.slice(0, 3).join(" ");
  const planStr = composite.entry
    ? ` Entry ${composite.entry.toFixed(2)}, SL ${composite.stopLoss?.toFixed(2)}, Target ${composite.target?.toFixed(2)}, R/R 1:${composite.riskReward?.toFixed(1)}.`
    : "";
  return `[Technical analysis — AI providers currently unavailable] ${symbol}: ${composite.action} (${composite.confidence.toFixed(0)}% confidence). ${reasons}.${planStr} Add an API key from Together AI / Mistral / DeepInfra for full AI analysis.`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "KSE100";

  try {
    const cachedEntry = cache.get(symbol);
    if (cachedEntry && Date.now() - cachedEntry.at < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, data: cachedEntry, cached: true });
    }

    const [quote, kse100Candles] = await Promise.all([fetchQuote(), fetchCandles()]);
    if (!quote) throw new Error("Quote unavailable");

    // Anchor the last candle's close to the real-time price (Investing.com data
    // is delayed by ~15 min; PSX market-summary page is the freshest).
    if (symbol === "KSE100") {
      const kse = quote.indices.find((i) => i.symbol === "KSE100");
      if (kse && kse100Candles.length > 0) {
        const last = kse100Candles[kse100Candles.length - 1];
        last.close = kse.value;
        last.high = Math.max(last.high, kse.value);
        last.low = Math.min(last.low, kse.value);
      }
    }

    let candles: Candle[];
    let source = "investing.com (KSE100)";
    let resolvedSymbol = symbol;
    if (symbol === "KSE100") {
      candles = kse100Candles;
    } else {
      // Look up the scrip. We support both the exact symbol (e.g. "OGDC-AUG")
      // and the "clean" version (e.g. "OGDC") — the latter is matched against
      // every scrip using cleanSymbol() so the user can pass either form.
      const quoteScrips = quote.scrips;
      let scrip = quoteScrips.find((s) => s.symbol === symbol);
      if (!scrip) {
        // Fall back to clean-symbol matching (e.g. "OGDC" matches "OGDC-AUG")
        const targetClean = cleanSymbol(symbol).toUpperCase();
        scrip = quoteScrips.find((s) => cleanSymbol(s.symbol).toUpperCase() === targetClean);
        if (scrip) resolvedSymbol = scrip.symbol;
      }
      if (!scrip) {
        // Try prefix match as last resort (e.g. "OGDC" -> "OGDC-AUG")
        scrip = quoteScrips.find((s) => s.symbol.startsWith(symbol.toUpperCase()));
        if (scrip) resolvedSymbol = scrip.symbol;
      }
      if (!scrip) throw new Error(`Symbol ${symbol} not found`);
      const scripInput: ScripInput = {
        symbol: scrip.symbol,
        price: scrip.price,
        ldcp: scrip.ldcp ?? scrip.price,
        open: scrip.open ?? scrip.price,
        high: scrip.high ?? scrip.price,
        low: scrip.low ?? scrip.price,
        volume: scrip.volume,
        sector: scrip.sector,
        changePct: scrip.changePct,
        change: scrip.change,
      };

      // ----- REAL per-scrip candle history (DB-backed) -----
      // Load historical candles saved from previous days' PSX snapshots,
      // then overlay today's real-time OHLC from the current quote.
      const todayCandle = todayCandleFromQuote(scrip);
      const realHistory = await loadScripCandles(symbol, {
        limit: 90,
        appendToday: todayCandle,
      });

      if (realHistory.length >= 14) {
        // We have enough real per-scrip history — use it directly.
        candles = realHistory;
        source = `psx-direct (DB) + today quote (${realHistory.length} candles)`;
      } else {
        // Not enough real history yet (first run, or new IPO). Fall back to
        // blended history so the chart + indicators still work. Once enough
        // days of snapshots accumulate (>= 14), real history takes over.
        // Use analyzeScripFast from the same engine as analyze-all
        const fastResult = analyzeScripFast(scripInput, kse100Candles);
        if (!fastResult) throw new Error("Not enough data for analysis");
        // Use the SAME blendHistory from analysis-engine (ensures consistency with analyze-all)
        candles = blendHistory(kse100Candles, scripInput);
        source = `blended KSE100 + scrip bias (${candles.length} candles)`;
      }
    }
    const snap = computeSnapshot(candles);
    if (!snap) throw new Error("Not enough data for analysis");
    const patterns = detectPatterns(candles);
    const composite = buildCompositeSignal(snap, patterns);

    const needsAi =
      composite.action !== "HOLD" ||
      cachedEntry === undefined ||
      Date.now() - cachedEntry.at > 5 * 60_000;

    let aiSummary = cachedEntry?.aiSummary;
    if (needsAi) {
      aiSummary = await generateAiSummary(resolvedSymbol, snap, composite, patterns);
    }

    const result: AnalysisCache = {
      composite,
      indicators: snap,
      patterns,
      aiSummary,
      candles: symbol === "KSE100" ? undefined : candles, // Return per-scrip candles for chart
      source,
      at: Date.now(),
    };
    cache.set(resolvedSymbol, result);
    // Also cache under the input symbol so subsequent identical requests hit cache
    if (resolvedSymbol !== symbol) cache.set(symbol, result);

    return NextResponse.json({ ok: true, data: result, cached: false });
  } catch (err) {
    console.error("[GET /api/psx/analyze] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Analysis failed",
      },
      { status: 500 }
    );
  }
}
