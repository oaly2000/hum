import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { hum } from "@hum/vite-plugin";

export default defineConfig({
  plugins: [hum(), tailwindcss()],
});
