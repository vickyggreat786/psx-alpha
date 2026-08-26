import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import { sendAlert } from "@/lib/notifications";
import { formatSignalMessage, type SafeSignal } from "@/lib/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PositionSize {
  qty: number;
  positionValue: number;
  riskAmount: number;
  rewardAmount: number;
  positionPct: number;
  riskPct: number;
}

export async function GET() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/psx/safe-signals`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      data?: {
        safe_signals: Array<{
          signal: SafeSignal;
          position: PositionSize;
        }>;
      };
      error?: string;
    };
    if (!json.ok || !json.data || json.data.safe_signals.length === 0) {
      return NextResponse.json({ ok: true, fired: 0 });
    }

    const top = json.data.safe_signals[0];
    const msg = formatSignalMessage(top.signal, top.position);
    const channels = await sendAlert(
      "new_signal",
      `NEW BUY SIGNAL: ${top.signal.symbol}`,
      msg,
      top.signal.symbol
    );

    return NextResponse.json({
      ok: true,
      fired: 1,
      symbol: top.signal.symbol,
      channels,
    });
  } catch (err) {
    console.error("[GET /api/psx/safe-signals-alert] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
