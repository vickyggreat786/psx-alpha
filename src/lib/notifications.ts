// Notification sender — multi-channel: Telegram + Web Push
// Telegram is the primary channel (instant like WhatsApp, no app install needed)
// Web Push is secondary (works on Chrome Android like WhatsApp notifications)

import * as fs from "fs";
import * as path from "path";
import webpush from "web-push";
import { db } from "./db";

// ---------- VAPID key management ----------
const VAPID_FILE = path.join(process.cwd(), ".vapid.json");

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function loadVapidKeys(): VapidKeys {
  // Try loading from disk first
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const keys = JSON.parse(fs.readFileSync(VAPID_FILE, "utf-8"));
      if (keys.publicKey && keys.privateKey) return keys;
    }
  } catch {
    // fall through
  }

  // Generate new keys
  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys));
  } catch (e) {
    console.error("Could not persist VAPID keys:", e);
  }
  return keys as VapidKeys;
}

let _vapid: VapidKeys | null = null;
export function getVapidPublicKey(): string {
  if (!_vapid) _vapid = loadVapidKeys();
  return _vapid.publicKey;
}

function getVapidDetails() {
  if (!_vapid) _vapid = loadVapidKeys();
  return {
    subject: "mailto:psx-alpha@local",
    publicKey: _vapid.publicKey,
    privateKey: _vapid.privateKey,
  };
}

// ---------- Telegram ----------
async function getTelegramConfig(): Promise<{
  botToken: string;
  chatId: string;
} | null> {
  try {
    const tokenSetting = await db.setting.findUnique({
      where: { key: "telegram_bot_token" },
    });
    const chatSetting = await db.setting.findUnique({
      where: { key: "telegram_chat_id" },
    });
    if (tokenSetting?.value && chatSetting?.value) {
      return { botToken: tokenSetting.value, chatId: chatSetting.value };
    }
  } catch (e) {
    console.error("Telegram config error:", e);
  }
  return null;
}

async function sendTelegram(message: string): Promise<boolean> {
  const cfg = await getTelegramConfig();
  if (!cfg) return false;
  try {
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("Telegram send error:", e);
    return false;
  }
}

// ---------- Web Push ----------
async function sendWebPush(message: string): Promise<boolean> {
  try {
    const subs = await db.notificationSub.findMany();
    if (subs.length === 0) return false;
    const vapid = getVapidDetails();
    const payload = JSON.stringify({
      title: "PSX Alpha Alert",
      body: message,
      icon: "/icon.png",
      badge: "/icon.png",
    });
    let sentCount = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.keysP256dh, auth: s.keysAuth },
          },
          payload,
          { vapidDetails: vapid }
        );
        sentCount++;
      } catch (e) {
        // Subscription may have expired — log and continue
        console.error("Push failed for", s.endpoint, e);
        if (
          e instanceof Error &&
          (e.message.includes("410") || e.message.includes("404"))
        ) {
          // Subscription expired — delete it
          await db.notificationSub.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    }
    return sentCount > 0;
  } catch (e) {
    console.error("Web push error:", e);
    return false;
  }
}

// ---------- Public API ----------
export async function sendAlert(
  kind: "target_hit" | "stop_hit" | "new_signal" | "test",
  title: string,
  body: string,
  symbol?: string
): Promise<{ telegram: boolean; webpush: boolean }> {
  const [tg, wp] = await Promise.all([
    sendTelegram(body),
    sendWebPush(body),
  ]);

  // Log the alert
  try {
    const channels = [
      tg ? "telegram" : null,
      wp ? "webpush" : null,
    ].filter(Boolean) as string[];
    await db.alertLog.create({
      data: {
        kind,
        symbol: symbol ?? null,
        title,
        body,
        channels: channels.join(",") || "none",
      },
    });
  } catch (e) {
    console.error("Alert log error:", e);
  }

  return { telegram: tg, webpush: wp };
}
