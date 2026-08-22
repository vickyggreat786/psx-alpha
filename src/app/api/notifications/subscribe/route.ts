import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// GET — returns VAPID public key for client subscription
export async function GET() {
  return NextResponse.json({ ok: true, publicKey: getVapidPublicKey() });
}

// POST — save a new push subscription
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpoint: string = body.endpoint;
    const keys = body.keys;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { ok: false, error: "Invalid subscription" },
        { status: 400 }
      );
    }
    // Upsert by endpoint
    const existing = await db.notificationSub.findUnique({
      where: { endpoint },
    });
    if (existing) {
      return NextResponse.json({ ok: true, existed: true });
    }
    await db.notificationSub.create({
      data: {
        endpoint,
        keysP256dh: keys.p256dh,
        keysAuth: keys.auth,
      },
    });
    return NextResponse.json({ ok: true, created: true });
  } catch (err) {
    console.error("[POST /api/notifications/subscribe] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
