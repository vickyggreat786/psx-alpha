import { db } from "../src/lib/db.ts";

try {
  const result = await db.candleHistory.deleteMany({});
  console.log("Deleted all CandleHistory rows:", result.count);
} catch (e) {
  console.error("Error:", e);
}
await db.$disconnect();
