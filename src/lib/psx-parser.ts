// PSX Market Summary Parser
// Parses the raw HTML from https://www.psx.com.pk/market-summary
// into structured indices + per-sector scrips.

export interface PsxIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePct: number;
}

export interface PsxScrip {
  symbol: string;
  ldcp: number; // last day close
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  changePct: number;
  volume: number;
  sector: string;
}

export interface PsxSummary {
  indices: PsxIndex[];
  scrips: PsxScrip[];
  fetchedAt: string;
  source: string;
}

const INDEX_SYMBOLS: Record<string, { name: string }> = {
  KSE100: { name: "KSE-100 Index" },
  KSE100PR: { name: "KSE-100 PR" },
  ALLSHR: { name: "All Shares Index" },
  KSE30: { name: "KSE-30 Index" },
  KMI30: { name: "KMI-30 Index" },
  BKTI: { name: "Banking Index" },
  OGTI: { name: "OGTI Index" },
  KMIALLSHR: { name: "KMI All Share" },
  PSXDIV20: { name: "PSX Dividend 20" },
  UPP9: { name: "UPP-9 Index" },
  NITPGI: { name: "NITPGI" },
  NBPPGI: { name: "NBPPGI" },
  MZNPI: { name: "MZNPI" },
  JSMFI: { name: "JSMFI" },
  ACI: { name: "ACI" },
  JSGBKTI: { name: "JSGB KTI" },
  MII30: { name: "MII-30" },
};

const NUM = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+`;

// Pattern for an index row: SYMBOL VALUE CHANGE (PCT%)
const INDEX_RE = new RegExp(
  String.raw`([A-Z][A-Z0-9]{1,12})\s+(` + NUM + String.raw`)\s+(-?` + NUM + String.raw`)\s*\((-?[\d.]+)%\)`,
  "g"
);

// Pattern for a scrip row: NAME LDCP OPEN HIGH LOW CURRENT CHANGE VOLUME
// Names can include letters, dots, dashes, ampersands, spaces.
const SCRIP_RE = new RegExp(
  String.raw`([A-Z][A-Z0-9 .&'-]{1,40}?)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(` + NUM + String.raw`)\s+(-?` + NUM + String.raw`)\s+(` + NUM + String.raw`)`,
  "g"
);

function toNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

export function parsePsxHtml(html: string): PsxSummary {
  // Strip scripts/styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Find indices section (before "MARKET SUMMARY")
  const msIdx = text.indexOf("MARKET SUMMARY");
  const head = msIdx >= 0 ? text.slice(0, msIdx) : text;
  const body = msIdx >= 0 ? text.slice(msIdx) : "";

  // Parse indices — dedupe (the page lists them twice)
  const indices: PsxIndex[] = [];
  const seenIdx = new Set<string>();
  let m: RegExpExecArray | null;
  INDEX_RE.lastIndex = 0;
  while ((m = INDEX_RE.exec(head)) !== null) {
    const symbol = m[1];
    if (seenIdx.has(symbol)) continue;
    if (!INDEX_SYMBOLS[symbol]) continue;
    seenIdx.add(symbol);
    indices.push({
      symbol,
      name: INDEX_SYMBOLS[symbol].name,
      value: toNum(m[2]),
      change: toNum(m[3]),
      changePct: Number(m[4]),
    });
  }

  // Parse scrips within sectors. We scan the body and split by sector headers.
  // A sector header looks like: "APPAREL AUTOMOBILE ASSEMBLER SCRIP LDCP..."
  // Approach: walk through body, when we hit a "SCRIP LDCP OPEN HIGH LOW CURRENT CHANGE VOLUME"
  // token, the text *before* it is the sector name. Then scrip rows follow until
  // we hit the next sector header or end of body.

  const scrips: PsxScrip[] = [];
  // Find all scrip rows in body. We don't actually need the sector name to display
  // a chart, but it's useful for grouping. We'll record sector by finding the
  // nearest preceding sector header.

  // First, find all sector header positions in body
  const sectorRe = /([A-Z][A-Z\s&]+?)\s+SCRIP\s+LDCP\s+OPEN\s+HIGH\s+LOW\s+CURRENT\s+CHANGE\s+VOLUME/g;
  const sectors: { name: string; pos: number }[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectorRe.exec(body)) !== null) {
    sectors.push({
      name: sm[1].trim(),
      pos: sm.index + sm[0].length,
    });
  }

  // For each scrip row, find the closest preceding sector
  SCRIP_RE.lastIndex = 0;
  while ((m = SCRIP_RE.exec(body)) !== null) {
    const name = m[1].trim();
    // Skip if name looks like an index header token
    if (/^(?:APPAREL|AUTOMOBILE|SCRIP|LDCP|OPEN|HIGH|LOW|CURRENT|CHANGE|VOLUME)$/i.test(name)) continue;
    // Skip if name contains column header words (it's a leaked header row)
    if (/\b(HIGH|LOW|CURRENT|CHANGE|VOLUME|LDCP|OPEN|SCRIP)\b/.test(name)) continue;
    // Skip if too short or doesn't look like a real symbol
    if (name.length < 2) continue;
    // Skip very long names (likely parsing artifacts)
    if (name.length > 30) continue;

    // Find nearest preceding sector
    let sector = "OTHER";
    for (let i = sectors.length - 1; i >= 0; i--) {
      if (sectors[i].pos <= m.index) {
        sector = sectors[i].name;
        break;
      }
    }

    const ldcp = toNum(m[2]);
    const open = toNum(m[3]);
    const high = toNum(m[4]);
    const low = toNum(m[5]);
    const current = toNum(m[6]);
    const change = toNum(m[7]);
    const volume = toNum(m[8]);
    const changePct = ldcp > 0 ? (change / ldcp) * 100 : 0;

    scrips.push({
      symbol: name,
      ldcp,
      open,
      high,
      low,
      current,
      change,
      changePct,
      volume,
      sector,
    });
  }

  return {
    indices,
    scrips,
    fetchedAt: new Date().toISOString(),
    source: "psx.com.pk/market-summary",
  };
}
