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
  // Match index symbol preceded by space or string start, followed by
  // "VALUE CHANGE (PCT%)" pattern. No lookahead needed — direct match.
  String.raw`(?:^|\s)([A-Z][A-Z0-9]{3,12})\s+(` +
    NUM +
    String.raw`)\s+(-?` +
    NUM +
    String.raw`)\s*\((-?[\d.]+)%\)`,
  "g"
);

const SCRIP_RE = new RegExp(
  String.raw`([A-Z][A-Z0-9 .&'-]{2,40}?)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(-?[\d.]+)\s+(\d[\d,]+)`,
  "g"
);

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

  // Parse scrips in the body (with sector headers)
  const scrips: DirectScrip[] = [];
  const sectorRe = /([A-Z][A-Z\s&]+?)\s+SCRIP\s+LDCP\s+OPEN\s+HIGH\s+LOW\s+CURRENT\s+CHANGE\s+VOLUME/g;
  const sectors: { name: string; pos: number }[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectorRe.exec(body)) !== null) {
    sectors.push({ name: sm[1].trim(), pos: sm.index + sm[0].length });
  }

  SCRIP_RE.lastIndex = 0;
  while ((m = SCRIP_RE.exec(body)) !== null) {
    const name = m[1].trim();
    if (/^(?:APPAREL|AUTOMOBILE|SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME)$/i.test(name)) continue;
    if (/\b(HIGH|LOW|CURRENT|CHANGE|VOLUME|LDCP|OPEN|SCRIP)\b/.test(name)) continue;
    if (name.length > 30) continue;

    let sector = "OTHER";
    for (let i = sectors.length - 1; i >= 0; i--) {
      if (sectors[i].pos <= m.index) {
        sector = sectors[i].name;
        break;
      }
    }

    const ldcp = toNum(m[2]);
    const current = toNum(m[6]);
    const change = Number(m[7]);
    scrips.push({
      symbol: name,
      ldcp,
      open: toNum(m[3]),
      high: toNum(m[4]),
      low: toNum(m[5]),
      current,
      change,
      changePct: ldcp > 0 ? (change / ldcp) * 100 : 0,
      volume: toNum(m[8]),
      sector,
    });
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
