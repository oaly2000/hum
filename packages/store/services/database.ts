import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type OrderStatus =
  "pending" | "checkout_created" | "paid" | "refunded" | "disputed" | "expired";
export interface Order {
  id: string;
  user_id: string;
  product_slug: string;
  product_id: string;
  units: number;
  amount: number;
  currency: string;
  status: OrderStatus;
  checkout_id: string | null;
  checkout_url: string | null;
  provider_order_id: string | null;
  customer_id: string | null;
  created_at: number;
  updated_at: number;
}

export function openDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS store_orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_slug TEXT NOT NULL,
      product_id TEXT NOT NULL, units INTEGER NOT NULL, amount INTEGER NOT NULL,
      currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      checkout_id TEXT UNIQUE, checkout_url TEXT, provider_order_id TEXT UNIQUE, customer_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_user ON store_orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS store_entitlements (
      order_id TEXT PRIMARY KEY REFERENCES store_orders(id), user_id TEXT NOT NULL,
      product_slug TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS entitlements_user ON store_entitlements(user_id, product_slug, active);
    CREATE TABLE IF NOT EXISTS store_webhook_events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL,
      payload TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_customers (
      user_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL UNIQUE
    );
  `);
  return db;
}

export class StoreRepository {
  constructor(readonly db: DatabaseSync) {}
  order(id: string) {
    return this.db
      .prepare("SELECT * FROM store_orders WHERE id = ?")
      .get(id) as unknown as Order | undefined;
  }
  orders(userId: string) {
    return this.db
      .prepare(
        "SELECT * FROM store_orders WHERE user_id = ? ORDER BY created_at DESC",
      )
      .all(userId) as unknown as Order[];
  }
  canDownload(userId: string, slug: string) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM store_entitlements WHERE user_id = ? AND product_slug = ? AND active = 1",
      )
      .get(userId, slug);
  }
  customer(userId: string) {
    const row = this.db
      .prepare("SELECT customer_id FROM store_customers WHERE user_id = ?")
      .get(userId);
    return row?.customer_id as string | undefined;
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
