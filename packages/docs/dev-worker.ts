import { mountHum } from "@humjs/core";
import { Hono } from "hono";
import "virtual:hum/build";
import userApp from "./server.cloudflare.js";

const app = new Hono();
app.route("/", userApp);

await mountHum(app, {
  routesDir: "routes",
  islandsDir: "islands",
  dev: true,
});

export default app;
