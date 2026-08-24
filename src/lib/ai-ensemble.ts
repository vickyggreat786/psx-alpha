// Multi-model AI ensemble for trading analysis.
// Pluggable architecture — supports multiple AI providers and uses consensus
// voting for high-confidence signals.
//
// Providers:
//   1. GLM-4 (default, via z-ai SDK — always available in sandbox)
//   2. Claude 3.5 Sonnet (set ANTHROPIC_API_KEY env)
//   3. OpenAI GPT-4o (set OPENAI_API_KEY env)
//   4. DeepSeek R1 (set DEEPSEEK_API_KEY env)
//
// When multiple providers are configured, each BUY/SELL signal is sent to all
// of them. The final signal uses majority voting (e.g. 2/3 agree → confirmed).

import type { CompositeSignal } from "./patterns";
import type { PatternMatch } from "./patterns";
import type { IndicatorSnapshot } from "./indicators";
import { callZai, RateLimitError, isRateLimited } from "./zai-ratelimit";

export interface ProviderConfig {
  id: string;
  label: string;
  available: boolean;
  envVar: string;
}

export const AVAILABLE_PROVIDERS: ProviderConfig[] = [
  { id: "together", label: "Llama 3.3 70B (Together AI)", available: true, envVar: "TOGETHER_API_KEY" },
  { id: "mistral", label: "Mistral Small (Mistral AI)", available: true, envVar: "MISTRAL_API_KEY" },
  { id: "deepinfra", label: "GLM/Llama (DeepInfra)", available: true, envVar: "DEEPINFRA_API_KEY" },
  { id: "cohere", label: "Command R (Cohere)", available: true, envVar: "COHERE_API_KEY" },
  { id: "gemini", label: "Gemini 2.5 Flash (Google)", available: true, envVar: "GEMINI_API_KEY" },
  { id: "groq", label: "Llama 3.3 70B (Groq)", available: true, envVar: "GROQ_API_KEY" },
  { id: "openrouter", label: "Nemotron 550B (OpenRouter)", available: true, envVar: "OPENROUTER_API_KEY" },
  { id: "glm", label: "GLM-4 (z-ai sandbox)", available: true, envVar: "ZAI_DEFAULT" },
  { id: "claude", label: "Claude 3.5 Sonnet", available: false, envVar: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "GPT-4o", available: false, envVar: "OPENAI_API_KEY" },
  { id: "deepseek", label: "DeepSeek R1", available: false, envVar: "DEEPSEEK_API_KEY" },
];

export function getConfiguredProviders(): ProviderConfig[] {
  return AVAILABLE_PROVIDERS.map((p) => ({
    ...p,
    available:
      p.id === "glm" || (!!process.env[p.envVar] && process.env[p.envVar]!.length > 0),
  }));
}

export interface ModelVote {
  provider: string;
  action: "BUY" | "SELL" | "HOLD";
  reasoning: string;
  error?: string;
}

export interface ConsensusResult {
  consensus: "BUY" | "SELL" | "HOLD" | "DISAGREE" | "TECHNICAL_ONLY";
  votes: ModelVote[];
  agreeCount: number;
  totalCount: number;
}

// ---------- Build prompt for any AI provider ----------
// IMPORTANT: The prompt uses "OUTPUT FORMAT" + "Do NOT narrate" instructions
// to prevent some free models (especially Nemotron) from echoing back the
// prompt instead of following it.
function buildPrompt(
  symbol: string,
  snap: IndicatorSnapshot,
  composite: CompositeSignal,
  patterns: PatternMatch[]
): string {
  return `Analyze ${symbol} (PSX) and output a trading recommendation.

DATA:
- Price: ${snap.price.toFixed(2)}
- RSI(14): ${snap.rsi14.toFixed(1)} (prev ${snap.rsiPrev.toFixed(1)})
- MACD: ${snap.macd.toFixed(3)} / signal ${snap.macdSignal.toFixed(3)} / hist ${snap.macdHistogram.toFixed(3)}
- SMA20: ${snap.sma20.toFixed(2)} | SMA50: ${snap.sma50.toFixed(2)}
- BB: ${snap.bbLower.toFixed(2)} / ${snap.bbMiddle.toFixed(2)} / ${snap.bbUpper.toFixed(2)}
- ATR14: ${snap.atr14.toFixed(2)} | Stoch K/D: ${snap.stochK.toFixed(1)}/${snap.stochD.toFixed(1)} | VWAP: ${snap.vwap.toFixed(2)}
- Candlestick patterns: ${patterns.length > 0 ? patterns.map((p) => p.name).join(", ") : "none"}

Composite signal so far: ${composite.action} (${composite.confidence.toFixed(0)}% confidence)

OUTPUT FORMAT — reply with EXACTLY 2 lines, nothing else:
ACTION: BUY
REASON: <one short sentence citing 2 indicators>

Rules:
- First line MUST start with "ACTION: " followed by BUY, SELL, or HOLD.
- Second line MUST start with "REASON: ".
- Do NOT echo or narrate the user's request. Do NOT explain what you are doing.
- Just output the 2 lines directly.`;
}

