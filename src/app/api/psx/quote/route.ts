import { NextResponse } from "next/server";
import { parsePsxHtml, type PsxSummary } from "@/lib/psx-parser";
import { cleanSymbol } from "@/lib/symbol-utils";
import {
  callZai,
  RateLimitError,
  isRateLimited,
  getRateLimitedUntil,
} from "@/lib/zai-ratelimit";
import { fetchPsxDirect, type DirectScrip } from "@/lib/psx-direct";
import { saveScripDailySnapshot } from "@/lib/scrip-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const PSX_URL = "https://www.psx.com.pk/market-summary";

let cached: { data: PsxSummary | null; at: number } = { data: null, at: 0 };
let lastError: { msg: string; at: number } | null = null;
const CACHE_TTL_MS = 30_000;
const STALE_CACHE_TTL_MS = 60 * 60_000;

// Stock name mapping
const STOCK_NAMES: Record<string, string> = {
  MEBL: "Meezan Bank", PPL: "Pakistan Petroleum", OGDC: "Oil & Gas Dev Co",
  PTC: "Pakistan Telecommunication", HBL: "Habib Bank", LUCK: "Lucky Cement",
  ENGRO: "Engro Corporation", FFCL: "Fauji Fertilizer", UBL: "United Bank",
  MCB: "Muslim Commercial Bank", BAHL: "Bank Al-Habib", ABL: "Allied Bank",
  NBP: "National Bank", PSO: "Pakistan State Oil", SNGP: "Sui Northern Gas",
  SSGC: "Sui Southern Gas", KAPCO: "Kot Addu Power", HUBC: "Hub Power",
  POL: "Pakistan Oilfields", NRL: "National Refinery", ATRL: "Attock Refinery",
  MLCF: "Maple Leaf Cement", FCCL: "Fauji Cement", KOHC: "Kohat Cement",
  CHCC: "Cherat Cement", DGKC: "D.G. Khan Cement", NML: "Nishat Mills",
  NCL: "Nishat Chunian", GATM: "Gatron Industries", INDU: "Indus Motor",
  TRG: "TRG Pakistan", SYS: "Systems Limited", KEL: "K-Electric",
  NESTLE: "Nestle Pakistan", UNILEVER: "Unilever", COLG: "Colgate Palmolive",
  SEARLE: "G.D. Searle", ABOT: "Abbott Lab", GLAXO: "GlaxoSmithKline",
  MARI: "Mari Petroleum", CNERGY: "Cnergyico", EPCL: "Engro Polymer",
  BOP: "Bank of Punjab", BAFL: "Bank Alfalah", BIPL: "BankIslami",
  FABL: "Fauji Fertilizer Bin Qasim", FATIMA: "Fatima Fertilizer",
  EFERT: "Engro Fertilizer", AIRLINK: "Air Link", UNITY: "Unity Foods",
  WAVES: "Waves Singer", ICI: "ICI Pakistan", GAL: "Ghani Global",
  SNBL: "Soneri Bank", SILK: "Silkbank", SCB: "Standard Chartered",
  PRL: "Pak Refinery", CSIL: "Crescent Steel", ASL: "Amreli Steels",
  ASTL: "Amreli Steels", MUGHAL: "Mughal Iron", INIL: "International Industries",
  LWCB: "Lowe & Rudd", ISL: "International Steels", STL: "Sitara Textiles",
  GF: "Gadoon Textiles", KT: "Kohinoor Textiles", NAF: "Nishat Textile",
  MFB: "Meezan Bank Fund", FSLL: "Faysal Spinning", FDPL: "Faysal Drilling",
  GENP: "General Tyre", GANI: "Ghani Glass", SGL: "Saadi Glass",
  TGL: "Tariq Glass", BBERG: "Babri Cotton", FZPL: "Fauji Foods",
  NATF: "NIB Bank", AKBL: "Askari Bank", AGP: "AGP Limited",
  FEROZ: "Ferozsons Lab", AGRO: "Agriauto Industries", HCAR: "Honda Atlas",
  PSMC: "Pak Suzuki", TELE: "Telecard", AVNL: "Avanceon",
  AVA: "Avanceon", GHNI: "Ghani Automobile", GAD: "Gadoon Textiles",
  BWRL: "Bandweggy Rice", RMPL: "Rafhan Maize", MEBLF: "Meezan Bank Fund",
  GHGL: "Ghani Glass", MOIL: "Mughal Iron", MUGHAL: "Mughal Iron",
  SHELL: "Shell Pakistan", SPO: "Searle Pakistan", SOT: "Sotac Pharma",
  WL: "Waves Singer", WAV: "Waves Singer", ZAH: "Zafar Textiles",
  PPMC: "Pak Paper", DCL: "Dewan Cement", DCML: "Dewan Cement",
  BPL: "Bestway Cement", CHBL: "Cherat Cement", FECTO: "Fecto Cement",
  GICC: "Gul Ahmed", JAT: "Jubilee Insurance", AGIL: "Agriauto",
  KSB: "KSB Pumps", BAW: "Bawani Air", RPL: "Ravi Pharma",
  EFOODS: "Engro Foods", AML: "Amreli Steels", ABL: "Allied Bank",
  BOP: "Bank of Punjab", SIN: "Sindh Energy", FDCL: "Fauji Dev",
  GEN: "General Tyre", GIF: "Ghani Glass",
};

