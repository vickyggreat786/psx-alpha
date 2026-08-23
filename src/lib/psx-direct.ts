// Direct PSX HTTP fetcher — no z-ai dependency.
// Uses the PHP endpoint that the psx.com.pk page loads via AJAX.
// This bypasses the z-ai rate limit entirely.

const PSX_PHP_URL = "https://www.psx.com.pk/psx/include71650/new-PSX-market-summary.php";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://www.psx.com.pk/market-summary/",
  "Accept": "text/html,application/xhtml+xml",
};

export interface DirectScrip {
  symbol: string;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  changePct: number;
  volume: number;
  sector: string;
}

export interface DirectIndex {
  symbol: string;
  value: number;
  change: number;
  changePct: number;
}

export interface DirectPsxSummary {
  indices: DirectIndex[];
  scrips: DirectScrip[];
  fetchedAt: string;
  source: string;
}

const INDEX_NAMES: Record<string, string> = {
  KSE100: "KSE-100 Index",
  KSE100PR: "KSE-100 PR",
  ALLSHR: "All Shares Index",
  KSE30: "KSE-30 Index",
  KMI30: "KMI-30 Index",
  BKTI: "Banking Index",
  OGTI: "OGTI Index",
  KMIALLSHR: "KMI All Share",
  PSXDIV20: "PSX Dividend 20",
  UPP9: "UPP-9 Index",
  NITPGI: "NITPGI",
  NBPPGI: "NBPPGI",
  MZNPI: "MZNPI",
  JSMFI: "JSMFI",
  ACI: "ACI",
  JSGBKTI: "JSGB KTI",
  MII30: "MII-30",
};

function toNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

const NUM = String.raw`\d+(?:,\d{3})*(?:\.\d+)?|\d+\.\d+`;

const INDEX_RE = new RegExp(
  String.raw`(?:^|\s)([A-Z][A-Z0-9]{3,12})\s+(` +
    NUM +
    String.raw`)\s+(-?` +
    NUM +
    String.raw`)\s*\((-?[\d.]+)%\)`,
  "g"
);

// Sector header regex — matches "<SectorName> SCRIP LDCP OPEN HIGH LOW CURRENT CHANGE VOLUME"
const SECTOR_HEADER_RE =
  /([A-Z][A-Z\s&]+?)\s+SCRIP\s+LDCP\s+OPEN\s+HIGH\s+LOW\s+CURRENT\s+CHANGE\s+VOLUME/g;

// Header words that should never appear inside a scrip name (case-sensitive).
const HEADER_WORDS = ["HIGH", "LOW", "CURRENT", "CHANGE", "VOLUME", "LDCP", "OPEN", "SCRIP", "MARKET", "SUMMARY", "BOARD"];

// Scrip row regex — captures name + 7 numbers.
// Name can be: "OGDC", "P.V.C.", "Indus Motor Co.", "AICL-AUG", "D.G. Khan Cement"
// IMPORTANT: We use a non-greedy capture but require NO header words inside.
const SCRIP_RE = new RegExp(
  String.raw`([A-Z][A-Z0-9 .&'\-]{2,60}?)\s+(` +
    NUM +
    String.raw`)\s+(` +
    NUM +
    String.raw`)\s+(` +
    NUM +
    String.raw`)\s+(` +
    NUM +
    String.raw`)\s+(` +
    NUM +
    String.raw`)\s+(-?[\d.]+)\s+(\d[\d,]+)`,
  "g"
);

function looksLikeHeaderName(name: string): boolean {
  // Reject if name is exactly a header word
  if (/^(?:APPAREL|AUTOMOBILE|SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME|MARKET|SUMMARY|BOARD|GEM|MAIN)$/i.test(name)) {
    return true;
  }
  // Reject if name contains any header word as a whole word
  for (const w of HEADER_WORDS) {
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(name)) return true;
  }
  // Reject if too long (likely a multi-row match)
  if (name.length > 35) return true;
  // Reject if it has more than 4 separate tokens (likely captures header)
  if (name.split(/\s+/).length > 5) return true;
  return false;
}

