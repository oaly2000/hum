import { createPageService, mountHum } from "@humjs/core";
import { Hono } from "hono";
import { config } from "virtual:hum/build";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

// Wrangler serves public/ through the asset binding.
const pages = createPageService({
  background: (task, c) => c.executionCtx.waitUntil(task),
});
await mountHum(app, { ...config, pages });

export default app;
