import { serve } from "@hono/node-server";
import app from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

serve(
  { fetch: app.fetch, port, hostname, overrideGlobalObjects: false },
  (info) => {
    console.log(`hum: listening on http://localhost:${info.port}`);
  },
);