// Parse the PSX PHP HTML response (server-side rendered — no JS needed)
export function parseDirectHtml(html: string): DirectPsxSummary {
  // Strip scripts + styles + tags
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const msIdx = text.indexOf("MARKET SUMMARY");
  const head = msIdx >= 0 ? text.slice(0, msIdx) : text;
  const body = msIdx >= 0 ? text.slice(msIdx) : "";

  // Parse indices (dedupe — page lists them twice)
  const indices: DirectIndex[] = [];
  const seenIdx = new Set<string>();
  let m: RegExpExecArray | null;
  INDEX_RE.lastIndex = 0;
  while ((m = INDEX_RE.exec(head)) !== null) {
    const symbol = m[1];
    if (seenIdx.has(symbol)) continue;
    if (!INDEX_NAMES[symbol]) continue;
    seenIdx.add(symbol);
    indices.push({
      symbol,
      value: toNum(m[2]),
      change: toNum(m[3]),
      changePct: Number(m[4]),
    });
  }

  // Build list of sector header positions in the body.
  // The PSX page lists sectors in this order:
  //   APPAREL, AUTOMOBILE ASSEMBLER, ..., FUTURE CONTRACTS, GLASS, ..., WOOLLEN
  //   and then REPEATS some sectors at the end (e.g. MISCELLANEOUS, POWER GEN)
  // — those repeats appear to be a page footer / re-listing of certain scrips.
  // We treat each chunk between headers as belonging to the most recent header.
  const headerPositions: { name: string; start: number; end: number }[] = [];
  {
    SECTOR_HEADER_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = SECTOR_HEADER_RE.exec(body)) !== null) {
      headerPositions.push({
        name: sm[1].trim(),
        start: sm.index,
        end: sm.index + sm[0].length,
      });
    }
  }

  // For each header, slice the chunk of text up to the NEXT header (or end of body),
  // and parse scrips within that chunk. This avoids the previous bug where a
  // malformed scrip match would span multiple sectors and cause the sector lookup
  // to fall back to FUTURE CONTRACTS for everything after.
  const scrips: DirectScrip[] = [];

  // Dedupe by (symbol, sector) — the page sometimes lists the same scrip twice
  // (e.g. in a "main" sector and again in a "MISCELLANEOUS" footer block).
  // We keep the FIRST occurrence (the canonical sector).
  const seen = new Set<string>();

  for (let i = 0; i < headerPositions.length; i++) {
    const cur = headerPositions[i];
    const next = headerPositions[i + 1];
    // Skip footer markers
    if (cur.name === "END MUTUAL FUND") continue;

    const chunkStart = cur.end;
    const chunkEnd = next ? next.start : body.length;
    const chunkText = body.slice(chunkStart, chunkEnd);

    SCRIP_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = SCRIP_RE.exec(chunkText)) !== null) {
      const name = cm[1].trim();
      if (looksLikeHeaderName(name)) continue;

      const ldcp = toNum(cm[2]);
      const current = toNum(cm[6]);
      const change = Number(cm[7]);
      const volume = toNum(cm[8]);
      // Skip zero-volume, zero-change, and identical-OHLC rows (likely dust)
      if (volume === 0 && change === 0 && ldcp === current) {
        // Still include — some valid scrips have 0 volume on quiet days
      }

      const key = `${name}|${cur.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      scrips.push({
        symbol: name,
        ldcp,
        open: toNum(cm[3]),
        high: toNum(cm[4]),
        low: toNum(cm[5]),
        current,
        change,
        changePct: ldcp > 0 ? (change / ldcp) * 100 : 0,
        volume,
        sector: cur.name,
      });
    }
  }

  return {
    indices,
    scrips,
    fetchedAt: new Date().toISOString(),
    source: PSX_PHP_URL,
  };
}

// Fetch PSX data directly via HTTP (no z-ai needed!)
export async function fetchPsxDirect(): Promise<DirectPsxSummary> {
  const res = await fetch(PSX_PHP_URL, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`PSX PHP endpoint returned ${res.status}`);
  }
  const html = await res.text();
  if (!html || html.length < 1000) {
    throw new Error("PSX PHP endpoint returned empty/short response");
  }
  return parseDirectHtml(html);
}
