import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/**
 * Directory the production build wrote into. It holds the server entry and a
 * `public/` tree; a reverse proxy or a CDN normally answers the requests for
 * the latter, and this keeps the built app runnable on its own. Point
 * `HUM_OUT_DIR` at the deployed directory when it was renamed or moved.
 */
const outDir = resolve(process.env.HUM_OUT_DIR ?? "./dist");

const publicRoot = resolve(outDir, "public");

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

// Dev serves the project's `public/` directory through Vite, so this only
// matters once the output directory exists. The whole public tree is served —
// Hum's client assets under `/_hum` and the project's own files beside them —
// while the server bundle itself stays outside it and unreachable.
if (existsSync(publicRoot)) {
  app.use("*", serveStatic({ root: publicRoot }));
}

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
