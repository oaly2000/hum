import { serve } from "@hono/node-server";
import app from "./app.js";

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3001),
    hostname: process.env.HOST ?? "127.0.0.1",
    overrideGlobalObjects: false,
  },
  (info) => console.log(`Hum Store: http://localhost:${info.port}`),
);
