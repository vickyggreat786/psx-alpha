import { getBaseUrl } from "@/lib/base-url";
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
import { analyzeScripFast, buildRealCandles, type ScripInput } from "@/lib/analysis-engine";
import { loadScripCandles, todayCandleFromQuote } from "@/lib/scrip-history";
import { fetchYahooCandles } from "@/lib/yahoo-finance";
import { stripFuturesSuffix } from "@/lib/psx-listings";
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
  const res = await fetch(`${getBaseUrl()}/api/psx/quote`, {
    cache: "no-store",
  });
  const json = (await res.json()) as QuoteResponse;
  if (!json.ok || !json.data) throw new Error(json.error ?? "Quote unavailable");
  return json.data;
}

async function fetchCandles(): Promise<Candle[]> {
  const res = await fetch(`${getBaseUrl()}/api/psx/candles`, {
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
  // Single clean prompt — explain the technical setup directly.
  // The LLM is instructed to skip any chain-of-thought and START directly
  // with the stock analysis (no "Let me think", no "The user wants").
  const prompt = `${symbol} is a stock on the Pakistan Stock Exchange (PSX).

It currently has a ${composite.action} signal at ${composite.confidence.toFixed(0)}% confidence.

Key technical indicators:
- Price: ${snap.price.toFixed(2)} | RSI(14): ${snap.rsi14.toFixed(1)} | MACD hist: ${snap.macdHistogram.toFixed(3)}
- SMA20: ${snap.sma20.toFixed(2)} | SMA50: ${snap.sma50.toFixed(2)} | VWAP: ${snap.vwap.toFixed(2)}
- Bollinger: lower ${snap.bbLower.toFixed(2)} / upper ${snap.bbUpper.toFixed(2)}
- Stochastic: K ${snap.stochK.toFixed(1)} / D ${snap.stochD.toFixed(1)}
- ATR(14): ${snap.atr14.toFixed(2)}
- Candlestick patterns: ${patterns.length > 0 ? patterns.map((p) => p.name).join(", ") : "none detected"}

Trade plan: ${composite.action} entry ${composite.entry?.toFixed(2) ?? "—"}, stop ${composite.stopLoss?.toFixed(2) ?? "—"}, target ${composite.target?.toFixed(2) ?? "—"}.

Write a 3-4 sentence professional technical analysis starting with "${symbol} shows" or "${symbol}'s price". Mention 2-3 specific indicators from above and why they support the ${composite.action} signal. End with the word ${composite.action}.`;

  // Try Cohere FIRST — it's globally accessible and the user has a valid key.
  try {
    const cohereResponse = await callCohere(prompt);
    if (cohereResponse && cohereResponse.length > 10) {
      return cleanAIResponse(cohereResponse);
    }
  } catch (e) {
    console.warn("[AI summary] Cohere failed, trying Gemini:", e instanceof Error ? e.message : "unknown");
  }

  // Try Gemini (region-blocked from HK, but in case server moves)
  try {
    const geminiResponse = await callGemini(prompt);
    if (geminiResponse && geminiResponse.length > 10) {
      return cleanAIResponse(geminiResponse);
    }
  } catch (e) {
    console.warn("[AI summary] Gemini failed, trying Together:", e instanceof Error ? e.message : "unknown");
  }

  // Try Together AI (also globally accessible, free Llama 3.3 70B)
  try {
    const togetherResponse = await callTogether(prompt);
    if (togetherResponse && togetherResponse.length > 10) {
      return cleanAIResponse(togetherResponse);
    }
  } catch (e) {
    console.warn("[AI summary] Together failed, trying OpenRouter:", e instanceof Error ? e.message : "unknown");
  }

  // Try OpenRouter (Nemotron 550B — free, global) — but free tier is only 50/day.
  try {
    const orResponse = await callOpenRouter(prompt);
    if (orResponse && orResponse.length > 10) {
      return cleanAIResponse(orResponse);
    }
  } catch (e) {
    console.warn("[AI summary] OpenRouter failed, trying Groq:", e instanceof Error ? e.message : "unknown");
  }

  // Try Groq (region-blocked from this server)
  try {
    const groqResponse = await callGroq(prompt);
    if (groqResponse && groqResponse.length > 10) {
      return cleanAIResponse(groqResponse);
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
            role: "system",
            content:
              "You are PSX Alpha, a senior Pakistan Stock Exchange technical analyst. " +
              "Respond with ONLY the final analysis text — no chain-of-thought, no narration, " +
              "no preamble like 'The user wants' or 'Let me think'. Start directly with the " +
              "stock analysis (e.g. 'OGDC shows strong bullish momentum...'). " +
              "Write 3-4 sentences max. End with the action word (BUY/SELL/HOLD).",
          },
          { role: "user", content: prompt },
        ],
        thinking: { type: "disabled" },
      })
    );
    const content = (completion as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content ??
      buildTechnicalFallback(symbol, composite);
    return cleanAIResponse(content);
  } catch (e) {
    const isRL = e instanceof RateLimitError;
    if (isRL) {
      return buildTechnicalFallback(symbol, composite);
    }
    console.error("[AI summary] error:", e);
    return buildTechnicalFallback(symbol, composite);
  }
}

