// Direct PSX HTTP fetcher — no z-ai dependency.
// Uses the PHP endpoint that the psx.com.pk page loads via AJAX.
// This bypasses the z-ai rate limit entirely.
//
// PARSER v2 — matches the official PSX market-summary HTML structure:
//   <th colspan="8"><h4> SECTOR_NAME </h4></th>
//   <tr class="red-text-td">
//     <td class="dataportal" data-srip="OGDC">Oil & Gas DevXD</td>
//     <td>300.50</td>   LDCP
//     <td>300.01</td>   OPEN
//     <td>301.45</td>   HIGH
//     <td>297.6</td>    LOW
//     <td>298.12</td>   CURRENT
//     <td> <span class="decrease-rate"></span> -2.38</td>   CHANGE
//     <td>1,401,041</td> VOLUME
//   </tr>
//
// The `data-srip` attribute is the OFFICIAL PSX ticker symbol (exactly as the
// PSX website uses). The cell text is the company display name.

const PSX_PHP_URL = "https://www.psx.com.pk/psx/include71650/new-PSX-market-summary.php";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://www.psx.com.pk/market-summary/",
  "Accept": "text/html,application/xhtml+xml",
};

export interface DirectScrip {
  /** Official PSX ticker symbol (from data-srip attribute) — e.g. "OGDC", "AICL-OCTB" */
  symbol: string;
  /** Company display name as shown on PSX website — e.g. "Oil & Gas DevXD" */
  companyName: string;
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
  /** "table" = official data-srip parser, "regex" = legacy fallback */
  parserMode: "table" | "regex";
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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ---------- TABLE PARSER (official data-srip) ----------

const SECTOR_TH_RE = /<th[^>]*>\s*<h4>\s*([^<]+?)\s*<\/h4>\s*<\/th>/gi;

// One scrip row: symbol cell + 5 plain numeric cells + change cell + volume cell
const ROW_RE =
  /<td[^>]*class="dataportal"[^>]*data-srip="([^"]+)"[^>]*>([\s\S]*?)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>\s*<span[^>]*><\/span>\s*(-?[\d.]+)<\/td>\s*<td>([\d,]+)<\/td>/gi;

// Relaxed row fallback (some scrips have the change cell without a span)
const ROW_RE_RELAXED =
  /<td[^>]*class="dataportal"[^>]*data-srip="([^"]+)"[^>]*>([\s\S]*?)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td[^>]*>\s*(-?[\d.]+)\s*<\/td>\s*<td>([\d,]+)<\/td>/gi;

// Header words that can't be a scrip sector
const NON_SECTOR_RE =
  /^(?:SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME|MARKET\s+SUMMARY|MAIN\s+BOARD|GEM\s+BOARD)/i;

interface TableRow {
  symbol: string;
  companyName: string;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  volume: number;
  sector: string;
}

