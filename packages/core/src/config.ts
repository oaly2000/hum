import { resolve } from "node:path";

import type { Logger } from "./types.js";

/**
 * URL Hum publishes its client assets under. It matches the browser safe
 * default in `./build_cache.js`, which is also the URL the dev server serves.
 */
export const ASSETS_BASE = "/_hum";

export interface HumConfig {
  /**
   * Project root. Defaults to `process.cwd()`.
   */
  root?: string;
  /** Routes directory, relative to the root. Defaults to `routes`. */
  routesDir?: string;
  /** Islands directory, relative to the root. Defaults to `islands`. */
  islandsDir?: string;
  /** Output directory of the production build. Defaults to `dist`. */
  outDir?: string;
  /**
   * URL Hum publishes its client assets under. The build carries it, so it is
   * normally taken from there; Hum defaults it to `/_hum` when it runs from
   * source. It is never derived from `outDir`.
   */
  assetsBase?: string;
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
  islandsDir: string;
  outDir: string;
  assetsBase: string;
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

/**
 * Normalizes an absolute URL prefix: it always starts with `/` and never ends
 * with one, so callers can append `/<path>` unconditionally.
 */
function normalizeAssetsBase(value: string): string {
  const trimmed = value.trim().replace(/\\/g, "/");
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

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
    islandsDir: config.islandsDir ?? "islands",
    outDir,
    assetsBase: normalizeAssetsBase(config.assetsBase ?? ASSETS_BASE),
    basePath,
    dev: config.dev ?? true,
    logger: config.logger ?? defaultLogger,
  };
}
