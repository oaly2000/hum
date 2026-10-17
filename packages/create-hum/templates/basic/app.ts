import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();
configure(app);

await mountHum(app, config);

export default app;

function configure(app: Hono) {
  app.use("*", async (c, next) => {
    c.header("x-powered-by", "Hum + Hono");
    await next();
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  serveClientAssets(app);
}

/**
 * Answers the requests for the build's `public/` directory: Hum's client assets
 * under `/_hum`, plus whatever the project put in its own `public/` directory.
 * A reverse proxy or a CDN normally handles them; this keeps `npm start`
 * runnable on its own.
 */
function serveClientAssets(app: Hono) {
  const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "public");

  // Dev serves the project's public files through Vite, so this only matters
  // once the public directory exists. The server bundle lives next to
  // `public/` rather than inside it, so it can never be reached over HTTP.
  if (!existsSync(publicRoot)) return;

  app.use("*", serveStatic({ root: publicRoot }));
}
