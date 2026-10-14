/**
 * The file naming rules of `routes/` and `islands/`, and the discovery of those
 * files from a bundler's `import.meta.glob` result.
 *
 * Discovery belongs to the bundler: it knows the file list while it builds the
 * module that calls {@link specsFromGlob}, so a server bundle carries lazy
 * imports rather than a serialized route table, and nothing has to scan a
 * directory when the server starts. {@link islandNameOfFile} is the single
 * answer to "is this file an island, and what is it called", used by both the
 * glob result and a bundler's own manifest.
 *
 * Nothing in this module touches Node built-ins, so it runs in the browser, in
 * an edge runtime, and inside a virtual module.
 */

import type {
  HumManifest,
  IslandManifestEntry,
  Logger,
  ModuleThunk,
  RouteKind,
  RouteManifestEntry,
} from "../types.js";
import { urlPathOf } from "./path_to_pattern.js";

/** Module extensions Hum picks up in both directories. */
const MODULE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"] as const;

/** True for files Hum treats as routes or islands. */
function isModuleFile(name: string): boolean {
  if (name.endsWith(".d.ts")) return false;
  if (name.startsWith(".") || name.startsWith("-")) return false;
  return MODULE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Removes the module extension of a file name, if it has one. */
function stripExtension(name: string): string {
  for (const ext of MODULE_EXTENSIONS) {
    if (name.endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}

/** Maps the basename of a route file to the role it plays in the route tree. */
function classify(basename: string): RouteKind {
  switch (basename) {
    case "_app":
      return "app";
    case "_layout":
      return "layout";
    case "_middleware":
      return "middleware";
    case "_404":
      return "notFound";
    case "_error":
    case "_500":
      return "error";
    default:
      return "route";
  }
}

/** Turns an island file path into a marker safe identifier. */
function islandNameOf(relPathNoExt: string): string {
  const name = relPathNoExt.split("/").join("_").replace(
    /[^A-Za-z0-9_$]/g,
    "_",
  );
  return /^[0-9]/.test(name) ? "_" + name : name;
}

/**
 * A bundler glob result: project root relative file path to a lazy import of
 * that file.
 */
export interface GlobModules {
  [file: string]: ModuleThunk<Record<string, unknown>>;
}

export interface SpecsFromGlobOptions {
  /** Routes directory, relative to the project root. @default "routes" */
  routesDir?: string;
  /** Islands directory, relative to the project root. @default "islands" */
  islandsDir?: string;
  /** Glob result of the routes directory. */
  routeModules: GlobModules;
  /** Glob result of the islands directory. */
  islandModules: GlobModules;
  /** Glob result of every `_islands` directory below the routes directory. */
  localIslandModules: GlobModules;
  logger?: Logger;
}

/** Glob patterns that enumerate every route and island module of a project. */
export interface HumGlobPatterns {
  routes: string[];
  islands: string[];
  localIslands: string[];
}

/** Directory options shared by {@link globPatterns} and {@link specsFromGlob}. */
export interface HumDirectories {
  routesDir?: string;
  islandsDir?: string;
}

function normalizeDir(value: string | undefined, fallback: string): string {
  const dir = (value ?? fallback)
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");
  return dir === "" ? fallback : dir;
}

/** Turns a glob key into the project relative path the manifest stores. */
function globFileOf(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\.?\//, "");
}

/** Path of `file` relative to the directory `dir`, both project relative. */
function relativeTo(file: string, dir: string): string {
  return file.startsWith(dir + "/") ? file.slice(dir.length + 1) : file;
}

function includePatterns(dir: string): string[] {
  return MODULE_EXTENSIONS.map((ext) => `/${dir}/**/*${ext}`);
}

/**
 * Patterns for the files Hum never treats as modules: TypeScript declaration
 * files, dot files, `-name` files, and the `node_modules` directory. Dot files
 * are ignored by the glob itself, so they need no pattern.
 */
function ignorePatterns(dir: string): string[] {
  return [
    `!/${dir}/**/*.d.ts`,
    `!/${dir}/**/-*`,
    `!/${dir}/**/node_modules/**`,
  ];
}

/**
 * The glob patterns that enumerate a project's route and island modules:
 * `routes/**` without `_components` and `_islands`, every module below
 * `islands/`, and every module below a `routes/**\/_islands` directory.
 */
export function globPatterns(options: HumDirectories = {}): HumGlobPatterns {
  const routesDir = normalizeDir(options.routesDir, "routes");
  const islandsDir = normalizeDir(options.islandsDir, "islands");
  const localIslandsDir = `${routesDir}/**/_islands`;

  return {
    routes: [
      ...includePatterns(routesDir),
      ...ignorePatterns(routesDir),
      `!/${routesDir}/**/_components/**`,
      `!/${routesDir}/**/_islands/**`,
    ],
    islands: [
      ...includePatterns(islandsDir),
      ...ignorePatterns(islandsDir),
    ],
    localIslands: [
      ...includePatterns(localIslandsDir),
      ...ignorePatterns(localIslandsDir),
      // `walkLocalIslands` ignores `_components` inside a `_islands` directory.
      `!/${localIslandsDir}/**/_components/**`,
    ],
  };
}

/** A route file of the routes directory, with the module that loads it. */
export function routeSpecOf(
  file: string,
  routesDir: string,
  load: ModuleThunk<Record<string, unknown>>,
): RouteManifestEntry {
  const relNoExt = stripExtension(relativeTo(file, routesDir));
  const basename = relNoExt.split("/").pop() ?? relNoExt;
  const kind = classify(basename);
  return { file, kind, urlPath: urlPathOf(relNoExt, kind === "route"), load };
}

/** Directory below `routes/` that holds the islands of its route directory. */
const LOCAL_ISLANDS_DIR = "_islands";
/** Directory that holds helpers, which the glob patterns never descend into. */
const COMPONENTS_DIR = "_components";

/**
 * Island name of a project relative module file, or `null` when the file is no
 * island: it then lives neither below the islands directory nor below a
 * `routes&#47;**&#47;_islands` directory, or it sits in a `_components`
 * directory, which the glob patterns never descend into.
 *
 * The glob result and a bundler's manifest both go through this function, so
 * the two cannot name the same file differently.
 */
export function islandNameOfFile(
  file: string,
  options: HumDirectories = {},
): string | null {
  const routesDir = normalizeDir(options.routesDir, "routes");
  const islandsDir = normalizeDir(options.islandsDir, "islands");
  const name = globFileOf(file);
  const basename = name.split("/").pop() ?? name;
  if (!isModuleFile(basename)) return null;

  if (name.startsWith(`${islandsDir}/`)) {
    return islandNameOf(stripExtension(name.slice(islandsDir.length + 1)));
  }

  const prefix = `${routesDir}/`;
  if (!name.startsWith(prefix)) return null;
  const rel = name.slice(prefix.length);
  const directories = rel.split("/").slice(0, -1);
  if (!directories.includes(LOCAL_ISLANDS_DIR)) return null;
  if (directories.includes(COMPONENTS_DIR)) return null;

  return islandNameOf(`local_${stripExtension(rel)}`);
}

function sortedModules(
  modules: GlobModules,
): Array<[string, ModuleThunk<Record<string, unknown>>]> {
  const entries = Object.entries(modules).map(
    ([key, load]): [string, ModuleThunk<Record<string, unknown>>] => [
      globFileOf(key),
      load,
    ],
  );
  // Glob key order is not guaranteed, and the specs are part of the
  // server/client contract, so sort them here.
  return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Builds the route and island specs {@link defineBuild} registers from the
 * results of the `import.meta.glob` calls of {@link globPatterns}, using the
 * same naming rules as the file system crawler.
 */
export function specsFromGlob(options: SpecsFromGlobOptions): HumManifest {
  const routesDir = normalizeDir(options.routesDir, "routes");
  const islandsDir = normalizeDir(options.islandsDir, "islands");

  const routes: RouteManifestEntry[] = [];
  for (const [file, load] of sortedModules(options.routeModules)) {
    routes.push(routeSpecOf(file, routesDir, load));
  }

  const islands: IslandManifestEntry[] = [];
  const seen = new Set<string>();
  const push = (
    file: string,
    load: ModuleThunk<Record<string, unknown>>,
  ): void => {
    // The same function names the islands of a bundler's manifest, so both
    // sides of the client/server contract agree on one island's name.
    const name = islandNameOfFile(file, { routesDir, islandsDir });
    if (name === null) return;
    if (seen.has(name)) {
      options.logger?.warn(
        `hum: two island files map to the same island name "${name}". ` +
          `Rename one of them so markers stay unambiguous.`,
      );
      return;
    }
    seen.add(name);
    islands.push({ name, exportName: "default", file, load });
  };

  for (const [file, load] of sortedModules(options.islandModules)) {
    push(file, load);
  }
  for (const [file, load] of sortedModules(options.localIslandModules)) {
    push(file, load);
  }

  return { routes, islands };
}