// Clean AI response — strip chain-of-thought leaks that some models produce.
// "The user wants..." or "Let me think..." prefixes are removed.
// We try to extract the actual analysis text.
function cleanAIResponse(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // If the response contains analysis preceded by chain-of-thought, try to
  // extract the analysis. Common patterns:
  //   "Let me analyze... <reasoning> ... <actual analysis>"
  //   "The user wants... <echoed instructions> ... <analysis>"
  //   "Sure, here's the analysis: <analysis>"
  //   "<reasoning>\n\n<actual analysis>"

  // Look for a paragraph that starts with a capital letter and the symbol
  // name or a stock-related word — that's likely the actual analysis start.
  const analysisStartPatterns = [
    // Look for the LAST occurrence of a paragraph starting with capital letter
    // followed by stock-related words. This catches the case where the model
    // wrote reasoning first, then the analysis.
    /\n\n([A-Z][A-Z][A-Z0-9.&-]{2,15}\s+(?:shows|is|has|trades|closed|opened|price|currently|exhibits|presents|demonstrates|appears))[\s\S]{50,1500}$/,
    /\n\n([A-Z][a-z]+\s+(?:shows|is|has|trades|closed|opened|price|currently|exhibits|presents|demonstrates|appears))[\s\S]{50,1500}$/,
  ];
  for (const re of analysisStartPatterns) {
    const m = cleaned.match(re);
    if (m) {
      cleaned = m[1].trim();
      break;
    }
  }

  // Remove known bad prefixes
  const badPrefixes = [
    /^The user wants[\s\S]{0,800}?\n\n/i,
    /^Let me analyze[\s\S]{0,800}?\n\n/i,
    /^Let me think[\s\S]{0,800}?\n\n/i,
    /^Let's analyze[\s\S]{0,800}?\n\n/i,
    /^Here(?:'s| is) the analysis:?\s*/i,
    /^Sure[,!]?\s*here(?:'s| is)[\s\S]{0,200}?:\s*/i,
    /^Okay[,!]?\s*here(?:'s| is)[\s\S]{0,200}?:\s*/i,
    /^Prompt:?\s*/i,
  ];
  for (const re of badPrefixes) {
    cleaned = cleaned.replace(re, "").trim();
  }

  // If the text contains "Let me think" or "We need to" or "Let's craft"
  // anywhere — strip from that point to end (those are chain-of-thought)
  const cotMarkers = [
    /\n\nLet me /i,
    /\n\nLet's /i,
    /\n\nWe need to /i,
    /\n\nI'll /i,
    /\n\nI will /i,
  ];
  for (const re of cotMarkers) {
    const m = cleaned.match(re);
    if (m && cleaned.slice(0, m.index).length > 30) {
      // There's text before the CoT marker — keep that part only
      cleaned = cleaned.slice(0, m.index).trim();
    }
  }

  // If text is in quotes (model sometimes outputs the analysis as a quoted string)
  const quoteMatch = cleaned.match(/^["']([A-Z][\s\S]{50,1500})["']\.?$/);
  if (quoteMatch) {
    cleaned = quoteMatch[1].trim();
  }

  // Final cleanup — remove any remaining "Sure, " "Okay, " prefixes
  cleaned = cleaned.replace(/^(?:Sure|Okay|Alright|Certainly|Of course)[,!:]\s*/i, "");

  return cleaned;
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

      // ----- REAL per-scrip candle history (priority: Yahoo Finance → DB → fallback) -----
      // Try Yahoo Finance first — gives real OHLCV per scrip (not scaled, not synthetic)
      let yahooCandles: Candle[] = [];
      try {
        yahooCandles = await fetchYahooCandles(resolvedSymbol, "6mo");
      } catch (e) {
        console.warn(`[analyze] Yahoo fetch failed for ${resolvedSymbol}:`, e);
      }

      // Today's real OHLC from PSX quote (more accurate than Yahoo's 15-min delay)
      const todayCandle = todayCandleFromQuote(scrip);

      if (yahooCandles.length >= 14) {
        // We have enough real Yahoo history — overlay today's real OHLC on the last candle
        const lastIdx = yahooCandles.length - 1;
        const today = new Date().toISOString().slice(0, 10);
        if (yahooCandles[lastIdx].date === today) {
          // Yahoo has today's candle — overlay with PSX's fresher values
          yahooCandles[lastIdx] = {
            ...yahooCandles[lastIdx],
            ...todayCandle,
          };
        } else {
          // Yahoo's last candle is from yesterday — append today
          yahooCandles.push({ date: today, ...todayCandle });
        }
        candles = yahooCandles;
        source = `Yahoo Finance real history (${yahooCandles.length} candles)`;
      } else if (yahooCandles.length >= 2) {
        // Some Yahoo history but less than 14 days — use what we have + today
        const today = new Date().toISOString().slice(0, 10);
        const lastIdx = yahooCandles.length - 1;
        if (yahooCandles[lastIdx].date === today) {
          yahooCandles[lastIdx] = { ...yahooCandles[lastIdx], ...todayCandle };
        } else {
          yahooCandles.push({ date: today, ...todayCandle });
        }
        candles = yahooCandles;
        source = `partial Yahoo history (${yahooCandles.length} candles, momentum-only analysis)`;
      } else {
        // Yahoo failed or empty — try DB history (saved from previous PSX snapshots)
        const realHistory = await loadScripCandles(symbol, {
          limit: 90,
          appendToday: todayCandle,
        });

        if (realHistory.length >= 14) {
          candles = realHistory;
          source = `real per-scrip DB history (${realHistory.length} candles)`;
        } else if (realHistory.length >= 2) {
          candles = realHistory;
          source = `partial real history (${realHistory.length} candles, momentum-only analysis)`;
        } else {
          // Last resort: KSE100 scaled to scrip level (still 100% real data, not synthetic)
          candles = buildRealCandles(kse100Candles, scripInput);
          source = candles.length >= 14
            ? `real KSE100 history scaled to ${resolvedSymbol} (${candles.length} candles)`
            : `today's real OHLC only — insufficient history for multi-day indicators`;
        }
      }
    }
    const snap = computeSnapshot(candles);
    // When we don't have enough real candles (snap is null), use the honest
    // momentum-only fallback from analyzeScripFast. The chart shows real
    // candles; the analysis is honest about its limited scope.
    if (!snap) {
      // Build the honest momentum-only analysis from today's real OHLC.
      // This requires the scrip input (not for KSE100, which always has
      // enough history from investing.com / DB).
      if (symbol === "KSE100") {
        throw new Error("Not enough data for KSE100 analysis");
      }
      const quoteScrips = quote.scrips;
      let scrip = quoteScrips.find((s) => s.symbol === resolvedSymbol);
      if (!scrip) {
        const targetClean = cleanSymbol(resolvedSymbol).toUpperCase();
        scrip = quoteScrips.find((s) => cleanSymbol(s.symbol).toUpperCase() === targetClean);
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
      const fallback = analyzeScripFast(scripInput, kse100Candles);
      if (!fallback) throw new Error("Not enough data for analysis");
      const result: AnalysisCache = {
        composite: {
          action: fallback.action,
          confidence: fallback.confidence,
          reasons: fallback.signals,
          entry: fallback.entry,
          stopLoss: fallback.stopLoss,
          target: fallback.target,
          riskReward: fallback.riskReward,
        },
        indicators: fallback.indicators,
        patterns: fallback.patterns,
        aiSummary: `[Momentum-only analysis — ${fallback.candlesCount} candle(s) of real history] ${fallback.signals[0]}`,
        candles,
        source: source + " (low-data mode)",
        at: Date.now(),
      };
      cache.set(resolvedSymbol, result);
      if (resolvedSymbol !== symbol) cache.set(symbol, result);
      return NextResponse.json({ ok: true, data: result, cached: false });
    }
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
