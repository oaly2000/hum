import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import {
  CORE_RUNTIME_ID,
  RESOLVED_USER_ENTRY_VIRTUAL_ID,
  type HumContext,
  USER_ENTRY_VIRTUAL_ID,
} from "../shared.js";

/**
 * Exposes the optional user client entry and wires the client runtime to it.
 *
 * The user entry (default `client/main.ts`) is where global styles such as
 * TailwindCSS are imported (`import "./style.css"`). In dev the runtime boot
 * script depends on this virtual module so its CSS is picked up by the dev CSS
 * collector; in production the entry is a client build input and its CSS flows
 * into the manifest's `entryAssets`.
 *
 * When no user entry file exists the plugin resolves the runtime directly, so
 * a project without a global stylesheet keeps working unchanged.
 */
export function humClientEntry(ctx: HumContext): Plugin {
  return {
    name: "hum:client-entry",

    resolveId(id) {
      if (id === USER_ENTRY_VIRTUAL_ID) return RESOLVED_USER_ENTRY_VIRTUAL_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_USER_ENTRY_VIRTUAL_ID) return null;

      const entryPath = resolve(ctx.options.root, ctx.options.clientEntry);
      const exists = existsSync(entryPath);
      return exists
        ? `import ${JSON.stringify(entryPath)};\n` +
            `export * from ${JSON.stringify(CORE_RUNTIME_ID)};\n`
        : `export * from ${JSON.stringify(CORE_RUNTIME_ID)};\n`;
    },
  };
}
