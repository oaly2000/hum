import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { getStore } from "./services/store.js";
import { createStoreApi } from "./services/http.js";

const app = new Hono();
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  await next();
});
app.route("/", createStoreApi(await getStore()));
const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), "public");
if (existsSync(publicRoot)) app.use("*", serveStatic({ root: publicRoot }));
await mountHum(app, config);
export default app;
