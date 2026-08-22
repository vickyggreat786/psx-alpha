import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendAlert } from "@/lib/notifications";
import { formatExitMessage } from "@/lib/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/paper/events
// Checks all open positions. If price has hit stop-loss or target, closes the
// position and fires notifications. Returns the events that fired.
export async function POST() {
  const events: Array<{
    kind: "target_hit" | "stop_hit";
    symbol: string;
    entry: number;
    exit: number;
    qty: number;
    pnl: number;
    channels: { telegram: boolean; webpush: boolean };
  }> = [];

  try {
    const positions = await db.paperPosition.findMany({
      where: { status: "open" },
    });
    if (positions.length === 0) {
      return NextResponse.json({ ok: true, events: [] });
    }

    // Fetch current prices
    const quoteRes = await fetch("http://localhost:3000/api/psx/quote", {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: { symbol: string; price: number }[];
        indices: { symbol: string; value: number }[];
      };
    };
    if (!quoteJson.ok || !quoteJson.data) {
      return NextResponse.json(
        { ok: false, error: "Quote unavailable for event check" },
        { status: 500 }
      );
    }

    const findPrice = (sym: string): number | null => {
      if (sym === "KSE100") {
        return (
          quoteJson.data!.indices.find((i) => i.symbol === "KSE100")?.value ??
          null
        );
      }
      return (
        quoteJson.data!.scrips.find((s) => s.symbol === sym)?.price ?? null
      );
    };

    for (const p of positions) {
      const price = findPrice(p.symbol);
      if (price === null) continue;

      let exitReason: "target_hit" | "stop_hit" | null = null;
      let exitPrice = 0;

      if (price <= p.stopLoss) {
        exitReason = "stop_hit";
        exitPrice = p.stopLoss;
      } else if (price >= p.target) {
        exitReason = "target_hit";
        exitPrice = p.target;
      }

      if (!exitReason) continue;

      const pnl = (exitPrice - p.entryPrice) * p.qty;
      const side = exitReason === "target_hit" ? "target" : "stop";

      // Close position in DB
      await db.paperPosition.update({
        where: { id: p.id },
        data: {
          status: "closed",
          exitPrice,
          closedAt: new Date(),
          pnl,
        },
      });
      await db.paperTrade.create({
        data: {
          symbol: p.symbol,
          side: "sell",
          qty: p.qty,
          price: exitPrice,
          reason: `Auto ${side} hit`,
          pnl,
        },
      });

      // Fire notifications
      const msg = formatExitMessage(
        p.symbol,
        side,
        p.entryPrice,
        exitPrice,
        p.qty,
        pnl
      );
      const channels = await sendAlert(exitReason, `${exitReason}: ${p.symbol}`, msg, p.symbol);

      events.push({
        kind: exitReason,
        symbol: p.symbol,
        entry: p.entryPrice,
        exit: exitPrice,
        qty: p.qty,
        pnl,
        channels,
      });
    }

    return NextResponse.json({ ok: true, events });
  } catch (err) {
    console.error("[POST /api/paper/events] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
