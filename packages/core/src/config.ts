import { resolve } from "node:path";

import type { Logger } from "./types.js";
import type { PageService } from "./pages.js";

/**
 * URL Hum publishes its client assets under. It is a framework constant rather
 * than a configuration knob: the build carries it, the dev server serves it,
 * and it never depends on the output directory's name or location.
 */
export const ASSETS_BASE = "/_hum";

/** URL the client runtime entry is served from, under `ASSETS_BASE`. */
export const RUNTIME_URL = `${ASSETS_BASE}/runtime.js`;

export interface HumConfig {
  /** Page generation storage and scheduling. Defaults to an in-memory service. */
  pages?: PageService;
  /**
   * Project root. Defaults to `process.cwd()`.
   */
  root?: string;
  /** Routes directory, relative to the root. Defaults to `routes`. */
  routesDir?: string;
  /** Output directory of the production build. Defaults to `dist`. */
  outDir?: string;
  /** Base path the app is served from. Defaults to `/`. */
  basePath?: string;
  /**
   * Run in development mode: modules are re-imported per request so edits show
   * up without a restart, and islands are served straight from Vite.
   * Defaults to `true` when the registered build carries no production assets.
   */
  dev?: boolean;
  logger?: Logger;
}

export interface ResolvedConfig {
  root: string;
  routesDir: string;
  outDir: string;
  basePath: string;
  dev: boolean;
  logger: Logger;
}

export const defaultLogger: Logger = {
  info: (...args) => console.log("hum:", ...args),
  warn: (...args) => console.warn("hum:", ...args),
  error: (...args) => console.error("hum:", ...args),
  debug: (...args) => {
    if (process.env.HUM_DEBUG) console.log("hum:", ...args);
  },
};

export function resolveConfig(config: HumConfig): ResolvedConfig {
  const root = resolve(config.root ?? process.cwd());
  let basePath = config.basePath ?? "/";
  if (basePath !== "/" && basePath.endsWith("/")) {
    basePath = basePath.slice(0, -1);
  }
  if (basePath === "/") basePath = "";

  const outDir = config.outDir ?? "dist";

  return {
    root,
    routesDir: config.routesDir ?? "routes",
    outDir,
    basePath,
    dev: config.dev ?? true,
    logger: config.logger ?? defaultLogger,
  };
}
