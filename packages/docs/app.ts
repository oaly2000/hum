import { createPageService, mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/** Public files are always next to the server entry, including after deployment. */
const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "public");

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

// Dev serves the project's `public/` directory through Vite, so this resolves
// to the project root there and to the output directory in a production build.
// The whole public tree is served —
// Hum's client assets under `/_hum` and the project's own files beside them —
// while the server modules stay outside it and unreachable.
if (existsSync(publicRoot)) {
  app.use("*", serveStatic({ root: publicRoot }));
}

app.get("/api/health", (c) => c.json({ status: "ok" }));

const pages = createPageService();
await mountHum(app, { ...config, pages });

export default app;
