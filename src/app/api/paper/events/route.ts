import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/base-url";
import { cleanSymbol } from "@/lib/symbol-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// POST /api/paper/events — checks every open paper position against the
// current market price. If the current price has hit the target → close
// position with profit. If it has hit the stop loss → close position with
// loss. Logs each event to the AlertLog table so it shows up in the Alerts
// Log section.
export async function POST() {
  try {
    // 1. Load all open positions
    let openPositions: Array<{
      id: string; symbol: string; qty: number; entryPrice: number;
      stopLoss: number; target: number; confidence: number; reason: string;
    }> = [];
    try {
      openPositions = await db.paperPosition.findMany({
        where: { status: "open" },
      });
    } catch (e) {
      return NextResponse.json({
        ok: true,
        data: { checked: 0, triggered: [], note: "Database not available" },
      });
    }

    if (openPositions.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { checked: 0, triggered: [], note: "No open positions to check" },
      });
    }

    // 2. Fetch current prices
    const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: Array<{ symbol: string; price: number; changePct: number }>;
      };
      error?: string;
    };
    if (!quoteJson.ok || !quoteJson.data) {
      return NextResponse.json({
        ok: true,
        data: { checked: openPositions.length, triggered: [], note: quoteJson.error ?? "Quote unavailable" },
      });
    }

    const priceMap = new Map<string, number>();
    for (const s of quoteJson.data.scrips) {
      priceMap.set(cleanSymbol(s.symbol).toUpperCase(), s.price);
    }

    // 3. Check each position for target/stop hit
    const triggered: Array<{ id: string; symbol: string; side: "target" | "stop"; price: number; pnl: number }> = [];
    for (const pos of openPositions) {
      const sym = cleanSymbol(pos.symbol).toUpperCase();
      const current = priceMap.get(sym);
      if (!current || current <= 0) continue;

      let side: "target" | "stop" | null = null;
      if (current >= pos.target) side = "target";
      else if (current <= pos.stopLoss) side = "stop";

      if (!side) continue;

      const pnl = (side === "target" ? (current - pos.entryPrice) : (current - pos.entryPrice)) * pos.qty;
      const exitPrice = current;

      try {
        await db.paperPosition.update({
          where: { id: pos.id },
          data: {
            status: side === "target" ? "target_hit" : "stop_hit",
            exitPrice,
            closedAt: new Date(),
            pnl,
          },
        });

        const emoji = side === "target" ? "🎯" : "🛑";
        const result = pnl >= 0 ? "PROFIT" : "LOSS";
        const pct = pos.entryPrice > 0 ? ((pnl / (pos.entryPrice * pos.qty)) * 100).toFixed(2) : "0";

        await db.alertLog.create({
          data: {
            kind: side === "target" ? "target_hit" : "stop_hit",
            symbol: pos.symbol,
            title: `${emoji} ${result}: ${pos.symbol} — ${side === "target" ? "target hit" : "stop-loss hit"}`,
            body: `Entry ${pos.entryPrice.toFixed(2)} · Exit ${exitPrice.toFixed(2)} · ${pos.qty} shares\nP&L: Rs ${pnl.toFixed(0)} (${pct}%) · Reason: ${pos.reason.slice(0, 100)}`,
            channels: "log",
          },
        });

        triggered.push({ id: pos.id, symbol: pos.symbol, side, price: exitPrice, pnl });
      } catch (e) {
        console.error("[paper/events] update error:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        checked: openPositions.length,
        triggered,
        note: triggered.length > 0
          ? `${triggered.length} position(s) closed`
          : "No targets/stops hit",
      },
    });
  } catch (err) {
    console.error("[POST /api/paper/events] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
