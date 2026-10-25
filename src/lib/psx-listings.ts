// PSX listings — authoritative symbol/sector/name mappings.
//
// SOURCE OF TRUTH: `psx-official-list.ts` is AUTO-GENERATED directly from
// psx.com.pk's market-summary page (`data-srip` attributes = official PSX
// ticker symbols). Every symbol here matches the PSX website exactly.
//
// Twelve Data's list is still consulted as a secondary source for companies
// that exist in the TD universe but did not appear in today's market summary.

import {
  PSX_OFFICIAL_LIST,
  PSX_OFFICIAL_SECTORS,
  PSX_FUTURES_LIST,
} from "./psx-official-list";

export interface ListedCompany {
  symbol: string;
  name: string;
  sector: string;
}

// Company display names on the PSX market-summary page sometimes carry a
// trailing market-status marker: XD (ex-dividend), CB (cum-bonus), XB
// (ex-bonus), CR (cum-rights), XR (ex-rights). These are NOT part of the
// company name — strip them for display.
export function cleanCompanyName(name: string): string {
  return name
    .replace(/(?:XD|CB|XB|CR|XR|XD\d*)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Sector names exactly as PSX's market-summary page uses them.
export const PSX_SECTORS = PSX_OFFICIAL_SECTORS;

// Official PSX scrips (cash market). Names cleaned of XD/CB markers.
export const LISTED_COMPANIES: ListedCompany[] = PSX_OFFICIAL_LIST.map((s) => ({
  symbol: s.symbol,
  name: cleanCompanyName(s.name) || s.name,
  sector: s.sector,
}));

// Today's futures contracts (PSX lists them separately on market-summary).
export const FUTURES_CONTRACTS: ListedCompany[] = PSX_FUTURES_LIST.map((s) => ({
  symbol: s.symbol,
  name: cleanCompanyName(s.name) || s.name,
  sector: s.sector,
}));

// Lookup map: symbol → sector (for futures-contract deduping).
// Key is uppercased scrip symbol WITHOUT any -AUG/-SEP suffix.
const SYMBOL_TO_SECTOR: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of [...LISTED_COMPANIES, ...FUTURES_CONTRACTS]) {
    const key = c.symbol.toUpperCase();
    if (!m.has(key)) m.set(key, c.sector);
  }
  return m;
})();

// Lookup map: symbol → company name.
const SYMBOL_TO_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of [...LISTED_COMPANIES, ...FUTURES_CONTRACTS]) {
    const key = c.symbol.toUpperCase();
    if (!m.has(key)) m.set(key, c.name);
  }
  return m;
})();

// Strip futures-contract suffix: "AICL-AUG" → "AICL", "AICL-AUGB" → "AICL".
export function stripFuturesSuffix(symbol: string): string {
  // PSX uses -JAN/-FEB/-.../-DEC for futures contract months, optionally
  // followed by B (back-month) or C (cash-settled).
  return symbol.replace(/-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[BCT]?$/i, "");
}

// Look up the proper sector for a scrip symbol. If symbol has a futures
// suffix, the underlying symbol is looked up in the official list.
// Falls back to the provided fallback, then "MISCELLANEOUS".
export function lookupSector(symbol: string, fallback = "MISCELLANEOUS"): string {
  const clean = stripFuturesSuffix(symbol).toUpperCase();
  return SYMBOL_TO_SECTOR.get(clean) ?? fallback;
}

// Look up the company name (proper noun) for a scrip symbol.
export function lookupName(symbol: string): string | null {
  const clean = stripFuturesSuffix(symbol).toUpperCase();
  return SYMBOL_TO_NAME.get(clean) ?? null;
}

// All listed companies grouped by sector (for /api/psx/listings).
export function getListedBySector(): Record<string, ListedCompany[]> {
  const bySector: Record<string, ListedCompany[]> = {};
  for (const sector of PSX_SECTORS) {
    bySector[sector] = LISTED_COMPANIES.filter((c) => c.sector === sector);
  }
  return bySector;
}

// Total count of unique listed companies by symbol.
export const TOTAL_LISTED = (() => {
  const seen = new Set<string>();
  for (const c of LISTED_COMPANIES) seen.add(c.symbol.toUpperCase());
  return seen.size;
})();
