import { createPageService, mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

const pages = createPageService({
  background: (task, c) => c.executionCtx.waitUntil(task),
});
await mountHum(app, { ...config, pages });

export default app;
