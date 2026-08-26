// Test investing.com historical data parser
import * as fs from "fs";
import { parseInvestingHtml_inline } from "../src/lib/psx-parser";

const raw = fs.readFileSync("/tmp/kse_inv.json", "utf-8");
const json = JSON.parse(raw);
const html = json?.data?.html || "";