// Parse the LLM response into a vote
// Tolerates common LLM "preamble" patterns (e.g., "Sure! Here's my analysis:")
// by searching anywhere in the response for the ACTION: prefix.
function parseVote(response: string, provider: string): ModelVote {
  // Strip leading narration / preamble — look for the first ACTION: occurrence
  const actionMatch = response.match(/ACTION:\s*(BUY|SELL|HOLD)/i);
  const reasonMatch = response.match(/REASON:\s*([^\n]+)/i);
  const action = (actionMatch?.[1]?.toUpperCase() as "BUY" | "SELL" | "HOLD") || "HOLD";
  let reasoning = reasonMatch?.[1]?.trim() || "";
  if (!reasoning) {
    // Fallback: first 150 chars of the response
    reasoning = response.slice(0, 150).trim();
  }
  // Detect if the model just echoed the prompt (common Nemotron failure mode)
  if (/user wants|analyze .* and give|respond in exactly/i.test(reasoning) && !actionMatch) {
    return {
      provider,
      action: "HOLD",
      reasoning: "(model echoed prompt instead of analyzing)",
      error: "Model did not follow output format",
    };
  }
  return { provider, action, reasoning };
}

// ---------- Provider implementations ----------
// ---------- OpenRouter (Nemotron 550B — FREE, works globally) ----------
// Skips automatically if the daily free-tier rate limit has been hit.
let openRouterRateLimitedUntil = 0;
function isOpenRouterRateLimited(): boolean {
  return Date.now() < openRouterRateLimitedUntil;
}

