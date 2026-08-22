// Database client — DYNAMIC require to avoid build failures on Vercel
// If Prisma client isn't generated, db = null and app works without DB

let _db: any = null;
let _dbChecked = false;

function getDb(): any {
  if (_dbChecked) return _db;
  _dbChecked = true;
  try {
    const { PrismaClient } = require('@prisma/client');
    _db = new PrismaClient({ log: ['error', 'warn'] });
    console.log('[db] Prisma client initialized');
  } catch (e) {
    console.warn('[db] Prisma not available, running without database:', e instanceof Error ? e.message : 'unknown');
    _db = null;
  }
  return _db;
}

// Export a proxy that lazily initializes on first access
export const db = new Proxy({} as any, {
  get(_, prop) {
    const d = getDb();
    if (d === null) {
      // Return a no-op function for any method call
      return () => Promise.resolve(null);
    }
    return d[prop];
  }
});
