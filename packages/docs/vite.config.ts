import tailwindcss from "@tailwindcss/vite";
import {
  isHumInteractiveElement,
  preactSsrPrecompile,
} from "@humjs/preact-ssr-precompile";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig({
  plugins: [
    preactSsrPrecompile({
      preserveInteractiveElements: false,
      preserveElements: [isHumInteractiveElement],
    }),
    ...hum(),
    tailwindcss(),
  ],
});