export async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  if (isOpenRouterRateLimited()) {
    throw new Error("OpenRouter free-tier daily limit reached");
  }
  // Try multiple free models in sequence — they share the daily quota, but
  // a single one may be temporarily unavailable.
  const freeModels = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "openai/gpt-oss-20b:free",
    "google/gemma-4-26b-a4b-it:free",
  ];
  let lastErr = "";
  for (const model of freeModels) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://psx-alpha.app",
          "X-Title": "PSX Alpha Trading Bot",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            {
              role: "system",
              content:
                "You are PSX Alpha, a senior technical analyst for Pakistan Stock Exchange. Be concise and direct.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        // Detect daily free-tier rate limit (applies to ALL free models)
        if (errText.includes("free-models-per-day") || errText.includes("X-RateLimit-Remaining\":\"0")) {
          // Parse the reset time if available
          try {
            const j = JSON.parse(errText);
            const reset = j.error?.metadata?.headers?.["X-RateLimit-Reset"];
            if (reset) {
              openRouterRateLimitedUntil = Number(reset);
            } else {
              openRouterRateLimitedUntil = Date.now() + 60 * 60_000; // 1h fallback
            }
          } catch {
            openRouterRateLimitedUntil = Date.now() + 60 * 60_000;
          }
          throw new Error("OpenRouter free-tier daily limit reached");
        }
        lastErr = `OpenRouter ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      if (content && content.length > 5) return content;
      lastErr = `OpenRouter ${model} returned empty content`;
    } catch (e) {
      // If rate-limited, break out of loop entirely
      if (e instanceof Error && e.message.includes("daily limit reached")) {
        throw e;
      }
      // Timeout or network error — try next model
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "OpenRouter: all models failed");
}

// ---------- Groq (Llama 3.3 70B) — FREE, FAST ----------
// Detects "Forbidden" (invalid key) and disables itself for the process.
let groqDisabled = false;
function isGroqDisabled(): boolean {
  return groqDisabled;
}

export async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  if (isGroqDisabled()) {
    throw new Error("Groq disabled (key invalid)");
  }
  // If Cloudflare Worker proxy is configured, route through it to bypass HK region block
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const groqBaseUrl = workerUrl
    ? `${workerUrl}/groq/openai`
    : "https://api.groq.com/openai";
  // Try multiple models in case one is deprecated/unavailable
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "llama-3.1-70b-versatile",
  ];
  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch(`${groqBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            {
              role: "system",
              content:
                "You are PSX Alpha, a senior technical analyst for Pakistan Stock Exchange. Be concise and direct.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        // "Forbidden" means the API key itself is invalid — disable Groq for the process
        if (res.status === 403 || errText.toLowerCase().includes("forbidden")) {
          groqDisabled = true;
          throw new Error("Groq API key is invalid (Forbidden)");
        }
        // 429 = rate limit; try next model (different models have separate limits)
        if (res.status === 429) {
          lastErr = `Groq ${model} rate-limited`;
          continue;
        }
        lastErr = `Groq ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      if (content && content.length > 5) return content;
      lastErr = `Groq ${model} returned empty content`;
    } catch (e) {
      if (e instanceof Error && e.message.includes("Groq API key is invalid")) {
        throw e;
      }
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "Groq: all models failed");
}

// ---------- GLM-4 (z-ai SDK) — free in sandbox ----------
async function callGLM(prompt: string): Promise<string> {
  if (isRateLimited()) {
    throw new RateLimitError("GLM-4 rate-limited");
  }
  // Use a 10s timeout — z-ai SDK calls can hang indefinitely otherwise.
  // 10s is enough for a short prompt (300 tokens max output).
  const completion = await Promise.race([
    callZai((zai) =>
      zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content: "You are PSX Alpha, a senior technical analyst. Be concise and direct.",
          },
          { role: "user", content: prompt },
        ],
        thinking: { type: "disabled" },
      })
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GLM-4 timeout after 10s")), 10_000)
    ),
  ]);
  return (
    (completion as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content ?? ""
  );
}

// ---------- Google Gemini 2.0 Flash — FREE, globally available ----------
// Free tier: 15 req/min, 1500 req/day. Globally accessible (no region block).
// Get API key at: https://aistudio.google.com/app/apikey
let geminiRateLimitedUntil = 0;
function isGeminiRateLimited(): boolean {
  return Date.now() < geminiRateLimitedUntil;
}

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  if (isGeminiRateLimited()) {
    // Distinguish between rate-limit and region-block based on the duration
    const remaining = Math.ceil((geminiRateLimitedUntil - Date.now()) / 60_000);
    if (remaining > 30) {
      throw new Error("Gemini region-blocked (HK not supported, retry in " + remaining + " min)");
    }
    throw new Error("Gemini rate-limited (retry in " + remaining + " min)");
  }
  // Gemini 2.5 Flash is the current free tier model (gemini-1.5-* and gemini-2.0-* are deprecated)
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.6-flash", "gemini-flash-latest"];
  let lastErr = "";
  for (const model of models) {
    try {
      // If Cloudflare Worker proxy is configured, route through it to bypass HK region block
      const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
      const geminiBase = workerUrl
        ? `${workerUrl}/gemini/v1beta`
        : "https://generativelanguage.googleapis.com/v1beta";
      const url = `${geminiBase}/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
          // Per-minute rate limit — short backoff
          geminiRateLimitedUntil = Date.now() + 60_000;
          throw new Error("Gemini rate-limited (429)");
        }
        if (res.status === 403 && errText.includes("API_KEY_INVALID")) {
          throw new Error("Gemini API key invalid");
        }
        // Region block (400 "User location is not supported") — disable for 1h
        if (res.status === 400 && errText.includes("User location is not supported")) {
          geminiRateLimitedUntil = Date.now() + 60 * 60_000; // 1h
          throw new Error("Gemini region-blocked (HK not supported)");
        }
        lastErr = `Gemini ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      // Extract text from response
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text && text.length > 5) return text;
      // Check for safety block or empty response
      const finishReason = json?.candidates?.[0]?.finishReason;
      if (finishReason === "SAFETY") {
        lastErr = `Gemini ${model} blocked by safety filter`;
      } else {
        lastErr = `Gemini ${model} returned empty content`;
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes("rate-limited") || e.message.includes("API key invalid"))) {
        throw e;
      }
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "Gemini: all models failed");
}

// ---------- Together AI — Llama 3.3 70B, FREE tier, globally available ----------
// Get API key at: https://api.together.xyz/settings/api-keys
export async function callTogether(prompt: string): Promise<string> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");
  // Try multiple free / cheap models
  const models = [
    "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "mistralai/Mistral-7B-Instruct-v0.3",
  ];
  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch("https://api.together.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            { role: "system", content: "You are PSX Alpha, a senior technical analyst for Pakistan Stock Exchange. Be concise and direct." },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        lastErr = `Together ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content ?? "";
      if (content && content.length > 5) return content;
      lastErr = `Together ${model} returned empty content`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "Together AI: all models failed");
}

