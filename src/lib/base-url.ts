export function getBaseUrl(): string {
  // Check NEXT_PUBLIC_BASE_URL first (our custom alias URL)
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  // Vercel's VERCEL_URL (deployment-specific, might not be resolvable)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Local dev
  return "http://localhost:3000";
}
