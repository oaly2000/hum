import type { Plugin } from "vite";

import { humBuildInput } from "./plugins/build_input.js";
import { humBuild } from "./plugins/build.js";
import { humClientEntry } from "./plugins/client_entry.js";
import { humDevServer } from "./plugins/dev_server.js";
import { humIslandDeclarations } from "./plugins/island_declarations.js";
import { humIslands } from "./plugins/islands.js";
import { humRoutes } from "./plugins/routes.js";
import { resolveHumOptions, type HumContext, type HumOptions } from "./shared.js";

/**
 * The Hum Vite plugin.
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { hum } from "@humjs/vite-plugin";
 *
 * export default defineConfig({ plugins: [hum()] });
 * ```
 */
export function hum(userOptions: HumOptions = {}): Plugin[] {
  const ctx: HumContext = {
    options: resolveHumOptions(process.cwd(), userOptions),
  };

  return [
    {
      name: "hum:config",
      config(config) {
        // Vite has merged its own config by now, so `root` is authoritative.
        ctx.options = resolveHumOptions(
          config.root ?? process.cwd(),
          userOptions,
        );
        // The document is rendered by Hum, not from an `index.html`.
        return { appType: "custom" };
      },
    },
    humIslandDeclarations(ctx),
    humRoutes(ctx),
    humBuildInput(ctx),
    humIslands(),
    humClientEntry(ctx),
    humDevServer(ctx),
    humBuild(ctx),
  ];
}

export type { HumOptions } from "./shared.js";
