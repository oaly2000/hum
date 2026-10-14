import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
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
// while the server bundle itself stays outside it and unreachable.
if (existsSync(publicRoot)) {
  app.use("*", serveStatic({ root: publicRoot }));
}

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;

/**
 * The build's entry point: Hum calls it once its file routes are mounted, which
 * is what `pnpm start` runs. A deployment handed to a platform that calls
 * `fetch` itself omits it, and the build exports the app instead.
 */
export function start(app: Hono) {
  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOST ?? "0.0.0.0";

  serve(
    { fetch: app.fetch, port, hostname, overrideGlobalObjects: false },
    (info) => {
      console.log(`hum: listening on http://localhost:${info.port}`);
    },
  );
}
