import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PgliteDatabase<typeof schema>;

type DbGlobal = {
  db?: Database;
  ready?: Promise<Database>;
  pool?: Pool;
  pglite?: PGlite;
};

const globalForDb = globalThis as unknown as { __subzeroDb?: DbGlobal };
const store: DbGlobal = (globalForDb.__subzeroDb ??= {});

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function initialise(): Promise<Database> {
  if (env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      ssl: env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    });
    const pgDb = drizzlePg(pool, { schema });
    await migratePg(pgDb, { migrationsFolder });
    await pool.query(fs.readFileSync(path.join(process.cwd(), "src/lib/db/rls.sql"), "utf8"));
    store.pool = pool;
    return pgDb as unknown as Database;
  }

  const dataDir = path.join(process.cwd(), ".data", "pg");
  const inMemory = process.env.VITEST === "true";
  if (!inMemory) fs.mkdirSync(dataDir, { recursive: true });
  const client = inMemory ? new PGlite() : new PGlite(dataDir);
  const pgliteDb = drizzlePglite(client, { schema });
  await migratePglite(pgliteDb, { migrationsFolder });
  await client.exec(fs.readFileSync(path.join(process.cwd(), "src/lib/db/rls.sql"), "utf8"));
  store.pglite = client;
  return pgliteDb as unknown as Database;
}

/** Lazily initialise the database. Safe to call from every request. */
export function getDb(): Promise<Database> {
  if (store.db) return Promise.resolve(store.db);
  if (!store.ready) {
    store.ready = initialise()
      .then((db) => {
        store.db = db;
        return db;
      })
      .catch((error) => {
        store.ready = undefined;
        throw error;
      });
  }
  return store.ready;
}

export function isEmbeddedDatabase(): boolean {
  return !env.DATABASE_URL;
}

export { schema };
