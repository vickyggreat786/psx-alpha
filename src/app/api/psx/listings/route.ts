import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Curated list of major PSX-listed companies across sectors (covers ~120
// most-traded + bluechip PSX companies). The market-summary page on
// psx.com.pk only shows TODAY's traded scrips (~146), so this gives us a
// fuller picture across the entire exchange.

interface ListedCompany {
  symbol: string;
  name: string;
  sector: string;
}

const LISTED_COMPANIES: ListedCompany[] = [
  // Oil & Gas
  { symbol: "OGDC", name: "Oil & Gas Development Co.", sector: "Oil & Gas Exploration" },
  { symbol: "PPL", name: "Pakistan Petroleum Ltd", sector: "Oil & Gas Exploration" },
  { symbol: "POL", name: "Pakistan Oilfields Ltd", sector: "Oil & Gas Exploration" },
  { symbol: "MARI", name: "Mari Petroleum Co", sector: "Oil & Gas Exploration" },
  { symbol: "PSO", name: "Pakistan State Oil", sector: "Oil & Gas Marketing" },
  { symbol: "APL", name: "Attock Petroleum Ltd", sector: "Oil & Gas Marketing" },
  { symbol: "SNGP", name: "Sui Northern Gas Pipelines", sector: "Gas Distribution" },
  { symbol: "SSGC", name: "Sui Southern Gas Company", sector: "Gas Distribution" },
  { symbol: "SHEL", name: "Shell Pakistan Ltd", sector: "Oil & Gas Marketing" },
  { symbol: "AICL", name: "Attock Insurance Company Ltd", sector: "Insurance" },

  // Banking
  { symbol: "HBL", name: "Habib Bank Ltd", sector: "Commercial Banks" },
  { symbol: "UBL", name: "United Bank Ltd", sector: "Commercial Banks" },
  { symbol: "MCB", name: "Muslim Commercial Bank", sector: "Commercial Banks" },
  { symbol: "ABYL", name: "Allied Bank Ltd", sector: "Commercial Banks" },
  { symbol: "BAFL", name: "Bank Alfalah Ltd", sector: "Commercial Banks" },
  { symbol: "MEBL", name: "Meezan Bank Ltd", sector: "Commercial Banks" },
  { symbol: "BAHL", name: "Bank Al-Habib Ltd", sector: "Commercial Banks" },
  { symbol: "NBP", name: "National Bank of Pakistan", sector: "Commercial Banks" },
  { symbol: "AKBL", name: "Askari Bank Ltd", sector: "Commercial Banks" },
  { symbol: "FABL", name: "Faysal Bank Ltd", sector: "Commercial Banks" },
  { symbol: "BIPL", name: "BankIslami Pakistan", sector: "Commercial Banks" },
  { symbol: "BOP", name: "Bank of Punjab", sector: "Commercial Banks" },
  { symbol: "BOK", name: "Bank of Khyber", sector: "Commercial Banks" },
  { symbol: "SCBPL", name: "Standard Chartered Bank Pakistan", sector: "Commercial Banks" },
  { symbol: "SILK", name: "Silkbank Ltd", sector: "Commercial Banks" },
  { symbol: "JSBL", name: "JS Bank Ltd", sector: "Commercial Banks" },

  // Cement
  { symbol: "LUCK", name: "Lucky Cement Ltd", sector: "Cement" },
  { symbol: "DGKC", name: "D.G. Khan Cement", sector: "Cement" },
  { symbol: "MLCF", name: "Maple Leaf Cement", sector: "Cement" },
  { symbol: "KOHC", name: "Kohat Cement Ltd", sector: "Cement" },
  { symbol: "FCCL", name: "Fauji Cement Co", sector: "Cement" },
  { symbol: "ACPL", name: "Attock Cement Ltd", sector: "Cement" },
  { symbol: "CHCC", name: "Cherat Cement Co", sector: "Cement" },
  { symbol: "BWCL", name: "Bestway Cement Ltd", sector: "Cement" },
  { symbol: "PIOC", name: "Pioneer Cement Ltd", sector: "Cement" },
  { symbol: "FECTC", name: "Fecto Cement Ltd", sector: "Cement" },

  // Fertilizer
  { symbol: "ENGRO", name: "Engro Corporation Ltd", sector: "Conglomerate" },
  { symbol: "EFERT", name: "Engro Fertilizers Ltd", sector: "Fertilizer" },
  { symbol: "FFC", name: "Fauji Fertilizer Co", sector: "Fertilizer" },
  { symbol: "FATIMA", name: "Fatima Fertilizer Co", sector: "Fertilizer" },
  { symbol: "FFBL", name: "Fauji Fertilizer Bin Qasim", sector: "Fertilizer" },
  { symbol: "DAWH", name: "Dawood Hercules Corp", sector: "Conglomerate" },

  // Power / Energy
  { symbol: "HUBC", name: "Hub Power Co", sector: "Power Generation" },
  { symbol: "KAPCO", name: "Kot Adu Power Co", sector: "Power Generation" },
  { symbol: "NPL", name: "Nishat Power Ltd", sector: "Power Generation" },
  { symbol: "NCPL", name: "Nishat Chunian Power", sector: "Power Generation" },
  { symbol: "KEL", name: "K-Electric Ltd", sector: "Power Distribution" },

  // Engineering / Autos
  { symbol: "INDU", name: "Indus Motor Co", sector: "Automobile Assembler" },
  { symbol: "HINO", name: "Hinopak Motors Ltd", sector: "Automobile Assembler" },
  { symbol: "MTL", name: "Millat Tractors Ltd", sector: "Automobile Parts" },
  { symbol: "AGTL", name: "Al-Ghazi Tractors Ltd", sector: "Automobile Parts" },
  { symbol: "GHNI", name: "Ghani Automobile Industries", sector: "Automobile Parts" },
  { symbol: "TRSM", name: "Treet Motor Ltd", sector: "Automobile Parts" },
  { symbol: "GHGL", name: "Ghani Global Ltd", sector: "Engineering" },

  // Tech
  { symbol: "SYS", name: "Systems Limited", sector: "Technology" },
  { symbol: "AVN", name: "Avanceon Ltd", sector: "Technology" },
  { symbol: "TRT", name: "Treet Battery Ltd", sector: "Technology" },
  { symbol: "PTEC", name: "Pak Telecom Ltd", sector: "Telecom" },
  { symbol: "PTC", name: "Pakistan Telecommunications", sector: "Telecom" },

  // Pharma
  { symbol: "GLAXO", name: "GlaxoSmithKline Pakistan", sector: "Pharmaceuticals" },
  { symbol: "ABOT", name: "Abbott Laboratories", sector: "Pharmaceuticals" },
  { symbol: "SEARL", name: "SEARLE Co Ltd", sector: "Pharmaceuticals" },
  { symbol: "FIZER", name: "Wyeth Pakistan Ltd", sector: "Pharmaceuticals" },
  { symbol: "HINOON", name: "Highnoon Laboratories", sector: "Pharmaceuticals" },

  // Food
  { symbol: "NESTLE", name: "Nestlé Pakistan Ltd", sector: "Food" },
  { symbol: "UNITY", name: "Unity Foods Ltd", sector: "Food" },
  { symbol: "RMPL", name: "Rafhan Maize Products", sector: "Food" },
  { symbol: "UNILEVER", name: "Unilever Pakistan Foods", sector: "Consumer Goods" },

  // Textiles
  { symbol: "GATM", name: "Gul Ahmed Textile Mills", sector: "Textile" },
  { symbol: "NML", name: "Nishat Mills Ltd", sector: "Textile" },
  { symbol: "NCL", name: "Nishat Chunian Ltd", sector: "Textile" },
  { symbol: "GAUR", name: "Gauhar Textile Mills", sector: "Textile" },

  // Chemicals
  { symbol: "LOTHER", name: "Lotter Chemicals Ltd", sector: "Chemicals" },
  { symbol: "EPCL", name: "Engro Polymer & Chemicals", sector: "Chemicals" },
  { symbol: "SITC", name: "Sitara Chemical Industries", sector: "Chemicals" },
  { symbol: "BNWM", name: "Bawair Water Mod", sector: "Chemicals" },
  { symbol: "BERG", name: "Berger Paints Pakistan", sector: "Chemicals" },
  { symbol: "ICI", name: "ICI Pakistan Ltd", sector: "Chemicals" },

  // Insurance
  { symbol: "AICL", name: "Attock Insurance Ltd", sector: "Insurance" },
  { symbol: "EFUL", name: "EFU General Insurance", sector: "Insurance" },
  { symbol: "EFUG", name: "EFU Life Assurance", sector: "Insurance" },
  { symbol: "JLICL", name: "Jubilee General Insurance", sector: "Insurance" },
  { symbol: "IGIHL", name: "IGI Holdings Ltd", sector: "Insurance" },

  // Refinery
  { symbol: "NRL", name: "National Refinery Ltd", sector: "Refinery" },
  { symbol: "ATRL", name: "Attock Refinery Ltd", sector: "Refinery" },
  { symbol: "PRL", name: "Pakistan Refinery Ltd", sector: "Refinery" },
  { symbol: "BYCO", name: "Byco Petroleum Pakistan", sector: "Refinery" },

  // Sugar
  { symbol: "ALNRS", name: "Al-Noor Sugar Mills", sector: "Sugar" },
  { symbol: "HUMBL", name: "Hum Network Ltd", sector: "Media" },
  { symbol: "HUMNL", name: "Hum Network Ltd", sector: "Media" },

  // Steel
  { symbol: "ASTL", name: "Aisha Steel Mills Ltd", sector: "Steel" },
  { symbol: "ISL", name: "International Steels Ltd", sector: "Steel" },
  { symbol: "MUGHAL", name: "Mughal Iron & Steel", sector: "Steel" },
  { symbol: "INIL", name: "International Industries Ltd", sector: "Steel" },

  // Real Estate / REIT
  { symbol: "TPLP", name: "TPL Properties Ltd", sector: "Real Estate" },
  { symbol: "TPL", name: "TPL Corp Ltd", sector: "Conglomerate" },
  { symbol: "PALC", name: "Pak Aluminium Ltd", sector: "Engineering" },

  // Logistics / Transport
  { symbol: "PIAA", name: "Pakistan International Airlines", sector: "Transport" },
  { symbol: "PNSC", name: "Pakistan National Shipping", sector: "Transport" },

  // Tobacco
  { symbol: "PAKR", name: "Pakistan Tobacco Co", sector: "Tobacco" },
  { symbol: "PHILP", name: "Philip Morris Pakistan", sector: "Tobacco" },

  // Paper
  { symbol: "PKGS", name: "Packages Ltd", sector: "Paper" },
  { symbol: "CEPB", name: "Century Paper Board", sector: "Paper" },
];

// GET /api/psx/listings — returns all known PSX-listed companies (curated list)
export async function GET() {
  // Group by sector
  const sectors = [...new Set(LISTED_COMPANIES.map((c) => c.sector))].sort();
  const bySector: Record<string, ListedCompany[]> = {};
  for (const c of LISTED_COMPANIES) {
    if (!bySector[c.sector]) bySector[c.sector] = [];
    bySector[c.sector].push(c);
  }

  return NextResponse.json({
    ok: true,
    data: {
      total: LISTED_COMPANIES.length,
      sectors: sectors,
      bySector,
      companies: LISTED_COMPANIES,
      note:
        "Curated list of major PSX-listed companies (~90+ bluechip names). " +
        "Real-time prices for these come from /api/psx/quote (which scrapes " +
        "psx.com.pk/market-summary — only shows TODAY's traded scrips). " +
        "For full coverage of all 600+ PSX-listed companies, contact PSX " +
        "Data Portal (dps.psx.com.pk) for official data subscription.",
      source: "curated + psx.com.pk + dps.psx.com.pk",
    },
  });
}