// ---------- Mistral AI — FREE tier, globally available ----------
// Get API key at: https://console.mistral.ai/api-keys
let mistralDisabled = false;
export async function callMistral(prompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");
  if (mistralDisabled) throw new Error("Mistral disabled (key invalid)");
  const models = ["mistral-small-latest", "mistral-tiny", "open-mistral-7b", "open-mixtral-8x7b"];
  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            { role: "system", content: "You are PSX Alpha, a senior technical analyst for Pakistan Stock Exchange. Be concise and direct." },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401 || errText.includes("Authorization header")) {
          mistralDisabled = true;
          throw new Error("Mistral API key invalid");
        }
        lastErr = `Mistral ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content ?? "";
      if (content && content.length > 5) return content;
      lastErr = `Mistral ${model} returned empty content`;
    } catch (e) {
      if (e instanceof Error && e.message.includes("API key invalid")) throw e;
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "Mistral: all models failed");
}

// ---------- DeepInfra — Multiple models, FREE tier, globally available ----------
// Get API key at: https://deepinfra.com/dash/api_keys
let deepInfraDisabled = false;
export async function callDeepInfra(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) throw new Error("DEEPINFRA_API_KEY not set");
  if (deepInfraDisabled) throw new Error("DeepInfra disabled (key invalid)");
  // DeepInfra hosts many open models — try the most useful ones
  const models = [
    "zai-org/GLM-4.7",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "Qwen/Qwen2.5-7B-Instruct",
  ];
  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            { role: "system", content: "You are PSX Alpha, a senior technical analyst for Pakistan Stock Exchange. Be concise and direct." },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401) {
          deepInfraDisabled = true;
          throw new Error("DeepInfra API key invalid");
        }
        lastErr = `DeepInfra ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content ?? "";
      if (content && content.length > 5) return content;
      lastErr = `DeepInfra ${model} returned empty content`;
    } catch (e) {
      if (e instanceof Error && e.message.includes("API key invalid")) throw e;
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  throw new Error(lastErr || "DeepInfra: all models failed");
}

