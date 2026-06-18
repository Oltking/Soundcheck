// Apply db/schema.sql to the hosted Postgres in DATABASE_URL.
// Run from frontend/:  node scripts/migrate.mjs
// Reads .env.local itself so it needs no extra tooling.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// minimal .env.local loader (KEY=VALUE; ignores comments/blank lines)
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith("#")) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  }
}

const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL is not set (add it to frontend/.env.local).");
  process.exit(1);
}
const isLocal = conn.includes("localhost") || conn.includes("127.0.0.1");
const sql = readFileSync(join(root, "db", "schema.sql"), "utf8");

const pool = new pg.Pool({
  connectionString: conn,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  console.log("✓ schema applied to the database.");
} catch (e) {
  console.error("✗ migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
