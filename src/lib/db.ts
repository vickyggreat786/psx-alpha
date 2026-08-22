import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined
}

// Lazy initialization with error handling
// On Vercel (serverless), SQLite DB might not be available.
// The app should still work without DB (in-memory caching covers most cases).
function createDb(): PrismaClient | null {
  try {
    const client = new PrismaClient({
      log: ['error', 'warn'],
    })
    return client
  } catch (e) {
    console.warn('[db] Prisma initialization failed, running without database:', e instanceof Error ? e.message : 'unknown')
    return null
  }
}

export const db = globalForPrisma.prisma ?? createDb()
if (!globalForPrisma.prisma) globalForPrisma.prisma = db
