import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig({
  // No platform option: `server.ts` says how the build is run. It exports the
  // app and no `start`, so the build is a Worker module the platform calls
  // instead of a process that binds a port.
  plugins: [hum(), tailwindcss()],
});
