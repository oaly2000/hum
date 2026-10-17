import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

await mountHum(app, config);

export default app;
