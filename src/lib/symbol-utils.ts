// Helper to display clean stock symbols — strips ALL future contract suffixes
// from PSX symbols including: -AUG, -SEP, -AUGB, -SEPB, -AUGA, etc.

// PSX future contracts have suffixes like:
//   CNERGY-AUG   → August future
//   FFC-SEPB     → September B (second September contract)
//   MEBL-AUGB    → August B (second August contract)
//   FABL-SEPB    → September B
//   HBL-AUGB     → August B
//
// We strip ALL of these to show just the clean stock name (CNERGY, FFC, MEBL, etc.)

const FUTURE_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function isFutureSuffix(s: string): boolean {
  const upper = s.toUpperCase();
  // Standard 3-letter month: AUG, SEP, OCT, etc.
  if (FUTURE_MONTHS.includes(upper)) return true;
  // Extended: AUGB, SEPB, AUGA, SEPA, etc. (month + optional A/B/C suffix)
  if (upper.length >= 3 && upper.length <= 4) {
    const monthPart = upper.slice(0, 3);
    if (FUTURE_MONTHS.includes(monthPart)) return true;
  }
  return false;
}

export function cleanSymbol(symbol: string): string {
  const parts = symbol.split("-");
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].toUpperCase();
    if (isFutureSuffix(lastPart)) {
      return parts.slice(0, -1).join("-");
    }
  }
  return symbol;
}

export function getFutureMonth(symbol: string): string | null {
  const parts = symbol.split("-");
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].toUpperCase();
    if (isFutureSuffix(lastPart)) {
      return lastPart;
    }
  }
  return null;
}

export function isFutureContract(symbol: string): boolean {
  return getFutureMonth(symbol) !== null;
}
