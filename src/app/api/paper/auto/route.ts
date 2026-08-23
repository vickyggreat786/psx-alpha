import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/base-url";
import { computePositionSize, type SafeSignal } from "@/lib/risk";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// POST /api/paper/auto — opens paper positions for the top safe signals.
// Idempotent: only opens positions for symbols the user doesn't already hold.
// Also logs each opened position to the AlertLog table so the user can see
// the activity in the Alerts Log section.
export async function POST() {
  try {
    // 1. Fetch top safe signals
    const safeRes = await fetch(`${getBaseUrl()}/api/psx/safe-signals`, {
      cache: "no-store",
    });
    const safeJson = (await safeRes.json()) as {
      ok: boolean;
      data?: {
        safe_signals: Array<{ signal: SafeSignal; position: { qty: number } }>;
      };
      error?: string;
    };
    if (!safeJson.ok || !safeJson.data) {
      return NextResponse.json({
        ok: true,
        data: { executed: 0, note: safeJson.error ?? "No safe signals available" },
      });
    }

    const candidates = safeJson.data.safe_signals.slice(0, 3); // max 3 new positions per call
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { executed: 0, note: "No safe BUY setups detected right now" },
      });
    }

    // 2. Fetch existing open positions so we don't double-up
    let existingSymbols = new Set<string>();
    try {
      const open = await db.paperPosition.findMany({
        where: { status: "open" },
        select: { symbol: true },
      });
      existingSymbols = new Set(open.map((p) => p.symbol.toUpperCase()));
    } catch (e) {
      // DB unavailable — exit gracefully
      return NextResponse.json({
        ok: true,
        data: { executed: 0, note: "Database not available" },
      });
    }

    // 3. Open positions for new symbols
    const opened: Array<{ symbol: string; qty: number; entry: number }> = [];
    for (const row of candidates) {
      const sym = row.signal.symbol.toUpperCase();
      if (existingSymbols.has(sym)) continue;

      try {
        const position = computePositionSize(row.signal);
        await db.paperPosition.create({
          data: {
            symbol: row.signal.symbol,
            qty: position.qty,
            entryPrice: row.signal.entry,
            stopLoss: row.signal.stopLoss,
            target: row.signal.target,
            status: "open",
            confidence: row.signal.confidence,
            reason: `Safe signal · R/R 1:${row.signal.riskReward.toFixed(1)} · ${row.signal.reasons.slice(0, 3).join(", ")}`,
          },
        });

        // Log to alert log
        await db.alertLog.create({
          data: {
            kind: "new_signal",
            symbol: row.signal.symbol,
            title: `🟢 BUY · ${row.signal.symbol} @ ${row.signal.entry.toFixed(2)}`,
            body: `Paper position opened · ${position.qty} shares · Rs ${position.positionValue.toFixed(0)}\nStop ${row.signal.stopLoss.toFixed(2)} · Target ${row.signal.target.toFixed(2)} · R/R 1:${row.signal.riskReward.toFixed(1)} · Confidence ${row.signal.confidence.toFixed(0)}%`,
            channels: "log",
          },
        });

        opened.push({
          symbol: row.signal.symbol,
          qty: position.qty,
          entry: row.signal.entry,
        });
        existingSymbols.add(sym);
      } catch (e) {
        console.error("[paper/auto] create position error:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        executed: opened.length,
        opened,
        note: opened.length > 0
          ? `Opened ${opened.length} new position(s)`
          : "All safe signals already have open positions",
      },
    });
  } catch (err) {
    console.error("[POST /api/paper/auto] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
