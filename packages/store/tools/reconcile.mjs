// Run after building; this uses the same durable database and verified payment service.
const { getStore } = await import("../dist/services/store.js");
const store = await getStore();
const pending = store.repo.db
  .prepare("SELECT id FROM store_orders WHERE status = 'checkout_created'")
  .all();
let failed = 0;
for (const { id } of pending) {
  try {
    await store.checkout.reconcile(id);
    console.log(`Checked order ${id}`);
  } catch {
    failed++;
    console.error(`Could not reconcile order ${id}`);
  }
}
const events = store.repo.db
  .prepare(
    "SELECT payload FROM store_webhook_events WHERE status = 'failed' ORDER BY created_at",
  )
  .all();
for (const { payload } of events) {
  const event = JSON.parse(payload);
  try {
    store.checkout.processEvent(event);
    console.log(`Reprocessed event ${event.id}`);
  } catch {
    failed++;
    console.error(`Could not reprocess event ${event.id}`);
  }
}
store.repo.db.close();
process.exitCode = failed ? 1 : 0;
