import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();
configure(app);

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
 * Answers the client asset requests the production build wrote into
 * `<outDir>/client`. A reverse proxy or a CDN normally handles them; this keeps
 * `npm start` runnable on its own. Point `HUM_OUT_DIR` at the deployed
 * directory when it was renamed or moved.
 */
function serveClientAssets(app: Hono) {
  /**
   * URL prefix the client assets are published under, matching `assetsBase` in
   * the build manifest.
   */
  const assetsBase = "/_hum";
  const clientRoot = resolve(process.env.HUM_OUT_DIR ?? "./_hum", "client");

  // Dev serves the client assets through Vite, so this only matters once the
  // output directory exists. Only its client half is public: the server bundle
  // and the manifest must stay unreachable.
  if (!existsSync(clientRoot)) return;

  app.use(
    `${assetsBase}/client/*`,
    serveStatic({
      root: clientRoot,
      rewriteRequestPath: (path) => path.slice(`${assetsBase}/client`.length),
    }),
  );
}
