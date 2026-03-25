import "./config";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import pg from "pg";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";

const { Pool } = pg;

let db: any;
let pool: any;

console.log("DATABASE_URL:", process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use SQLite for local development, PostgreSQL for production
if (process.env.DATABASE_URL.startsWith('sqlite:')) {
  const sqlite = new Database(process.env.DATABASE_URL.replace('sqlite:', ''));
  db = drizzleSqlite(sqlite, { schema });
  pool = sqlite;
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { pool, db };
