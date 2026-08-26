// Sector classifier for PSX stocks — uses both the curated list AND
// heuristic name-based classification to fill in sectors for stocks that
// aren't in the curated list.

import {
  LISTED_COMPANIES,
  PSX_SECTORS,
} from "./psx-listings";
import { TWELVE_DATA_PSX_LIST } from "./twelve-data-list";

// Curated symbol → sector map (fast lookup)
const CURATED_SECTOR_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of LISTED_COMPANIES) {
    if (!m.has(c.symbol.toUpperCase())) {
      m.set(c.symbol.toUpperCase(), c.sector);
    }
  }
  return m;
})();

// Heuristic sector classifier — uses keyword matching on company name.
// Each rule is a list of (regex, sector) — the FIRST matching rule wins.
const SECTOR_RULES: Array<{ re: RegExp; sector: string }> = [
  // Banks
  { re: /bank|banking|habib|united bank|meezan|allied bank|askari|faysal|silk|soneri|punjab bank|khyber bank|alfalah|al-habib|JS Bank/i, sector: "COMMERCIAL BANKS" },
  // Insurance
  { re: /insurance|assurance|efu|jubilee|igl|igi|adamjee insurance/i, sector: "INSURANCE" },
  // Modarabas
  { re: /modaraba/i, sector: "MODARABAS" },
  // Leasing
  { re: /leasing|corporation ltd|orix pakistan/i, sector: "LEASING COMPANIES" },
  // Cement
  { re: /cement|lucky cement|maple leaf|d\.?g\.?khan|fauji cement|kohat|cherat|attock cement|bestway cement|dewan cement|fecto|dandot|pioneer cement|power cement/i, sector: "CEMENT" },
  // Fertilizer
  { re: /fertilizer|engro fert|fauji fert|fatima fert|ffbl|efert/i, sector: "FERTILIZER" },
  // Oil & Gas Exploration
  { re: /oil\s*&\s*gas\s*devel|ogdc|pakistan petroleum|ppl|mari petroleum|pakistan oilfields|pol\b/i, sector: "OIL & GAS EXPLORATION COMPANIES" },
  // Oil & Gas Marketing
  { re: /oil\s*marketing|cnergyico|pakistan state oil|pso\b|shell pakistan|sui northern|sui southern|byco|attock petroleum|apl\b|sngp|ssgc|haspet|lpg\b/i, sector: "OIL & GAS MARKETING COMPANIES" },
  // Refinery
  { re: /refinery|national refinery|attock refinery|pakistan refinery|byco petroleum|tpl refinery/i, sector: "REFINERY" },
  // Power
  { re: /power|electric|k-electric|hub power|kot addu|nishat power|nishat chunian|pakgen|jpvc|japan power|gadoon power|altern energy|atlas power/i, sector: "POWER GENERATION & DISTRIBUTION" },
  // Pharma
  { re: /pharma|agp|searle|abbott|glaxo|wyeth|ferozson|highnoon|abbot labs|faisal pharma|om pharma|cypress|sapphire pharma/i, sector: "PHARMACEUTICALS" },
  // Cement (already covered) - Engineering/Steel
  { re: /steel|iron|metal|amreli|aisha steel|international steel|international industries|mughal iron|crescent steel|kohinoor steel/i, sector: "ENGINEERING" },
  // Engineering misc
  { re: /engineering|siemens|kSB pumps|agriauto|millat|treet battery|atlas battery|exide|general tyre|hino|hinopak|bela auto|loads|sazew|sazgar/i, sector: "ENGINEERING" },
  // Auto assembler
  { re: /motor|indus motor|honda atlas|ghandhara|millat tractor|al-ghazi tractor|dewan motor|hino motor|sazgar engineering/i, sector: "AUTOMOBILE ASSEMBLER" },
  // Auto parts
  { re: /tyre|battery|wheels|agriauto|exide|atlas battery|treet battery|balochistan wheels|ghani pro|general tyre|loads ltd/i, sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  // Textile Spinning
  { re: /spinning|yarn|gul ahmed|nishat mills|nishat chunian|gatron|gadoon textile|kohinoor|masood|fazal textile|sitara|rafihan|ahmed hasan|sitara text|kohinoor text|naveena|ruby|saif text|stl\b/i, sector: "TEXTILE SPINNING" },
  // Textile Composite
  { re: /composite|nml\b|ncl\b|gatron industries|unity foods/i, sector: "TEXTILE COMPOSITE" },
  // Textile Weaving
  { re: /weaving|fabric|knitwear|intl knit|stylers|intersilk|naveena apparel/i, sector: "TEXTILE WEAVING" },
  // Apparel
  { re: /apparel|image apparel|int knitwear|masood textile|stylers/i, sector: "APPAREL" },
  // Food
  { re: /foods?|nestle|unilever|engro foods|unity foods|fauji foods|national foods|rafhan maize|quice foods|euro food|pak foods|friesland|bannu wool/i, sector: "FOOD & PERSONAL CARE PRODUCTS" },
  // Sugar
  { re: /sugar|jdw sugar|al-noor sugar|hums sugar|faran sugar|mirpur sugar|premier sugar|tandlian|shahjahan|jdws|al-hamd|rangoli|hangla sugar/i, sector: "SUGAR & ALLIED INDUSTRIES" },
  // Tobacco
  { re: /tobacco|philip morris|pakistan tobacco/i, sector: "TOBACCO" },
  // Chemical
  { re: /chemical|chemicals|engro polymer|sitara chemical|akzo nobel|lotus|lotchem|berger paints|ici\b|dolmen|descon chemical|ghani chemical|sapphire chem|spls|vicplast/i, sector: "CHEMICAL" },
  // Glass & Ceramics
  { re: /glass|ceramic|ghani glass|tariq glass|saadi glass|siemens glass|sialkot glass|pak ceramics/i, sector: "GLASS & CERAMICS" },
  // Paper & Packaging
  { re: /paper|packaging|packages ltd|century paper|macro packages|tri-pack films|kraft paper|carton/i, sector: "BOARD & PACKAGING" },
  // Cable & Electrical
  { re: /cable|wire|electrical goods|pakistan cables|pak electron|tri-pack films|swet|telecable/i, sector: "CABLE & ELECTRICAL GOODS" },
  // Technology & Communication
  { re: /systems|technology|trg pakistan|avanceon|telecard|worldcall|wtr\b|airlink|avanceon ltd|telecard|wireless/i, sector: "TECHNOLOGY & COMMUNICATION" },
  // Telecom
  { re: /telecom|ptcl\b|pakistan telecomm|warid|telenor|zong|jazz|ufone/i, sector: "TECHNOLOGY & COMMUNICATION" },
  // Real Estate / REIT
  { re: /reit|properties|real estate|dolmen city|tpl properties|icon plc/i, sector: "REAL ESTATE INVESTMENT TRUST" },
  // Property (non-REIT)
  { re: /property|pace pakistan|pibtl|pakvision/i, sector: "PROPERTY" },
  // Transport
  { re: /airline|piac|piaa|shipping|pakistan national shipping|pnsc|maritime|cargo|transport/i, sector: "TRANSPORT" },
  // Media
  { re: /media|network|hum network|news|jang|geo|dawn|ary|express|broadcasting/i, sector: "MISCELLANEOUS" },
  // Vanaspati
  { re: /vanaspati|edible oil|ghee|unity foods|waves singer|fauji foods/i, sector: "VANASPATI & ALLIED INDUSTRIES" },
  // Synthetic & Rayon
  { re: /synthetic|rayon|ruba|polyester|dewan polyester/i, sector: "SYNTHETIC & RAYON" },
  // Leather
  { re: /leather|tanner|bata pakistan|service industries|dewan leather|falling leathers/i, sector: "LEATHER & TANNERIES" },
  // Jute
  { re: /jute|janana jute|maju jute/i, sector: "JUTE" },
  // Woollen
  { re: /wool|woollen|bawair|bannu|gad wool|mod wool/i, sector: "WOOLLEN" },
  // Mutual Funds / ETFs
  { re: /fund|etf|mutual|naveena|g etfxd|etfxd|nist/i, sector: "EXCHANGE TRADED FUNDS" },
];

// Classify a stock's sector based on its name. Returns the first matching rule,
// or null if no rule matches.
export function classifySectorByCompany(symbol: string, name: string): string | null {
  // First, check the curated list
  const curated = CURATED_SECTOR_MAP.get(symbol.toUpperCase());
  if (curated) return curated;

  // Then, try heuristic rules on the name
  for (const rule of SECTOR_RULES) {
    if (rule.re.test(name)) {
      return rule.sector;
    }
  }
  return null;
}

// Get all PSX-listed companies (Twelve Data list) with classified sectors.
// Falls back to "OTHER" if no rule matches.
export interface ClassifiedStock {
  symbol: string;
  name: string;
  sector: string;
  source: "curated" | "heuristic" | "other";
}

export function getAllClassifiedStocks(): ClassifiedStock[] {
  const result: ClassifiedStock[] = [];
  const seen = new Set<string>();
  for (const s of TWELVE_DATA_PSX_LIST) {
    const sym = s.symbol.toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    const curated = CURATED_SECTOR_MAP.get(sym);
    if (curated) {
      result.push({ symbol: s.symbol, name: s.name, sector: curated, source: "curated" });
    } else {
      const heuristic = classifySectorByCompany(s.symbol, s.name);
      if (heuristic) {
        result.push({ symbol: s.symbol, name: s.name, sector: heuristic, source: "heuristic" });
      } else {
        result.push({ symbol: s.symbol, name: s.name, sector: "MISCELLANEOUS", source: "other" });
      }
    }
  }
  return result;
}

// Quick lookup: symbol → sector (uses curated + heuristic, falls back to MISCELLANEOUS)
const SECTOR_LOOKUP_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of getAllClassifiedStocks()) {
    if (!m.has(c.symbol.toUpperCase())) {
      m.set(c.symbol.toUpperCase(), c.sector);
    }
  }
  return m;
})();

export function lookupSectorBySymbol(symbol: string): string {
  return SECTOR_LOOKUP_MAP.get(symbol.toUpperCase()) ?? "MISCELLANEOUS";
}
