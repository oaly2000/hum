import { mountHum } from "@humjs/core";
import "virtual:hum/build";
import app from "./server.js";

// The dev server loads this module inside workerd — `vite.config.ts` points the
// Cloudflare plugin at it — so pages are rendered by the runtime that will
// serve them, with this project's bindings available. The deployment loads the
// built server entry instead, which mounts the same app from the build the
// bundler produced.
await mountHum(app, {
  routesDir: "routes",
  islandsDir: "islands",
  dev: true,
});

export default app;
