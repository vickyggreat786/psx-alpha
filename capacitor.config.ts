import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.psxalpha.app",
  appName: "PSX Alpha",
  webDir: "public",
  android: {
    allowMixedContent: true,
  },
  server: {
    // Point the WebView at the Vercel deployment — US servers = all AI providers work!
    url: "https://psx-alpha-sepia.vercel.app/",
    cleartext: true,
  },
};

export default config;
