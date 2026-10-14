import type { ProdManifest } from "@humjs/core";
import { resolve } from "node:path";

/** Shared state the Hum plugins coordinate through. */
export interface HumContext {
  /** Resolved once Vite merged its own config, so `root` is authoritative. */
  options: ResolvedHumOptions;
  /**
   * Client assets of the production build, set once the client pass wrote them.
   * The build module inlines them for the server pass, which is why the runtime
   * has no manifest file to read.
   */
  prod?: ProdManifest | null;
}

/** Counts of what Hum found, for the verbose log. */
interface ProjectCounts {
  routes: number;
  islands: number;
}

/** One line summary of what Hum found, used by the verbose log. */
export function projectSummary(counts: ProjectCounts): string {
  return `hum: ${counts.routes} route file(s), ${counts.islands} island(s)`;
}

/** Source of an `import.meta.glob` call that enumerates `patterns`. */
export function globCall(patterns: string[]): string {
  return `import.meta.glob(${JSON.stringify(patterns)})`;
}

/** Options accepted by the `hum()` Vite plugin. */
export interface HumOptions {
  /** Project root. Defaults to the Vite root. */
  root?: string;
  /** Routes directory, relative to the root. @default "routes" */
  routesDir?: string;
  /** Islands directory, relative to the root. @default "islands" */
  islandsDir?: string;
  /** Output directory of the production build. @default "dist" */
  outDir?: string;
  /** Base path the app is served from. @default "/" */
  basePath?: string;
  /**
   * Optional user client entry, relative to the root. Use it to pull in global
   * styles such as TailwindCSS (`import "./style.css"`). In dev its CSS is
   * injected into the document head; in production it becomes a client build
   * input whose CSS lands in the manifest's `entryAssets`.
   * @default "client/main.ts"
   */
  clientEntry?: string;
  /**
   * Log what Hum discovered: the routes and islands in development, and the
   * island chunks a production build emitted (the bundler resolves the routes
   * there, so their count is not known to the plugin).
   * @default false
   */
  verbose?: boolean;
}

export interface ResolvedHumOptions {
  root: string;
  routesDir: string;
  islandsDir: string;
  outDir: string;
  basePath: string;
  clientEntry: string;
  verbose: boolean;
}

export function resolveHumOptions(
  root: string,
  options: HumOptions = {},
): ResolvedHumOptions {
  return {
    root: resolve(options.root ?? root),
    routesDir: options.routesDir ?? "routes",
    islandsDir: options.islandsDir ?? "islands",
    outDir: options.outDir ?? "dist",
    basePath: options.basePath ?? "/",
    clientEntry: options.clientEntry ?? "client/main.ts",
    verbose: options.verbose ?? false,
  };
}

/** Bare specifier of the client runtime shipped by `@humjs/core`. */
export const CORE_RUNTIME_ID = "@humjs/core/runtime";

/**
 * URL Hum publishes its client assets under. It addresses
 * `<outDir>/public/_hum`, never the output directory itself, so the build
 * directory can be renamed or moved without touching a client URL.
 */
export const ASSETS_BASE = "/_hum";

/** URL the dev server serves the client runtime from. */
export const RUNTIME_URL = `${ASSETS_BASE}/runtime.js`;

/** Virtual module that imports the user client entry (if any) and the runtime. */
export const USER_ENTRY_VIRTUAL_ID = "virtual:hum/client-entry";
export const RESOLVED_USER_ENTRY_VIRTUAL_ID = "\0" + USER_ENTRY_VIRTUAL_ID;

/**
 * Virtual module that exposes the route and island specs. It is built on
 * `import.meta.glob`, so the bundler resolves the file list itself.
 */
export const ROUTES_VIRTUAL_ID = "virtual:hum/routes";
export const RESOLVED_ROUTES_VIRTUAL_ID = "\0" + ROUTES_VIRTUAL_ID;

/**
 * Virtual module that registers the build Hum runs from: the route and island
 * specs plus the production assets. Importing it is what gives the runtime its
 * input, so it is generated for development and for the production server
 * alike.
 */
export const BUILD_VIRTUAL_ID = "virtual:hum/build";
export const RESOLVED_BUILD_VIRTUAL_ID = "\0" + BUILD_VIRTUAL_ID;

/** Directory (relative to the root) the generated build inputs live in. */
export const GENERATED_DIR = ".hum";
export const CLIENT_RUNTIME_ENTRY = `${GENERATED_DIR}/client-runtime.js`;
/**
 * Client build input that exists only so the bundler emits one chunk per
 * island. Nothing imports it: the browser loads those chunks by URL from the
 * server rendered markup.
 */
export const ISLANDS_ENTRY = `${GENERATED_DIR}/islands.js`;
export const SERVER_ENTRY = `${GENERATED_DIR}/server-entry.js`;
export const SERVER_ENTRY_NAME = "server";

/** Stable, short id of a build, derived from the current time. */
export function makeBuildId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Turns an absolute path into a project relative, POSIX style URL path. */
export function projectUrlPath(root: string, absPath: string): string {
  const rel = absPath.slice(root.length).replace(/\\/g, "/");
  return rel.startsWith("/") ? rel : "/" + rel;
}