function getStockName(symbol: string): string {
  const clean = symbol.split("-")[0].toUpperCase();
  return STOCK_NAMES[clean] || clean;
}

async function fetchPsxSummary(): Promise<PsxSummary> {
  if (cached.data && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const direct = await fetchPsxDirect();
    const scrips = direct.scrips.map((s) => ({
      symbol: s.symbol,
      ldcp: s.ldcp,
      open: s.open,
      high: s.high,
      low: s.low,
      current: s.current,
      change: s.change,
      changePct: s.changePct,
      volume: s.volume,
      sector: s.sector,
    }));
    const indices = direct.indices.map((i) => ({
      symbol: i.symbol,
      name: i.symbol,
      value: i.value,
      change: i.change,
      changePct: i.changePct,
    }));
    const parsed: PsxSummary = {
      indices,
      scrips,
      fetchedAt: direct.fetchedAt,
      source: direct.source + " (direct HTTP)",
    };
    if (parsed.indices.length > 0 || parsed.scrips.length > 0) {
      cached = { data: parsed, at: Date.now() };
      lastError = null;
      saveScripDailySnapshot(parsed.scrips).catch((e) =>
        console.warn("[psx/quote] saveScripDailySnapshot failed:", e instanceof Error ? e.message : "unknown")
      );
      return parsed;
    }
  } catch (e) {
    console.warn(
      "[psx/quote] direct HTTP fetch failed, falling back to z-ai:",
      e instanceof Error ? e.message : "unknown"
    );
  }

  if (isRateLimited()) {
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      return cached.data;
    }
    throw new RateLimitError("z-ai rate-limited, no fresh cache available");
  }

  try {
    const result = await callZai((zai) =>
      zai.functions.invoke("page_reader", { url: PSX_URL })
    );
    const html =
      (result as { data?: { html?: string } })?.data?.html ??
      (result as { html?: string })?.html ?? "";
    if (!html) throw new Error("Empty HTML returned from page_reader");
    const parsed = parsePsxHtml(html);
    if (parsed.indices.length === 0 && parsed.scrips.length === 0) {
      throw new Error("PSX page returned no parseable data");
    }
    cached = { data: parsed, at: Date.now() };
    lastError = null;
    return parsed;
  } catch (e) {
    lastError = { msg: e instanceof Error ? e.message : "Unknown", at: Date.now() };
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      return cached.data;
    }
    throw e;
  }
}

function scripToStock(s: {
  symbol: string; ldcp: number; open: number; high: number; low: number;
  current: number; change: number; changePct: number; volume: number; sector: string;
}) {
  return {
    symbol: s.symbol,
    name: getStockName(s.symbol),
    cleanSymbol: s.symbol.split("-")[0].toUpperCase(),
    price: s.current, change: s.change, changePct: s.changePct,
    volume: s.volume, bid: s.current, ask: s.current,
    high52: 0, low52: 0, ldcp: s.ldcp, open: s.open, high: s.high, low: s.low, sector: s.sector,
  };
}

export async function GET() {
  try {
    const summary = await fetchPsxSummary();
    const kse100 = summary.indices.find((i) => i.symbol === "KSE100");

    // DEDUP by clean symbol — keep highest volume contract per underlying
    const seenScrips = new Map<string, typeof summary.scrips[0]>();
    for (const s of summary.scrips) {
      const clean = cleanSymbol(s.symbol);
      const existing = seenScrips.get(clean);
      if (!existing || s.volume > existing.volume) {
        seenScrips.set(clean, s);
      }
    }
    const dedupedScrips = Array.from(seenScrips.values());

    const sorted = [...dedupedScrips].sort((a, b) => b.changePct - a.changePct);
    const gainers = sorted.slice(0, 5);
    const losers = sorted.slice(-5).reverse();

    const byVolume = [...dedupedScrips]
      .filter((s) => s.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 9);

    const kse100Stock = kse100 ? {
      symbol: "KSE100", name: "KSE-100 Index", price: kse100.value,
      change: kse100.change, changePct: kse100.changePct, volume: 0,
      bid: kse100.value, ask: kse100.value, high52: 0, low52: 0,
    } : null;

    return NextResponse.json({
      ok: true,
      data: {
        indices: summary.indices,
        // Return DEDUPED scrips (one per underlying stock, no AUG/SEP duplicates)
        scrips: dedupedScrips.map(scripToStock),
        uniqueUnderlyings: dedupedScrips.length,
        featured: kse100Stock
          ? [kse100Stock, ...byVolume.map((s) => scripToStock(s))]
          : byVolume.map((s) => scripToStock(s)),
        gainers: gainers.map(scripToStock),
        losers: losers.map(scripToStock),
        fetchedAt: summary.fetchedAt,
        source: summary.source,
        cacheInfo: {
          cachedAt: cached.at ? new Date(cached.at).toISOString() : null,
          ageSec: cached.at ? Math.floor((Date.now() - cached.at) / 1000) : null,
          rateLimited: isRateLimited(),
          rateLimitedUntil: getRateLimitedUntil() ? new Date(getRateLimitedUntil()).toISOString() : null,
          lastError: lastError ? { msg: lastError.msg, at: new Date(lastError.at).toISOString() } : null,
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/quote] error:", err);
    const isRL = err instanceof RateLimitError;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed", rateLimited: isRL },
      { status: isRL ? 429 : 500 }
    );
  }
}
