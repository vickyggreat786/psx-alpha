// Dynamic base URL — works on Vercel + local dev
export function getBaseUrl(): string {
  // Vercel automatically sets VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Manual override (for Vercel env var)
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  // Local dev
  return "http://localhost:3000";
}
