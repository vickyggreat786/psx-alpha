import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST — save Telegram bot token + chat ID
// Body: { botToken, chatId }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const botToken: string = (body.botToken ?? "").trim();
    const chatId: string = (body.chatId ?? "").trim();
    if (!botToken || !chatId) {
      return NextResponse.json(
        { ok: false, error: "botToken and chatId required" },
        { status: 400 }
      );
    }

    // Test by calling Telegram getMe
    const meRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    );
    if (!meRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Invalid bot token" },
        { status: 400 }
      );
    }
    const me = (await meRes.json()) as {
      ok: boolean;
      result?: { username: string };
    };

    // Test sending a message to chatId
    const testRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ PSX Alpha Telegram alerts activated!\n\nYou'll now receive:\n• 🟢 BUY signals (high confidence)\n• 🎯 Target hit alerts\n• 🛑 Stop loss alerts\n• 📊 Daily portfolio summary",
        }),
      }
    );
    if (!testRes.ok) {
      const err = await testRes.json();
      return NextResponse.json(
        {
          ok: false,
          error: `Could not send to chat ${chatId}: ${err.description ?? "Invalid chat ID"}`,
        },
        { status: 400 }
      );
    }

    // Save settings
    await db.setting.upsert({
      where: { key: "telegram_bot_token" },
      update: { value: botToken },
      create: { key: "telegram_bot_token", value: botToken },
    });
    await db.setting.upsert({
      where: { key: "telegram_chat_id" },
      update: { value: chatId },
      create: { key: "telegram_chat_id", value: chatId },
    });

    return NextResponse.json({
      ok: true,
      botUsername: me.result?.username,
      message: "Telegram alerts activated",
    });
  } catch (err) {
    console.error("[POST /api/notifications/telegram] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

// GET — check if Telegram is configured
export async function GET() {
  try {
    const token = await db.setting.findUnique({
      where: { key: "telegram_bot_token" },
    });
    const chat = await db.setting.findUnique({
      where: { key: "telegram_chat_id" },
    });
    return NextResponse.json({
      ok: true,
      configured: !!(token?.value && chat?.value),
      botUsername: token?.value ? "configured" : null,
    });
  } catch (e) {
    return NextResponse.json({ ok: true, configured: false });
  }
}
