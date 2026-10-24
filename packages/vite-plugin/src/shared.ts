import { ASSETS_BASE, type GeneratedPage, type ProdManifest, RUNTIME_URL } from "@humjs/core";
import { isAbsolute, relative, resolve } from "node:path";
import type { Plugin } from "vite";

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
  pages?: Record<string, GeneratedPage>;
  /** Explicit definitions collected from bundler metadata modules. */
  clientDeclarations?: Map<string, DeclaredClientDefinition[]>;
  /** Source CSS dependencies collected before server chunks are combined. */
  styleDependencies?: Map<string, string[]>;
  styles?: Record<string, string[]>;
  /** Independent stylesheet compilation uses the same user plugin pipeline. */
  stylesPass?: string[];
}

export interface DeclaredClientDefinition {
  binding?: string;
  kind: "island" | "factory";
  name: string;
  file: string;
  exportName: string;
}

export const CLIENT_SLICE_QUERY = "hum-client";

export const CLIENT_METADATA_QUERY = "hum-client-metadata";

/** Enumerated by Vite, never by a plugin filesystem crawler. */
export function clientSourcePatterns(options: ResolvedHumOptions): string[] {
  const output = relative(options.root, resolve(options.root, options.outDir)).replace(/\\/g, "/");
  const outputExclusion = output === ".." || output.startsWith("../") || isAbsolute(output)
    ? [] : [`!/${output}/**`];
  return [
    "/**/*.{ts,tsx,js,jsx}",
    "!/**/*.d.ts",
    "!/**/node_modules/**",
    "!/.hum/**",
    "!/public/**",
    "!/**/{tests,__tests__}/**",
    "!/**/*.{test,spec}.{ts,tsx,js,jsx}",
    ...outputExclusion,
  ];
}

export function clientMetadataGlob(options: ResolvedHumOptions): string {
  return `import.meta.glob(${JSON.stringify(clientSourcePatterns(options))}, ` +
    `{ eager: true, import: "default", query: "?${CLIENT_METADATA_QUERY}" })`;
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
  /** Production entry, relative to the root. @default "server.ts" */
  serverEntry?: string;
  /** App module for development and prerendering, without a listener. Defaults to serverEntry. */
  devEntry?: string;
  /** Canonical origin for generated pages. @default "http://localhost" */
  prerenderOrigin?: string;
  /** Output directory of the production build. @default "dist" */
  outDir?: string;
  /** Bundle the server and its npm dependencies for deployment without node_modules. @default false */
  standalone?: boolean;
  /** Base path the app is served from. @default "/" */
  basePath?: string;
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
  serverEntry: string;
  devEntry: string;
  prerenderOrigin: string;
  outDir: string;
  standalone: boolean;
  basePath: string;
  verbose: boolean;
}

export function resolveHumOptions(
  root: string,
  options: HumOptions = {},
): ResolvedHumOptions {
  return {
    root: resolve(options.root ?? root),
    routesDir: options.routesDir ?? "routes",
    serverEntry: options.serverEntry ?? SERVER_ENTRY_FILE,
    devEntry: options.devEntry ?? options.serverEntry ?? SERVER_ENTRY_FILE,
    prerenderOrigin: new URL(options.prerenderOrigin ?? "http://localhost").origin,
    outDir: options.outDir ?? "dist",
    standalone: options.standalone ?? false,
    basePath: options.basePath ?? "/",
    verbose: options.verbose ?? false,
  };
}

/** Bare specifier of the client runtime shipped by `@humjs/core`. */
export const CORE_RUNTIME_ID = "@humjs/core/runtime";

/**
 * URL Hum publishes its client assets under, and the URL the dev server serves
 * the client runtime from. Both live in `@humjs/core` so the framework, the dev
 * server and the build share one definition; they are re-exported here because
 * the plugins consume them through this module.
 */
export { ASSETS_BASE, RUNTIME_URL };

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

/** Generated pages are replaced after prerendering without recompiling the app. */
export const PAGES_VIRTUAL_ID = "virtual:hum/pages";

/**
 * Builds a plugin half that serves one virtual module: `resolveId` maps the
 * public id to its resolved id and `load` produces the source. Hum's virtual
 * modules all follow this shape, so the plumbing lives in one place instead of
 * being repeated per plugin.
 */
export function virtualModule(
  name: string,
  id: string,
  source: () => string,
): Plugin {
  const resolvedId = "\0" + id;
  return {
    name,
    resolveId(request) {
      return request === id ? resolvedId : null;
    },
    load(request) {
      return request !== resolvedId ? null : source();
    },
  };
}

/**
 * Default production entry. Optional: without it the build makes an app of
 * its own and serves it on Node.
 */
export const SERVER_ENTRY_FILE = "server.ts";

/** Directory (relative to the root) the generated build inputs live in. */
export const GENERATED_DIR = ".hum";
export const CLIENT_RUNTIME_ENTRY = `${GENERATED_DIR}/client-runtime.js`;
/**
 * Client build input that exists only so the bundler emits chunks for
 * declaring modules. Nothing imports it: the browser loads those chunks by URL from the
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
