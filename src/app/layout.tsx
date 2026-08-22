import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "PSX Alpha — Real-Time Pakistan Stock Exchange Intelligence",
  description:
    "Real-time PSX quotes, candlestick chart reader, AI trade signals and IPO detection — every number straight from the exchange.",
  applicationName: "PSX Alpha",
  keywords: [
    "PSX",
    "Pakistan Stock Exchange",
    "KSE-100",
    "Stock Signals",
    "AI Analysis",
    "Candlestick",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e18" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch((e) => console.error('SW reg failed:', e));
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen text-slate-900 antialiased dark:text-slate-100">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
