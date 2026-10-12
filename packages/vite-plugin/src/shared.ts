import { resolve } from "node:path";

import type { IslandSpec, RouteFileSpec } from "@hum/core";

/** Route and island files discovered in the project. */
export interface HumProject {
  routes: RouteFileSpec[];
  islands: IslandSpec[];
}

/** Shared, mutable state the Hum plugins coordinate through. */
export interface HumContext {
  /** Resolved once Vite merged its own config, so `root` is authoritative. */
  options: ResolvedHumOptions;
  project: HumProject;
}

/** Options accepted by the `hum()` Vite plugin. */
export interface HumOptions {
  /** Project root. Defaults to the Vite root. */
  root?: string;
  /** Routes directory, relative to the root. @default "routes" */
  routesDir?: string;
  /** Islands directory, relative to the root. @default "islands" */
  islandsDir?: string;
  /** Output directory of the production build. @default "_hum" */
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
  /** Log the routes and islands Hum discovered. @default false */
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
    outDir: options.outDir ?? "_hum",
    basePath: options.basePath ?? "/",
    clientEntry: options.clientEntry ?? "client/main.ts",
    verbose: options.verbose ?? false,
  };
}

/** Bare specifier of the client runtime shipped by `@hum/core`. */
export const CORE_RUNTIME_ID = "@hum/core/runtime";

/** Virtual module id of the client runtime entry. */
export const RUNTIME_VIRTUAL_ID = "virtual:hum/runtime";
export const RESOLVED_RUNTIME_VIRTUAL_ID = "\0" + RUNTIME_VIRTUAL_ID;

/** URL the dev server serves the client runtime from. */
export const RUNTIME_URL = "/_hum/runtime.js";

/** Virtual module that imports the user client entry (if any) and the runtime. */
export const USER_ENTRY_VIRTUAL_ID = "virtual:hum/client-entry";
export const RESOLVED_USER_ENTRY_VIRTUAL_ID = "\0" + USER_ENTRY_VIRTUAL_ID;

/**
 * Placeholder comment that marks where dev-only styles collected from the
 * module graph are injected into the document head.
 */
export const DEV_STYLES_PLACEHOLDER = "hum:dev-styles";

/** Directory (relative to the root) the generated build inputs live in. */
export const GENERATED_DIR = ".hum";
export const CLIENT_RUNTIME_ENTRY = ".hum/client-runtime.js";
export const SERVER_ENTRY = ".hum/server-entry.js";
export const SERVER_ENTRY_NAME = "server";

export interface BuildIdInfo {
  buildId: string;
}

/** Stable, short id of a build, derived from the current time. */
export function makeBuildId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Turns an absolute path into a project relative, POSIX style URL path. */
export function projectUrlPath(root: string, absPath: string): string {
  const rel = absPath.slice(root.length).replace(/\\/g, "/");
  return rel.startsWith("/") ? rel : "/" + rel;
}
