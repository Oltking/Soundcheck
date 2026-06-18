// The Postgres pool backing auth (users, accounts, sessions) and, in Phase 2,
// run ownership. A single pooled connection is reused across hot reloads in dev.
import { Pool } from "pg";

const conn = process.env.DATABASE_URL || "";
const isLocal = conn.includes("localhost") || conn.includes("127.0.0.1");

const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export const pool =
  globalForPg._pgPool ??
  new Pool({
    connectionString: conn,
    // hosted Postgres (Neon/Supabase/Vercel) requires SSL; local does not
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = pool;
