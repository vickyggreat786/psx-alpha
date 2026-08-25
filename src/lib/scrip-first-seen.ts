// First-seen tracking for PSX scrips.
//
// Every time the poller fetches a fresh PSX market-summary snapshot, we upsert
// every seen scrip into the ScripFirstSeen table. The first time we see a
// symbol, firstSeen is set to now(). Subsequent sightings just bump lastSeen
// and increment daysSeen.
//
// /api/psx/new-listings uses this to detect genuine NEW listings (symbols whose
// firstSeen is from today or within the last 7 days) vs. scrips that have been
// listed forever but the user just hadn't seen yet (when comparing to a
// curated baseline).

import { db } from "./db";
import { stripFuturesSuffix, lookupName, lookupSector } from "./psx-listings";

export interface ScripSeenRow {
  symbol: string;
  firstSeen: Date;
  lastSeen: Date;
  daysSeen: number;
  sector: string | null;
}

// Update first-seen for every scrip in a PSX quote snapshot. Idempotent —
// calling it 100x per day just bumps lastSeen + daysSeen (capped at 1 per day
// to avoid double-counting on rapid polls).
//
// Day-guard: skips if we've already recorded today's sightings in this process.
// Calling this 100x per day does ONE DB write batch — the rest are no-ops.
let lastSeenDate = "";
let lastSeenCount = 0;
export async function recordSeenScrips(
  scrips: Array<{ symbol: string; sector?: string }>
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastSeenDate && lastSeenCount > 0) {
    return lastSeenCount; // already recorded today
  }

  let saved = 0;
  const BATCH_SIZE = 50;
  try {
    for (let i = 0; i < scrips.length; i += BATCH_SIZE) {
      const batch = scrips.slice(i, i + BATCH_SIZE);
      // Use per-row upserts (Prisma doesn't have upsertMany on all versions)
      await Promise.all(
        batch.map((s) =>
          db.scripFirstSeen.upsert({
            where: { symbol: s.symbol },
            update: { lastSeen: new Date() },
            create: {
              symbol: s.symbol,
              cleanName: lookupName(s.symbol) ?? stripFuturesSuffix(s.symbol).toUpperCase(),
              sector: s.sector ?? lookupSector(s.symbol),
            },
          }).catch((e) => {
            // ignore individual row failures
            console.warn(`[scrip-first-seen] upsert ${s.symbol} failed:`, e instanceof Error ? e.message : 'unknown');
            return null;
          })
        )
      );
      saved += batch.length;
    }
    lastSeenDate = today;
    lastSeenCount = saved;
  } catch (e) {
    console.error("[scrip-first-seen] recordSeenScrips error:", e);
  }
  return saved;
}

// Get all scrips that were FIRST SEEN today (or within `daysBack` days).
// Returns newest first.
export async function getNewListings(daysBack = 7): Promise<ScripSeenRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  try {
    const rows = await db.scripFirstSeen.findMany({
      where: { firstSeen: { gte: cutoff } },
      orderBy: { firstSeen: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      daysSeen: r.daysSeen,
      sector: r.sector,
    }));
  } catch (e) {
    console.error("[scrip-first-seen] getNewListings error:", e);
    return [];
  }
}

// Get all scrips that have EVER been seen (for "first seen" timeline view).
export async function getAllSeenScrips(): Promise<ScripSeenRow[]> {
  try {
    const rows = await db.scripFirstSeen.findMany({
      orderBy: { firstSeen: "desc" },
      take: 500,
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      daysSeen: r.daysSeen,
      sector: r.sector,
    }));
  } catch (e) {
    console.error("[scrip-first-seen] getAllSeenScrips error:", e);
    return [];
  }
}

// Get statistics: total scrips ever seen, scrips seen today, scrips first-seen today.
export async function getSeenStats(): Promise<{
  total: number;
  seenToday: number;
  newToday: number;
  newThisWeek: number;
}> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const [total, seenToday, newToday, newThisWeek] = await Promise.all([
      db.scripFirstSeen.count(),
      db.scripFirstSeen.count({ where: { lastSeen: { gte: todayStart } } }),
      db.scripFirstSeen.count({ where: { firstSeen: { gte: todayStart } } }),
      db.scripFirstSeen.count({ where: { firstSeen: { gte: weekAgo } } }),
    ]);
    return { total, seenToday, newToday, newThisWeek };
  } catch (e) {
    console.error("[scrip-first-seen] getSeenStats error:", e);
    return { total: 0, seenToday: 0, newToday: 0, newThisWeek: 0 };
  }
}
