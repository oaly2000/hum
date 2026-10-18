import tailwindcss from "@tailwindcss/vite";
import {
  isHumInteractiveElement,
  preactSsrPrecompile,
} from "@humjs/preact-ssr-precompile";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [
    preactSsrPrecompile({
      preserveInteractiveElements: false,
      preserveElements: [isHumInteractiveElement],
    }),
    ...hum({ devEntry: "app.ts", standalone: mode === "standalone" }),
    tailwindcss(),
  ],
}));