// ---------- Cohere — Command A, FREE trial, globally available ----------
// Get API key at: https://dashboard.cohere.com/api-keys
// Note: Cohere API keys use "cohere_" prefix (new format) or "key_" prefix (old format).
// Free trial limits: 1,000 calls/month, ~10 calls/min — auto-backs-off on 429.
let cohereDisabled = false;
let cohereRateLimitedUntil = 0;
function isCohereRateLimited(): boolean {
  return Date.now() < cohereRateLimitedUntil;
}
export async function callCohere(prompt: string): Promise<string> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY not set");
  if (cohereDisabled) throw new Error("Cohere disabled (key invalid)");
  if (isCohereRateLimited()) {
    const remaining = Math.ceil((cohereRateLimitedUntil - Date.now()) / 1000);
    throw new Error(`Cohere rate-limited (retry in ${remaining}s)`);
  }
  // Use v2 chat API with current model names (command-r-* and command-r-plus-* are deprecated since Sep 2025)
  const models = [
    "command-a-03-2025",       // Current production model
    "command-a-plus-05-2026",  // Newer model
    "command-r7b-12-2024",     // Smaller/faster fallback
    "c4ai-aya-expanse-32b",    // Aya (multilingual) fallback
  ];
  let lastErr = "";
  let hit429 = false;
  for (const model of models) {
    try {
      const res = await fetch("https://api.cohere.ai/v2/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401) {
          cohereDisabled = true;
          throw new Error("Cohere API key invalid");
        }
        if (res.status === 429) {
          hit429 = true;
          lastErr = `Cohere ${model} rate-limited`;
          continue; // Try next model — some have separate limits
        }
        lastErr = `Cohere ${model} error: ${errText.slice(0, 200)}`;
        continue;
      }
      const json = await res.json();
      // v2 API response format:
      // { message: { role: "assistant", content: [{ type: "text", text: "..." }] }, ... }
      // (Note: content is INSIDE message, not at the root.)
      const contentArr = json?.message?.content ?? json?.content;
      if (Array.isArray(contentArr)) {
        for (const c of contentArr) {
          if (typeof c === "string" && c.length > 5) return c;
          if (c?.type === "text" && c?.text && c.text.length > 5) {
            return c.text;
          }
        }
      }
      // v1 API fallback (text directly on root)
      const text = json?.text;
      if (text && text.length > 5) return text;
      lastErr = `Cohere ${model} returned empty content (${JSON.stringify(json).slice(0, 200)})`;
      // Debug: print the actual response so we can see what's wrong
      console.warn(`[Cohere ${model}] unexpected response shape:`, JSON.stringify(json).slice(0, 500));
    } catch (e) {
      if (e instanceof Error && e.message.includes("API key invalid")) throw e;
      lastErr = e instanceof Error ? e.message : "Unknown error";
      continue;
    }
  }
  // If we hit 429 on all models, disable Cohere for 60s to avoid wasting time
  // on subsequent calls (best-trades runs 10 consensus calls in parallel).
  if (hit429) {
    cohereRateLimitedUntil = Date.now() + 60_000;
    throw new Error("Cohere rate-limited (all models, retry in 60s)");
  }
  throw new Error(lastErr || "Cohere: all models failed");
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Claude error: ${e}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        { role: "system", content: "You are a senior technical analyst. Be concise and direct." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`OpenAI error: ${e}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function callDeepSeek(prompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-reasoner",
      max_tokens: 500,
      messages: [
        { role: "system", content: "You are a senior technical analyst. Be concise and direct." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`DeepSeek error: ${e}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

// ---------- Get ensemble consensus ----------
// Returns "BUY" / "SELL" / "HOLD" / "DISAGREE" if at least one provider voted.
// Returns "TECHNICAL_ONLY" if every provider errored (so callers can
// distinguish "no AI available" from "AI agrees with HOLD").
export async function getEnsembleConsensus(
  symbol: string,
  snap: IndicatorSnapshot,
  composite: CompositeSignal,
  patterns: PatternMatch[]
): Promise<ConsensusResult> {
  const prompt = buildPrompt(symbol, snap, composite, patterns);
  const providers = getConfiguredProviders().filter((p) => p.available);

  const votes: ModelVote[] = [];

  // Run all configured providers in parallel
  const promises = providers.map(async (p) => {
    try {
      let response = "";
      if (p.id === "together") response = await callTogether(prompt);
      else if (p.id === "mistral") response = await callMistral(prompt);
      else if (p.id === "deepinfra") response = await callDeepInfra(prompt);
      else if (p.id === "cohere") response = await callCohere(prompt);
      else if (p.id === "gemini") response = await callGemini(prompt);
      else if (p.id === "openrouter") response = await callOpenRouter(prompt);
      else if (p.id === "groq") response = await callGroq(prompt);
      else if (p.id === "glm") response = await callGLM(prompt);
      else if (p.id === "claude") response = await callClaude(prompt);
      else if (p.id === "openai") response = await callOpenAI(prompt);
      else if (p.id === "deepseek") response = await callDeepSeek(prompt);
      return parseVote(response, p.label);
    } catch (e) {
      return {
        provider: p.label,
        action: "HOLD" as const,
        reasoning: "",
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

  const results = await Promise.all(promises);
  for (const r of results) votes.push(r);

  // Detect "all errored" — if every vote has an `error`, we can't trust
  // the consensus. Mark as TECHNICAL_ONLY so callers can show "AI unavailable".
  const allErrored = votes.length > 0 && votes.every((v) => !!v.error);
  if (allErrored) {
    return {
      consensus: "TECHNICAL_ONLY",
      votes,
      agreeCount: 0,
      totalCount: votes.length,
    };
  }

  // Count only successful votes (exclude errored ones)
  const validVotes = votes.filter((v) => !v.error);
  const counts: Record<string, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const v of validVotes) counts[v.action]++;

  const maxCount = Math.max(counts.BUY, counts.SELL, counts.HOLD);
  const consensus =
    maxCount >= Math.ceil(validVotes.length / 2 + 0.5) && validVotes.length > 1
      ? (Object.entries(counts).find(([_, c]) => c === maxCount)?.[0] as
          | "BUY"
          | "SELL"
          | "HOLD"
          | undefined) ?? "DISAGREE"
      : validVotes.length === 1
      ? validVotes[0].action
      : "DISAGREE";

  return {
    consensus: consensus ?? "DISAGREE",
    votes,
    agreeCount: maxCount,
    totalCount: votes.length,
  };
}
