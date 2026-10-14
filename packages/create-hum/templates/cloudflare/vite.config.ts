import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig({
  // `platform: "cloudflare"` makes the production build target a Worker
  // runtime: the generated entry exports the app's fetch handler instead of
  // starting a Node listener. Development is Vite on Node either way.
  plugins: [hum({ platform: "cloudflare" }), tailwindcss()],
});
