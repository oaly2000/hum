import { mountHum } from "@humjs/core";
import { Hono } from "hono";
import "virtual:hum/build";
import userApp from "./server.js";

// The dev server loads this module inside workerd — `vite.config.ts` points the
// Cloudflare plugin at it — so pages are rendered by the runtime that will
// serve them, with this project's bindings available. The deployment loads the
// built server entry instead, which mounts the same app from the build the
// bundler produced.
//
// The mount goes on an app of this module's own rather than on `server.ts`'s.
// The dev runtime re-runs this file after every change while the app module it
// imports stays in the module cache, and Hono takes no further route once a
// request has matched on its router: mounting the cached app a second time
// fails outright. A fresh app per evaluation is what keeps the mount repeatable
// — Hum's dev server does the same for a project without this file — and it is
// also what makes a route file added while the server runs answer on the spot.
const app = new Hono();
app.route("/", userApp);

await mountHum(app, {
  routesDir: "routes",
  islandsDir: "islands",
  dev: true,
});

export default app;
