import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig(({ command }) => ({
  plugins: [
    hum(),
    // Serving runs the app inside workerd, with the project's bindings and the
    // runtime the deployment uses. The production build stays Hum's own — one
    // server bundle and a public tree — so the plugin is only loaded while the
    // dev server is.
    ...(command === "serve"
      ? [
        cloudflare({
          viteEnvironment: { name: "ssr" },
          config: { main: "./server.ts" },
        }),
      ]
      : []),
    tailwindcss(),
  ],
  environments: {
    ssr: {
      // The Worker must evaluate one copy of these. A second copy of
      // `preact/hooks` carries its own component state, so a component rendered
      // through one copy while the hooks it calls come from the other fails.
      optimizeDeps: {
        include: ["preact", "preact/hooks", "@preact/signals"],
      },
    },
  },
}));
