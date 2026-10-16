import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import {
  isHumInteractiveElement,
  preactSsrPrecompile,
} from "@humjs/preact-ssr-precompile";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig(({ command }) => ({
  plugins: [
    preactSsrPrecompile({
      preserveInteractiveElements: false,
      preserveElements: [isHumInteractiveElement],
    }),
    ...hum({ serverEntry: "server.cloudflare.ts" }),
    ...(command === "serve"
      ? [
          cloudflare({
            viteEnvironment: { name: "ssr" },
            config: { main: "./dev-worker.ts" },
          }),
        ]
      : []),
    tailwindcss(),
  ],
  environments: {
    ssr: {
      optimizeDeps: {
        include: ["preact", "preact/hooks", "@preact/signals"],
      },
    },
  },
}));
