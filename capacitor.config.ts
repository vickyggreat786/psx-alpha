import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.psxalpha.app",
  appName: "PSX Alpha",
  webDir: "public",
  android: {
    allowMixedContent: true,
  },
  server: {
    // Point the WebView at the live preview URL — the app runs as a thin
    // wrapper around the actual Next.js server. This way the APK never needs
    // bundling/rebuilding when the web app updates.
    url: "https://preview-chat-4fa0a975-2273-4e37-b13a-0357cd44931a.space-z.ai/",
    cleartext: true,
  },
};

export default config;
