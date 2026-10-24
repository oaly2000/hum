/** Route file naming and manifest assembly from bundler-produced modules.
 * No runtime file system discovery is performed.
 */
import type {
  HumManifest,
  IslandManifestEntry,
  IslandSpec,
  ModuleThunk,
  RouteKind,
  RouteManifestEntry,
} from "../types.js";
import { urlPathOf } from "./path_to_pattern.js";

/** Module extensions supported for routes. */
const MODULE_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"] as const;

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

/**
 * A bundler glob result: project root relative file path to a lazy import of
 * that file.
 */
export interface GlobModules {
  [file: string]: ModuleThunk<Record<string, unknown>>;
}

export interface SpecsFromGlobOptions {
  factories?: IslandSpec[];
  /** Routes directory, relative to the project root. @default "routes" */
  routesDir?: string;
  /** Glob result of the routes directory. */
  routeModules: GlobModules;
  /** Explicit declarations collected by the bundler, with generated IDs. */
  declaredIslands?: IslandManifestEntry[];
}

/** Glob patterns that enumerate project routes. */
export interface HumGlobPatterns {
  routes: string[];
}

/** Directory options shared by {@link globPatterns} and {@link specsFromGlob}. */
export interface HumDirectories {
  routesDir?: string;
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

/** Route globs exclude colocated component directories. */
export function globPatterns(options: HumDirectories = {}): HumGlobPatterns {
  const routesDir = normalizeDir(options.routesDir, "routes");
  return {
    routes: [
      ...includePatterns(routesDir),
      ...ignorePatterns(routesDir),
      `!/${routesDir}/**/_components/**`,
      `!/${routesDir}/**/_islands/**`,
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

/** Combines file routes and explicit island declarations from the bundler. */
export function specsFromGlob(options: SpecsFromGlobOptions): HumManifest {
  const routesDir = normalizeDir(options.routesDir, "routes");
  const routes = sortedModules(options.routeModules).map(([file, load]) =>
    routeSpecOf(file, routesDir, load)
  );
  const islands = options.declaredIslands ?? [];
  const seen = new Set<string>();
  for (const island of islands) {
    if (seen.has(island.name)) {
      throw new Error(`Hum: duplicate island identity "${island.name}".`);
    }
    seen.add(island.name);
  }
  return { routes, islands, ...(options.factories === undefined ? {} : { factories: options.factories }) };
}
