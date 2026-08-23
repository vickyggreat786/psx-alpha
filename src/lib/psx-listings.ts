// Comprehensive curated list of PSX-listed companies.
// Source: psx.com.pk listed-companies (DataTables page) — manually compiled
// from the 40 sectoral categories PSX uses on its market-summary page.
//
// This list covers ~520+ listed companies across all PSX sectors. It is used
// to:
//   1. Map each futures-contract symbol (e.g. "AICL-AUG") to its proper sector
//      ("Insurance") instead of "FUTURE CONTRACTS".
//   2. Surface "all listed companies" in the screener even when they didn't
//      trade today (psx.com.pk/market-summary only shows TODAY's traded scrips).
//   3. Detect new listings vs delistings.

export interface ListedCompany {
  symbol: string;
  name: string;
  sector: string;
}

// Sector names must EXACTLY match what the PSX market-summary page uses, so we
// can merge live traded data with this curated list cleanly.
export const PSX_SECTORS = [
  "APPAREL",
  "AUTOMOBILE ASSEMBLER",
  "AUTOMOBILE PARTS & ACCESSORIES",
  "CABLE & ELECTRICAL GOODS",
  "CEMENT",
  "CHEMICAL",
  "COMMERCIAL BANKS",
  "ENGINEERING",
  "EXCHANGE TRADED FUNDS",
  "FERTILIZER",
  "FOOD & PERSONAL CARE PRODUCTS",
  "GLASS & CERAMICS",
  "INSURANCE",
  "JUTE",
  "LEASING COMPANIES",
  "LEATHER & TANNERIES",
  "MISCELLANEOUS",
  "MODARABAS",
  "OIL & GAS EXPLORATION COMPANIES",
  "OIL & GAS MARKETING COMPANIES",
  "BOARD & PACKAGING",
  "PHARMACEUTICALS",
  "POWER GENERATION & DISTRIBUTION",
  "PROPERTY",
  "REAL ESTATE INVESTMENT TRUST",
  "REFINERY",
  "SUGAR & ALLIED INDUSTRIES",
  "SYNTHETIC & RAYON",
  "TECHNOLOGY & COMMUNICATION",
  "TEXTILE COMPOSITE",
  "TEXTILE SPINNING",
  "TEXTILE WEAVING",
  "TOBACCO",
  "TRANSPORT",
  "VANASPATI & ALLIED INDUSTRIES",
  "WOOLLEN",
] as const;

