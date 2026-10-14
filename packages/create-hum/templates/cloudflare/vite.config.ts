import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig(({ command }) => ({
  // No platform option: `server.ts` says how the app runs. It exports the app
  // and no `start`, so the build is a Worker module the platform calls instead
  // of a process that binds a port.
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
          // `wrangler.jsonc` points the deployment at the built server entry.
          // The dev server needs a module it can load instead, which is what
          // `dev-worker.ts` is; this override is the only difference between
          // the two.
          config: { main: "./dev-worker.ts" },
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
