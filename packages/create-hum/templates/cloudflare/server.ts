import { Hono } from "hono";

const app = new Hono();

configure(app);

export default app;

/**
 * Middleware and API routes. Hum mounts its file based routes onto this app and
 * answers the paths they do not match with its `_404` page, so this stays a
 * plain Hono app: page errors use `_error`, API errors use `onError`.
 *
 * The build's public/ directory is not served here. `wrangler.jsonc` publishes
 * it through the Worker's asset binding, which answers those requests before
 * the Worker is asked, and it also means nothing in this file needs the Node
 * APIs an asset binding replaces.
 */
function configure(app: Hono) {
  app.use("*", async (c, next) => {
    c.header("x-powered-by", "Hum + Hono");
    await next();
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));
}