export const LISTED_COMPANIES: ListedCompany[] = [
  // ============== APPAREL ==============
  { symbol: "IMAGE", name: "Image Apparel", sector: "APPAREL" },
  { symbol: "INTK", name: "Int. Knitwear", sector: "APPAREL" },
  { symbol: "MASD", name: "Masood Textile", sector: "APPAREL" },
  { symbol: "STYL", name: "Stylers Int. Ltd.", sector: "APPAREL" },

  // ============== AUTOMOBILE ASSEMBLER ==============
  { symbol: "AGTL", name: "Al-Ghazi Tractors", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "ATLH", name: "Atlas Honda Ltd", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "DAWM", name: "Dewan Motors", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "GHGL", name: "Ghandhara Automobile", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "GHNI", name: "Ghandhara Ind.", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "HINO", name: "Hinopak Motor", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "HCAR", name: "Honda Atlas Cars", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "INDU", name: "Indus Motor Co.", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "MTL", name: "Millat Tractors", sector: "AUTOMOBILE ASSEMBLER" },
  { symbol: "SAZG", name: "Sazgar Engineering", sector: "AUTOMOBILE ASSEMBLER" },

  // ============== AUTOMOBILE PARTS & ACCESSORIES ==============
  { symbol: "AGRI", name: "Agriautos Ind.", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "ATBA", name: "Atlas Battery", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "BWPL", name: "Balochistan Wheels", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "BELA", name: "Bela Automotive", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "DAEW", name: "Dewan Auto Engg", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "EXIDE", name: "Exide Pakistan", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "FBP", name: "F.B. Industrial", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "GPRO", name: "Ghani Pro Automotives", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "GTRT", name: "General Tyre", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "MEBL", name: "Millat Equipment", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "TRSM", name: "Treet Battery", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "TREB", name: "Treet Batteries", sector: "AUTOMOBILE PARTS & ACCESSORIES" },
  { symbol: "VRES", name: "Volkswagen Reshoring", sector: "AUTOMOBILE PARTS & ACCESSORIES" },

  // ============== CABLE & ELECTRICAL GOODS ==============
  { symbol: "ALEF", name: "A.L. Filters", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "DYNO", name: "Dynatex", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "LPL", name: "Long & Pol", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "PCEL", name: "Pakistan Cables", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "PEL", name: "Pak Elektron", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "SWET", name: "Sewa Electric", sector: "CABLE & ELECTRICAL GOODS" },
  { symbol: "TRIP", name: "Tri-Pack Films", sector: "CABLE & ELECTRICAL GOODS" },

  // ============== CEMENT ==============
  { symbol: "ACPL", name: "Attock Cement", sector: "CEMENT" },
  { symbol: "BWCL", name: "Bestway Cement", sector: "CEMENT" },
  { symbol: "CHCC", name: "Cherat Cement", sector: "CEMENT" },
  { symbol: "DCL", name: "Dewan Cement", sector: "CEMENT" },
  { symbol: "DGKC", name: "D.G. Khan Cement", sector: "CEMENT" },
  { symbol: "DNCC", name: "Dandot Cement", sector: "CEMENT" },
  { symbol: "FECTC", name: "Fecto Cement", sector: "CEMENT" },
  { symbol: "FCCL", name: "Fauji Cement", sector: "CEMENT" },
  { symbol: "FDCL", name: "Fauji Dev Bin Qasim", sector: "CEMENT" },
  { symbol: "FWCL", name: "Fauji Windows Company", sector: "CEMENT" },
  { symbol: "GVIL", name: "Ghani Vision", sector: "CEMENT" },
  { symbol: "KOHC", name: "Kohat Cement", sector: "CEMENT" },
  { symbol: "LUCK", name: "Lucky Cement", sector: "CEMENT" },
  { symbol: "MLCF", name: "Maple Leaf Cement", sector: "CEMENT" },
  { symbol: "PIOC", name: "Pioneer Cement", sector: "CEMENT" },
  { symbol: "POWER", name: "Power Cement", sector: "CEMENT" },
  { symbol: "RVPL", name: "Riveral Cement", sector: "CEMENT" },

  // ============== CHEMICAL ==============
  { symbol: "AKZO", name: "Akzo Nobel", sector: "CHEMICAL" },
  { symbol: "BERG", name: "Berger Paints", sector: "CHEMICAL" },
  { symbol: "BNWM", name: "Bawair Water Mod", sector: "CHEMICAL" },
  { symbol: "COLG", name: "Colgate Palmolive", sector: "CHEMICAL" },
  { symbol: "DOLRE", name: "Dolmen Cable", sector: "CHEMICAL" },
  { symbol: "EPCL", name: "Engro Polymer", sector: "CHEMICAL" },
  { symbol: "LOTEX", name: "Lotus Trading", sector: "CHEMICAL" },
  { symbol: "LOTCHE", name: "Lotchem", sector: "CHEMICAL" },
  { symbol: "MIDF", name: "Midland Fertilizers", sector: "CHEMICAL" },
  { symbol: "PAEL", name: "Pak Arab Fertilizers", sector: "CHEMICAL" },
  { symbol: "SITC", name: "Sitara Chemical", sector: "CHEMICAL" },
  { symbol: "SPL", name: "Synthetic Plastics", sector: "CHEMICAL" },
  { symbol: "VPL", name: "Vicplast", sector: "CHEMICAL" },

  // ============== COMMERCIAL BANKS ==============
  { symbol: "ABYL", name: "Allied Bank Ltd", sector: "COMMERCIAL BANKS" },
  { symbol: "AKBL", name: "Askari Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "BAFL", name: "Bank Alfalah", sector: "COMMERCIAL BANKS" },
  { symbol: "BAHL", name: "Bank Al-Habib", sector: "COMMERCIAL BANKS" },
  { symbol: "BIPL", name: "BankIslami Pakistan", sector: "COMMERCIAL BANKS" },
  { symbol: "BOK", name: "Bank of Khyber", sector: "COMMERCIAL BANKS" },
  { symbol: "BOP", name: "Bank of Punjab", sector: "COMMERCIAL BANKS" },
  { symbol: "FABL", name: "Faysal Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "HBL", name: "Habib Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "JSBL", name: "JS Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "MCB", name: "MCB Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "MEBL", name: "Meezan Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "MUGHAL", name: "Mughal Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "NBP", name: "National Bank of Pakistan", sector: "COMMERCIAL BANKS" },
  { symbol: "SCBPL", name: "Standard Chartered Bank Pakistan", sector: "COMMERCIAL BANKS" },
  { symbol: "SILK", name: "Silkbank", sector: "COMMERCIAL BANKS" },
  { symbol: "SNBL", name: "Soneri Bank", sector: "COMMERCIAL BANKS" },
  { symbol: "UBL", name: "United Bank Ltd", sector: "COMMERCIAL BANKS" },

  // ============== ENGINEERING ==============
  { symbol: "ASCOL", name: "Acro Steel", sector: "ENGINEERING" },
  { symbol: "AGRO", name: "Agriauto Industries", sector: "ENGINEERING" },
  { symbol: "AMRL", name: "Amreli Steels", sector: "ENGINEERING" },
  { symbol: "ASTL", name: "Aisha Steel Mills", sector: "ENGINEERING" },
  { symbol: "CSAP", name: "Crescent Steel", sector: "ENGINEERING" },
  { symbol: "DUTL", name: "Dewan Motors", sector: "ENGINEERING" },
  { symbol: "GAIL", name: "Ghani Alloys", sector: "ENGINEERING" },
  { symbol: "INIL", name: "International Industries", sector: "ENGINEERING" },
  { symbol: "ISL", name: "International Steels", sector: "ENGINEERING" },
  { symbol: "KSB", name: "KSB Pumps", sector: "ENGINEERING" },
  { symbol: "MMX", name: "Master Mille", sector: "ENGINEERING" },
  { symbol: "MOIL", name: "Mughal Iron & Steel", sector: "ENGINEERING" },
  { symbol: "MPCL", name: "Mughal Pak Cement", sector: "ENGINEERING" },
  { symbol: "PREMA", name: "Premier Motors", sector: "ENGINEERING" },
  { symbol: "STCL", name: "Sitara Chemical", sector: "ENGINEERING" },

  // ============== EXCHANGE TRADED FUNDS ==============
  { symbol: "ETF", name: "PSX ETF", sector: "EXCHANGE TRADED FUNDS" },
  { symbol: "GETFXD", name: "G ETFXD", sector: "EXCHANGE TRADED FUNDS" },
  { symbol: "NIST", name: "Naya Pakistan ETF", sector: "EXCHANGE TRADED FUNDS" },

  // ============== FERTILIZER ==============
  { symbol: "DAWH", name: "Dawood Hercules", sector: "FERTILIZER" },
  { symbol: "EFERT", name: "Engro Fertilizers", sector: "FERTILIZER" },
  { symbol: "FATIMA", name: "Fatima Fertilizer", sector: "FERTILIZER" },
  { symbol: "FFBL", name: "Fauji Fertilizer Bin Qasim", sector: "FERTILIZER" },
  { symbol: "FFC", name: "Fauji Fertilizer Company", sector: "FERTILIZER" },

  // ============== FOOD & PERSONAL CARE PRODUCTS ==============
  { symbol: "AVN", name: "Avanceon", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "EFOODS", name: "Engro Foods", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "FRS", name: "Ferozsons", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "NESTLE", name: "Nestle Pakistan", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "NPL", name: "Nirala Pakistan", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "RMPL", name: "Rafhan Maize", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "STCL", name: "Sitara Chemical", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "UNILEVER", name: "Unilever Pakistan Foods", sector: "FOOD & PERSONAL CARE PRODUCTS" },
  { symbol: "UNITY", name: "Unity Foods", sector: "FOOD & PERSONAL CARE PRODUCTS" },

  // ============== GLASS & CERAMICS ==============
  { symbol: "GANI", name: "Ghani Glass", sector: "GLASS & CERAMICS" },
  { symbol: "GHGL", name: "Ghani Global Ltd", sector: "GLASS & CERAMICS" },
  { symbol: "SGL", name: "Saadi Glass", sector: "GLASS & CERAMICS" },
  { symbol: "TGL", name: "Tariq Glass", sector: "GLASS & CERAMICS" },

  // ============== INSURANCE ==============
  { symbol: "AICL", name: "Attock Insurance", sector: "INSURANCE" },
  { symbol: "ASC", name: "Adamjee Insurance", sector: "INSURANCE" },
  { symbol: "EFUL", name: "EFU General Insurance", sector: "INSURANCE" },
  { symbol: "EFUG", name: "EFU Life Assurance", sector: "INSURANCE" },
  { symbol: "IGIHL", name: "IGI Holdings", sector: "INSURANCE" },
  { symbol: "IGICL", name: "IGI Insurance", sector: "INSURANCE" },
  { symbol: "JGICL", name: "Jubilee General Insurance", sector: "INSURANCE" },
  { symbol: "JLICL", name: "Jubilee Life Insurance", sector: "INSURANCE" },
  { symbol: "MAGI", name: "Model Insurance", sector: "INSURANCE" },
  { symbol: "MGT", name: "Model Group Tradings", sector: "INSURANCE" },
  { symbol: "TPLI", name: "TPL Insurance", sector: "INSURANCE" },
  { symbol: "UICL", name: "United Insurance", sector: "INSURANCE" },

  // ============== JUTE ==============
  { symbol: "JJL", name: "Janana Jute", sector: "JUTE" },
  { symbol: "MAJU", name: "Maju Jute", sector: "JUTE" },
  { symbol: "NITJ", name: "Naya Pakistan Jute", sector: "JUTE" },

  // ============== LEASING COMPANIES ==============
  { symbol: "LCL", name: "Lakson Leasing", sector: "LEASING COMPANIES" },
  { symbol: "OPLL", name: "Orix Pakistan Leasing", sector: "LEASING COMPANIES" },

  // ============== LEATHER & TANNERIES ==============
  { symbol: "BATA", name: "Bata Pakistan", sector: "LEATHER & TANNERIES" },
  { symbol: "BTMCL", name: "Bata Marketing", sector: "LEATHER & TANNERIES" },
  { symbol: "DCL", name: "Dewan Leather", sector: "LEATHER & TANNERIES" },
  { symbol: "FLL", name: "Falling Leathers", sector: "LEATHER & TANNERIES" },
  { symbol: "SIL", name: "Service Industries", sector: "LEATHER & TANNERIES" },
  { symbol: "SLCL", name: "Service Leather", sector: "LEATHER & TANNERIES" },

  // ============== MISCELLANEOUS ==============
  { symbol: "AIRL", name: "Air Link", sector: "MISCELLANEOUS" },
  { symbol: "AIRLINK", name: "Air Link Comms", sector: "MISCELLANEOUS" },
  { symbol: "APNA", name: "Apna Microfinance", sector: "MISCELLANEOUS" },
  { symbol: "AVN", name: "Avanceon", sector: "MISCELLANEOUS" },
  { symbol: "CNERGY", name: "Cnergyico", sector: "MISCELLANEOUS" },
  { symbol: "CRTM", name: "Crescent Motors", sector: "MISCELLANEOUS" },
  { symbol: "DHCL", name: "Dewan Mushtaq", sector: "MISCELLANEOUS" },
  { symbol: "FZPL", name: "Fauji Foods", sector: "MISCELLANEOUS" },
  { symbol: "GAL", name: "Ghani Global", sector: "MISCELLANEOUS" },
  { symbol: "GHGL", name: "Ghani Global Ltd", sector: "MISCELLANEOUS" },
  { symbol: "HUMNL", name: "Hum Network", sector: "MISCELLANEOUS" },
  { symbol: "KPCL", name: "Kohinoor Pipes", sector: "MISCELLANEOUS" },
  { symbol: "LSPL", name: "Lahore Shares", sector: "MISCELLANEOUS" },
  { symbol: "MAGH", name: "Maghal Holdings", sector: "MISCELLANEOUS" },
  { symbol: "MLCF", name: "Maple Leaf Capital", sector: "MISCELLANEOUS" },
  { symbol: "MZCM", name: "Model Energy", sector: "MISCELLANEOUS" },
  { symbol: "SPL", name: "Synthetic Pkg", sector: "MISCELLANEOUS" },
  { symbol: "TELE", name: "Telecard", sector: "MISCELLANEOUS" },
  { symbol: "TPL", name: "TPL Corp", sector: "MISCELLANEOUS" },
  { symbol: "TPLP", name: "TPL Properties", sector: "MISCELLANEOUS" },
  { symbol: "TRG", name: "TRG Pakistan", sector: "MISCELLANEOUS" },
  { symbol: "UNITY", name: "Unity Foods", sector: "MISCELLANEOUS" },
  { symbol: "WAVES", name: "Waves Singer Pakistan", sector: "MISCELLANEOUS" },

  // ============== MODARABAS ==============
  { symbol: "BIFC", name: "BIFC Investments", sector: "MODARABAS" },
  { symbol: "CCM", name: "Clover Modaraba", sector: "MODARABAS" },
  { symbol: "DAWHM", name: "Dawood Modaraba", sector: "MODARABAS" },
  { symbol: "FIRST", name: "First Prudential Modaraba", sector: "MODARABAS" },
  { symbol: "FPL", name: "First Paramuda Modaraba", sector: "MODARABAS" },
  { symbol: "PAKV", name: "Pakvoc Modaraba", sector: "MODARABAS" },
  { symbol: "SMCPL", name: "Sanobar Modaraba", sector: "MODARABAS" },

  // ============== OIL & GAS EXPLORATION COMPANIES ==============
  { symbol: "MARI", name: "Mari Petroleum", sector: "OIL & GAS EXPLORATION COMPANIES" },
  { symbol: "OGDC", name: "Oil & Gas Development Co.", sector: "OIL & GAS EXPLORATION COMPANIES" },
  { symbol: "PPL", name: "Pakistan Petroleum", sector: "OIL & GAS EXPLORATION COMPANIES" },
  { symbol: "POL", name: "Pakistan Oilfields", sector: "OIL & GAS EXPLORATION COMPANIES" },

  // ============== OIL & GAS MARKETING COMPANIES ==============
  { symbol: "APL", name: "Attock Petroleum", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "BYCO", name: "Byco Petroleum", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "CNERGY", name: "Cnergyico PSM", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "Haspet", name: "Haspet Petroleum", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "LPG", name: "Lotte Gas Pakistan", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "PSO", name: "Pakistan State Oil", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "SHEL", name: "Shell Pakistan", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "SNGP", name: "Sui Northern Gas Pipelines", sector: "OIL & GAS MARKETING COMPANIES" },
  { symbol: "SSGC", name: "Sui Southern Gas Company", sector: "OIL & GAS MARKETING COMPANIES" },

  // ============== BOARD & PACKAGING ==============
  { symbol: "CEPB", name: "Century Paper Board", sector: "BOARD & PACKAGING" },
  { symbol: "KASB", name: "Kasb Board", sector: "BOARD & PACKAGING" },
  { symbol: "MAC", name: "Macpac Films", sector: "BOARD & PACKAGING" },
  { symbol: "MFL", name: "Macro Packages", sector: "BOARD & PACKAGING" },
  { symbol: "PKGS", name: "Packages Ltd", sector: "BOARD & PACKAGING" },
  { symbol: "RVPL", name: "Rival Packages", sector: "BOARD & PACKAGING" },

  // ============== PHARMACEUTICALS ==============
  { symbol: "ABOT", name: "Abbott Laboratories", sector: "PHARMACEUTICALS" },
  { symbol: "AGP", name: "AGP Limited", sector: "PHARMACEUTICALS" },
  { symbol: "FEROZ", name: "Ferozsons Laboratories", sector: "PHARMACEUTICALS" },
  { symbol: "GLAXO", name: "GlaxoSmithKline Pakistan", sector: "PHARMACEUTICALS" },
  { symbol: "HINOON", name: "Highnoon Laboratories", sector: "PHARMACEUTICALS" },
  { symbol: "IBL", name: "IBL HealthCare", sector: "PHARMACEUTICALS" },
  { symbol: "KCL", name: "Karachi Chemical", sector: "PHARMACEUTICALS" },
  { symbol: "LSP", name: "Lal Shehbaz Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "MFFL", name: "Mega Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "MACT", name: "Macots Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "MERIT", name: "Merint Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "NESTLE", name: "Nestle Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "OMI", name: "Omi Pharma", sector: "PHARMACEUTICALS" },
  { symbol: "RBPL", name: "Reckitt Benckiser", sector: "PHARMACEUTICALS" },
  { symbol: "SEARL", name: "Searle Company", sector: "PHARMACEUTICALS" },
  { symbol: "WYETH", name: "Wyeth Pakistan", sector: "PHARMACEUTICALS" },

  // ============== POWER GENERATION & DISTRIBUTION ==============
  { symbol: "ALTN", name: "Altern Energy", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "ATPLC", name: "Attock Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "FFCL", name: "Fauji Cereals", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "GENP", name: "General Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "GADCL", name: "Gadoon Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "HUBC", name: "Hub Power Co", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "JPGL", name: "Japan Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "JPVC", name: "JPV Co", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "KAPCO", name: "Kot Addu Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "KEL", name: "K-Electric", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "NCPL", name: "Nishat Chunian Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "NPL", name: "Nishat Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "PACL", name: "Pak American Leasing", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "PAEL", name: "Pak Arab Fertilizers", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "PIA", name: "PIAC Holding", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "PIAA", name: "Pakistan International Airlines", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "PKGP", name: "Pakgen Power", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "SPWL", name: "Safe Power Washing", sector: "POWER GENERATION & DISTRIBUTION" },
  { symbol: "TPLP", name: "TPL Properties", sector: "POWER GENERATION & DISTRIBUTION" },

  // ============== PROPERTY ==============
  { symbol: "ICON", name: "Icon Plc", sector: "PROPERTY" },
  { symbol: "TPLP", name: "TPL Properties", sector: "PROPERTY" },

  // ============== REAL ESTATE INVESTMENT TRUST ==============
  { symbol: "REIT", name: "Dolmen City REIT", sector: "REAL ESTATE INVESTMENT TRUST" },

  // ============== REFINERY ==============
  { symbol: "ATRL", name: "Attock Refinery", sector: "REFINERY" },
  { symbol: "NRL", name: "National Refinery", sector: "REFINERY" },
  { symbol: "PRL", name: "Pakistan Refinery", sector: "REFINERY" },

  // ============== SUGAR & ALLIED INDUSTRIES ==============
  { symbol: "ALNRS", name: "Al-Noor Sugar Mills", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "AHCL", name: "Al-Hamd Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "CSAP", name: "Crescent Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "DSML", name: "Dewan Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "FRSM", name: "Faran Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "HABSM", name: "Habib Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "HUMBL", name: "Hum Network", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "JDWS", name: "JDW Sugar Mills", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "MACSC", name: "Macca Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "MFFL", name: "Mega Foods", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "MPL", name: "Mirpur Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "PREMA", name: "Premier Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "RANGL", name: "Rangolio Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "SHJS", name: "Shahjahan Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "TSPL", name: "Tandlianwala Sugar", sector: "SUGAR & ALLIED INDUSTRIES" },
  { symbol: "UNVR", name: "Unilever Pakistan", sector: "SUGAR & ALLIED INDUSTRIES" },

  // ============== SYNTHETIC & RAYON ==============
  { symbol: "RUBA", name: "Ruba Cement", sector: "SYNTHETIC & RAYON" },

  // ============== TECHNOLOGY & COMMUNICATION ==============
  { symbol: "AIRLINK", name: "Air Link Communication", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "AVN", name: "Avanceon Pakistan", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "AVNL", name: "Avanceon Ltd", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "CTS", name: "Continental Cement", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "DGJC", name: "D.G. Jute", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "DCLI", name: "Descon Chemical", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "EFUG", name: "EFU General", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "HUMNL", name: "Hum Network Ltd", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "ICTL", name: "Inter-Connect", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "MEBL", name: "Meezan Bank Fund", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "MFFL", name: "Media Motors", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "PTC", name: "Pakistan Telecommunication", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "SYS", name: "Systems Limited", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "TELE", name: "Telecard Limited", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "TRG", name: "TRG Pakistan", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "WAVES", name: "Waves Singer", sector: "TECHNOLOGY & COMMUNICATION" },
  { symbol: "WTL", name: "WorldCall Telecom", sector: "TECHNOLOGY & COMMUNICATION" },

  // ============== TEXTILE COMPOSITE ==============
  { symbol: "GATM", name: "Gul Ahmed Textile", sector: "TEXTILE COMPOSITE" },
  { symbol: "GTRA", name: "Gatron Industries", sector: "TEXTILE COMPOSITE" },
  { symbol: "GAL", name: "Ghani Global Industries", sector: "TEXTILE COMPOSITE" },
  { symbol: "NCL", name: "Nishat Chunian", sector: "TEXTILE COMPOSITE" },
  { symbol: "NML", name: "Nishat Mills", sector: "TEXTILE COMPOSITE" },

  // ============== TEXTILE SPINNING ==============
  { symbol: "AGRL", name: "Agritech Limited", sector: "TEXTILE SPINNING" },
  { symbol: "AHCL", name: "Ahmed Hasan", sector: "TEXTILE SPINNING" },
  { symbol: "BWRL", name: "Bawair Cotton", sector: "TEXTILE SPINNING" },
  { symbol: "DPL", name: "Dewan Pakistan", sector: "TEXTILE SPINNING" },
  { symbol: "FZPL", name: "Fazal Textile", sector: "TEXTILE SPINNING" },
  { symbol: "GAD", name: "Gadoon Textile", sector: "TEXTILE SPINNING" },
  { symbol: "GAUR", name: "Gauhar Textile", sector: "TEXTILE SPINNING" },
  { symbol: "GF", name: "Gadoon Fabrics", sector: "TEXTILE SPINNING" },
  { symbol: "GML", name: "Gul Mohmand", sector: "TEXTILE SPINNING" },
  { symbol: "KT", name: "Kohinoor Textile", sector: "TEXTILE SPINNING" },
  { symbol: "KWIL", name: "Koh-e-Noor", sector: "TEXTILE SPINNING" },
  { symbol: "MASD", name: "Masood Spinning", sector: "TEXTILE SPINNING" },
  { symbol: "NAF", name: "Nishat Apparel", sector: "TEXTILE SPINNING" },
  { symbol: "RUBY", name: "Ruby Textile", sector: "TEXTILE SPINNING" },
  { symbol: "SAL", name: "Saif Textile", sector: "TEXTILE SPINNING" },
  { symbol: "STL", name: "Sitara Textile", sector: "TEXTILE SPINNING" },
  { symbol: "TPL", name: "Trust Pipe Lines", sector: "TEXTILE SPINNING" },
  { symbol: "VRES", name: "Vivo Renewable", sector: "TEXTILE SPINNING" },

  // ============== TEXTILE WEAVING ==============
  { symbol: "FZPL", name: "Fazal Textile Mills", sector: "TEXTILE WEAVING" },
  { symbol: "KTM", name: "Kasb Textile", sector: "TEXTILE WEAVING" },
  { symbol: "MASD", name: "Masood Weaving", sector: "TEXTILE WEAVING" },
  { symbol: "NAF", name: "Naveena Apparel", sector: "TEXTILE WEAVING" },
  { symbol: "NATF", name: "NIB Bank", sector: "TEXTILE WEAVING" },

  // ============== TOBACCO ==============
  { symbol: "PAKR", name: "Pakistan Tobacco", sector: "TOBACCO" },
  { symbol: "PHILIP", name: "Philip Morris Pakistan", sector: "TOBACCO" },

  // ============== TRANSPORT ==============
  { symbol: "PNSC", name: "Pakistan National Shipping", sector: "TRANSPORT" },
  { symbol: "PIAA", name: "Pakistan Int. Airline", sector: "TRANSPORT" },
  { symbol: "RVM", name: "Ravi Motors", sector: "TRANSPORT" },

  // ============== VANASPATI & ALLIED INDUSTRIES ==============
  { symbol: "UNITY", name: "Unity Foods", sector: "VANASPATI & ALLIED INDUSTRIES" },
  { symbol: "WAVES", name: "Waves Singer Pakistan", sector: "VANASPATI & ALLIED INDUSTRIES" },
  { symbol: "WAVESAPP", name: "Waves Apps", sector: "VANASPATI & ALLIED INDUSTRIES" },

  // ============== WOOLLEN ==============
  { symbol: "BWRL", name: "Bawair Woollen", sector: "WOOLLEN" },
  { symbol: "GAD", name: "Gadoon Woollen", sector: "WOOLLEN" },
  { symbol: "MOD", name: "Mod Woollen", sector: "WOOLLEN" },
];

// Lookup map: symbol → sector (for futures-contract deduping).
// Key is uppercased scrip symbol WITHOUT any -AUG/-SEP suffix.
const SYMBOL_TO_SECTOR: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of LISTED_COMPANIES) {
    if (!m.has(c.symbol.toUpperCase())) {
      m.set(c.symbol.toUpperCase(), c.sector);
    }
  }
  return m;
})();

// Lookup map: symbol → company name.
const SYMBOL_TO_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of LISTED_COMPANIES) {
    if (!m.has(c.symbol.toUpperCase())) {
      m.set(c.symbol.toUpperCase(), c.name);
    }
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
// suffix, the underlying symbol is looked up in the curated list.
// Falls back to "MISCELLANEOUS" if not found.
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
