import { resolve } from "node:path";
import { openDatabase, StoreRepository } from "./database.js";
import { createAuth } from "./auth.js";
import { createPayments } from "./payment.js";
import { CheckoutService } from "./checkout.js";
import { products } from "./catalog.js";

async function createStore() {
  const origin = new URL(process.env.STORE_ORIGIN ?? "http://localhost:3001")
    .origin;
  const database = openDatabase(
    process.env.STORE_DATABASE ?? ".data/store.sqlite",
  );
  const repo = new StoreRepository(database);
  const auth = await createAuth(
    database,
    origin,
    process.env.BETTER_AUTH_SECRET ?? "",
  );
  const payments = createPayments(
    process.env.CREEM_API_KEY ?? "",
    process.env.CREEM_WEBHOOK_SECRET ?? "",
  );
  const checkout = new CheckoutService(
    repo,
    payments,
    origin,
    Object.fromEntries(
      products.map((product) => [
        product.slug,
        process.env[product.productEnv],
      ]),
    ),
  );
  return { origin, repo, auth, payments, checkout };
}

export type Store = Awaited<ReturnType<typeof createStore>>;
// Vite can load route modules and the mounting entry in different module runners.
const storesKey = Symbol.for("hum.store.services");
const globalStores = globalThis as typeof globalThis & {
  [storesKey]?: Map<string, Promise<Store>>;
};
export function getStore() {
  const stores = (globalStores[storesKey] ??= new Map());
  const key = resolve(process.env.STORE_DATABASE ?? ".data/store.sqlite");
  let store = stores.get(key);
  if (!store) {
    store = createStore();
    stores.set(key, store);
    store.catch(() => stores.delete(key));
  }
  return store;
}
