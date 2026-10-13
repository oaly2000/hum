import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/**
 * URL prefix the client assets are published under, matching `assetsBase` in
 * the build.
 */
const assetsBase = "/_hum";

/**
 * Directory the production build wrote into. A reverse proxy or a CDN normally
 * answers these requests; this keeps the built app runnable on its own. Point
 * `HUM_OUT_DIR` at the deployed directory when it was renamed or moved.
 */
const clientRoot = resolve(process.env.HUM_OUT_DIR ?? "./_hum", "client");

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

// Dev serves the client assets through Vite, so this only matters once the
// output directory exists. Only its client half is public: the server bundle
// and the manifest must stay unreachable.
if (existsSync(clientRoot)) {
  app.use(
    `${assetsBase}/client/*`,
    serveStatic({
      root: clientRoot,
      rewriteRequestPath: (path) => path.slice(`${assetsBase}/client`.length),
    }),
  );
}

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
