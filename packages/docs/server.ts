import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
