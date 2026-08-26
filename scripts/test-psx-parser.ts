// Test PSX parser by running it directly via bun
// Usage: bun run scripts/test-psx-parser.ts

import * as fs from "fs";
import { parsePsxHtml } from "../src/lib/psx-parser";

const raw = fs.readFileSync("/tmp/psx_page.json", "utf-8");
const json = JSON.parse(raw);
const html = json?.data?.html || "";
const result = parsePsxHtml(html);

console.log("=== INDICES ===");
console.log(JSON.stringify(result.indices.slice(0, 5), null, 2));
console.log(`Total indices: ${result.indices.length}`);
console.log("\n=== SCRIPS ===");
console.log(`Total scrips: ${result.scrips.length}`);
console.log("\nFirst 5 scrips:");
console.log(JSON.stringify(result.scrips.slice(0, 5), null, 2));
console.log("\n=== SECTORS ===");
const sectors = [...new Set(result.scrips.map((s) => s.sector))];
console.log(sectors);
console.log("\n=== TOP GAINERS ===");
const gainers = [...result.scrips].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
console.log(JSON.stringify(gainers.map((g) => ({ s: g.symbol, c: g.current, chg: g.changePct.toFixed(2) + "%" })), null, 2));
console.log("\n=== TOP LOSERS ===");
const losers = [...result.scrips].sort((a, b) => a.changePct - b.changePct).slice(0, 5);
console.log(JSON.stringify(losers.map((g) => ({ s: g.symbol, c: g.current, chg: g.changePct.toFixed(2) + "%" })), null, 2));
