import type { RouteFileSpec, RouteManifestEntry } from "../types.js";
import {
  compilePrefixMatcher,
  parseUrlPath,
  type UrlPatternInfo,
} from "./path_to_pattern.js";

/** A route file together with everything that has to wrap it. */
export interface ResolvedRoute<T extends RouteFileSpec = RouteManifestEntry> {
  /** The `routes/**` file that renders the page. */
  file: T;
  /** Hono patterns to register, most specific first. */
  honoPatterns: string[];
  /** Parameter names, in order. */
  params: string[];
  pattern: UrlPatternInfo;
  /** `_middleware` files from the root down to the route's directory. */
  middlewares: T[];
  /** `_layout` files from the root down to the route's directory. */
  layouts: T[];
  /** Nearest `_app` file, if any. */
  app?: T;
  /** Nearest `_error` file, if any. */
  error?: T;
}

/** A page that is rendered for unmatched requests. */
export interface ResolvedNotFound<T extends RouteFileSpec = RouteManifestEntry> {
  file: T;
  matchers: RegExp[];
}

/** The special files that apply to a given routes directory. */
export interface SpecialChains<T extends RouteFileSpec = RouteManifestEntry> {
  middlewares: T[];
  layouts: T[];
  app?: T;
  error?: T;
}

/** The directory of a routes-relative file, with `/` separators. */
export function dirOf(relFile: string, routesDir: string): string {
  const rel = relFile.startsWith(routesDir + "/")
    ? relFile.slice(routesDir.length + 1)
    : relFile;
  const idx = rel.lastIndexOf("/");
  return idx === -1 ? "" : rel.slice(0, idx);
}

function isAncestorDir(ancestor: string, dir: string): boolean {
  if (ancestor === dir) return true;
  if (ancestor === "") return true;
  return dir.startsWith(ancestor + "/");
}

function depthOf(dir: string): number {
  return dir === "" ? 0 : dir.split("/").length;
}

/** All directories from the root down to `dir`, inclusive. */
export function dirsUpTo(dir: string): string[] {
  const out: string[] = [""];
  if (dir === "") return out;
  const parts = dir.split("/");
  for (let i = 0; i < parts.length; i++) {
    out.push(parts.slice(0, i + 1).join("/"));
  }
  return out;
}

/** Sorts route files the way they should be registered on Hono. */
export function sortRouteFiles<T extends RouteFileSpec>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const sa = parseUrlPath(a.urlPath).score;
    const sb = parseUrlPath(b.urlPath).score;
    if (sa !== sb) return sb - sa;
    return a.urlPath < b.urlPath ? -1 : a.urlPath > b.urlPath ? 1 : 0;
  });
}

function byDir<T extends RouteFileSpec>(
  files: T[],
  routesDir: string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const file of files) {
    const dir = dirOf(file.file, routesDir);
    const list = map.get(dir);
    if (list === undefined) map.set(dir, [file]);
    else list.push(file);
  }
  return map;
}

function deepest<T extends RouteFileSpec>(
  files: T[],
  routesDir: string,
  dir: string,
): T | undefined {
  let best: T | undefined;
  let bestDepth = -1;
  for (const file of files) {
    const fileDir = dirOf(file.file, routesDir);
    if (!isAncestorDir(fileDir, dir)) continue;
    const depth = depthOf(fileDir);
    if (depth > bestDepth) {
      best = file;
      bestDepth = depth;
    }
  }
  return best;
}

/**
 * Collects the middleware and layout chain (root first) and the nearest `_app`
 * / `_error` for a routes directory.
 */
export function resolveSpecialChains<T extends RouteFileSpec>(
  routes: T[],
  routesDir: string,
  dir: string,
): SpecialChains<T> {
  const layouts = byDir(routes.filter((r) => r.kind === "layout"), routesDir);
  const middlewares = byDir(
    routes.filter((r) => r.kind === "middleware"),
    routesDir,
  );

  const chain = (map: Map<string, T[]>): T[] => {
    const out: T[] = [];
    for (const d of dirsUpTo(dir)) {
      const list = map.get(d);
      if (list !== undefined) out.push(...list);
    }
    return out;
  };

  return {
    middlewares: chain(middlewares),
    layouts: chain(layouts),
    app: deepest(routes.filter((r) => r.kind === "app"), routesDir, dir),
    error: deepest(routes.filter((r) => r.kind === "error"), routesDir, dir),
  };
}

/**
 * Resolves every route file against the special files (`_app`, `_layout`,
 * `_middleware`, `_error`) that apply to it.
 */
export function resolveRoutes<T extends RouteFileSpec>(
  routes: T[],
  routesDir: string,
): { routes: ResolvedRoute<T>[]; notFound: ResolvedNotFound<T>[] } {
  const resolved: ResolvedRoute<T>[] = sortRouteFiles(
    routes.filter((r) => r.kind === "route"),
  ).map((file) => {
    const dir = dirOf(file.file, routesDir);
    const pattern = parseUrlPath(file.urlPath);
    const chains = resolveSpecialChains(routes, routesDir, dir);
    return {
      file,
      honoPatterns: pattern.honoPatterns,
      params: pattern.params,
      pattern,
      middlewares: chains.middlewares,
      layouts: chains.layouts,
      app: chains.app,
      error: chains.error,
    };
  });

  const notFound: ResolvedNotFound<T>[] = routes
    .filter((r) => r.kind === "notFound")
    .sort(
      (a, b) =>
        depthOf(dirOf(b.file, routesDir)) - depthOf(dirOf(a.file, routesDir)),
    )
    .map((file) => ({
      file,
      // A `_404` page owns everything below its directory, not just the exact
      // directory URL, hence the prefix matcher.
      matchers: [compilePrefixMatcher(parseUrlPath(file.urlPath))],
    }));

  return { routes: resolved, notFound };
}

/**
 * Builds a synthetic route for requests that matched no route file, so that
 * the 404 / error pages can still use the layouts and app shell of that
 * directory. `dir` is the routes-relative directory of the `_404` page that
 * applies (or `""` for the root).
 */
export function unmatchedRoute<T extends RouteFileSpec>(
  routes: T[],
  routesDir: string,
  dir: string,
  urlPath: string,
): ResolvedRoute<T> {
  const chains = resolveSpecialChains(routes, routesDir, dir);
  return {
    file: {
      file: `${routesDir}${dir === "" ? "" : "/" + dir}/_404`,
      absPath: "",
      kind: "notFound",
      urlPath,
    } as unknown as T,
    honoPatterns: [],
    params: [],
    pattern: parseUrlPath(urlPath),
    middlewares: chains.middlewares,
    layouts: chains.layouts,
    app: chains.app,
    error: chains.error,
  };
}