function parseTableRows(html: string): TableRow[] {
  // Locate sector header positions in the RAW html
  const headers: { name: string; end: number }[] = [];
  SECTOR_TH_RE.lastIndex = 0;
  let hm: RegExpExecArray | null;
  while ((hm = SECTOR_TH_RE.exec(html)) !== null) {
    const name = decodeEntities(hm[1]).toUpperCase();
    if (!name || NON_SECTOR_RE.test(name)) continue;
    headers.push({ name, end: hm.index + hm[0].length });
  }
  if (headers.length === 0) return [];

  const rows: TableRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < headers.length; i++) {
    const cur = headers[i];
    const nextStart = i + 1 < headers.length ? headers[i + 1].end : html.length;
    const chunk = html.slice(cur.end, nextStart);

    // Try the strict regex first, then the relaxed one — collect row matches
    // with their offsets so we can merge both passes.
    const found = new Map<number, RegExpExecArray>();
    ROW_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROW_RE.exec(chunk)) !== null) found.set(m.index, m);
    ROW_RE_RELAXED.lastIndex = 0;
    while ((m = ROW_RE_RELAXED.exec(chunk)) !== null) {
      if (!found.has(m.index)) found.set(m.index, m);
    }

    const matches = [...found.values()].sort((a, b) => a.index - b.index);
    for (const m of matches) {
      const symbol = m[1].trim();
      const companyName = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      if (!symbol || !companyName) continue;
      // Dedupe: keep FIRST occurrence per symbol+sector (canonical)
      const key = `${symbol}|${cur.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        symbol,
        companyName,
        ldcp: toNum(m[3]),
        open: toNum(m[4]),
        high: toNum(m[5]),
        low: toNum(m[6]),
        current: toNum(m[7]),
        change: Number(m[8]),
        volume: toNum(m[9]),
        sector: cur.name,
      });
    }
  }
  return rows;
}

// ---------- LEGACY REGEX PARSER (fallback if table structure changes) ----------

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
  if (/^(?:APPAREL|AUTOMOBILE|SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME|MARKET|SUMMARY|BOARD|GEM|MAIN)$/i.test(name)) {
    return true;
  }
  for (const w of HEADER_WORDS) {
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(name)) return true;
  }
  if (name.length > 35) return true;
  if (name.split(/\s+/).length > 5) return true;
  return false;
}

function parseLegacyRows(html: string): TableRow[] {
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

  // Indices (dedupe — page lists them twice)
  const indices: DirectIndex[] = [];
  const seenIdx = new Set<string>();
  let m: RegExpExecArray | null;
  INDEX_RE.lastIndex = 0;
  while ((m = INDEX_RE.exec(head)) !== null) {
    const symbol = m[1];
    if (seenIdx.has(symbol)) continue;
    if (!INDEX_NAMES[symbol]) continue;
    seenIdx.add(symbol);
    indices.push({ symbol, value: toNum(m[2]), change: toNum(m[3]), changePct: Number(m[4]) });
  }

  const headerPositions: { name: string; start: number; end: number }[] = [];
  SECTOR_HEADER_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = SECTOR_HEADER_RE.exec(body)) !== null) {
    headerPositions.push({ name: sm[1].trim(), start: sm.index, end: sm.index + sm[0].length });
  }

  const rows: TableRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < headerPositions.length; i++) {
    const cur = headerPositions[i];
    const next = headerPositions[i + 1];
    if (cur.name === "END MUTUAL FUND") continue;
    const chunkStart = cur.end;
    const chunkEnd = next ? next.start : body.length;
    const chunkText = body.slice(chunkStart, chunkEnd);
    SCRIP_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = SCRIP_RE.exec(chunkText)) !== null) {
      const name = cm[1].trim();
      if (looksLikeHeaderName(name)) continue;
      const key = `${name}|${cur.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ldcp = toNum(cm[2]);
      rows.push({
        symbol: name, // legacy: company name only — table parser is preferred
        companyName: name,
        ldcp,
        open: toNum(cm[3]),
        high: toNum(cm[4]),
        low: toNum(cm[5]),
        current: toNum(cm[6]),
        change: Number(cm[7]),
        volume: toNum(cm[8]),
        sector: cur.name,
      });
    }
  }
  return rows;
}

// Parse indices from the plain-text part of the page (same for both parsers)
function parseIndices(html: string): DirectIndex[] {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const msIdx = text.indexOf("MARKET SUMMARY");
  const head = msIdx >= 0 ? text.slice(0, msIdx) : text;

  const indices: DirectIndex[] = [];
  const seenIdx = new Set<string>();
  INDEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INDEX_RE.exec(head)) !== null) {
    const symbol = m[1];
    if (seenIdx.has(symbol)) continue;
    if (!INDEX_NAMES[symbol]) continue;
    seenIdx.add(symbol);
    indices.push({ symbol, value: toNum(m[2]), change: toNum(m[3]), changePct: Number(m[4]) });
  }
  return indices;
}

// Parse the PSX PHP HTML response (server-side rendered — no JS needed)
export function parseDirectHtml(html: string): DirectPsxSummary {
  // PRIMARY: official table parser (data-srip attribute = real PSX ticker)
  const tableRows = parseTableRows(html);
  const parserMode: "table" | "regex" = tableRows.length > 0 ? "table" : "regex";
  const rows = tableRows.length > 0 ? tableRows : parseLegacyRows(html);

  const scrips: DirectScrip[] = rows.map((r) => ({
    symbol: r.symbol,
    companyName: r.companyName,
    ldcp: r.ldcp,
    open: r.open,
    high: r.high,
    low: r.low,
    current: r.current,
    change: r.change,
    changePct: r.ldcp > 0 ? (r.change / r.ldcp) * 100 : 0,
    volume: r.volume,
    sector: r.sector,
  }));

  return {
    indices: parseIndices(html),
    scrips,
    fetchedAt: new Date().toISOString(),
    source: PSX_PHP_URL,
    parserMode,
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
