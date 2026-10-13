import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { IslandSpec, Logger, RouteFileSpec } from "../types.js";
import { urlPathOf } from "../routing/path_to_pattern.js";
import {
  classify,
  islandNameOf,
  isModuleFile,
  stripExtension,
} from "../routing/route_files.js";

// The file naming rules live in `@humjs/core/routing` so that the bundler
// driven discovery (`specsFromGlob`) and this crawler cannot drift apart. The
// name is re-exported here because `@humjs/core/discovery` published it.
export { islandNameOf };

export interface CrawlOptions {
  /** Project root, absolute. */
  root: string;
  /** Routes directory, relative to `root`. Defaults to `routes`. */
  routesDir?: string;
  /** Islands directory, relative to `root`. Defaults to `islands`. */
  islandsDir?: string;
  logger?: Logger;
}

export interface CrawledProject {
  routes: RouteFileSpec[];
  islands: IslandSpec[];
}

/**
 * Recursively collects module files below `absDir`. Returned paths always use
 * `/` as separator, regardless of the platform, so the rest of Hum can treat
 * them as URL-ish identifiers.
 */
async function walk(
  absDir: string,
  relDir: string,
  out: string[] = [],
  ignoredDirectories: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = relDir.length > 0 ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await walk(join(absDir, entry.name), rel, out, ignoredDirectories);
      }
    } else if (entry.isFile() && isModuleFile(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

async function walkLocalIslands(
  absDir: string,
  relDir: string,
  out: string[] = [],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (
      !entry.isDirectory() || entry.name.startsWith(".") ||
      entry.name === "node_modules" || entry.name === "_components"
    ) continue;

    const rel = relDir.length > 0 ? `${relDir}/${entry.name}` : entry.name;
    if (entry.name === "_islands") {
      await walk(
        join(absDir, entry.name),
        rel,
        out,
        new Set(["_components"]),
      );
    } else {
      await walkLocalIslands(join(absDir, entry.name), rel, out);
    }
  }
  return out;
}

/** Scans the routes and islands directories of a Hum project. */
export async function crawlProject(
  options: CrawlOptions,
): Promise<CrawledProject> {
  const root = options.root;
  const routesDir = options.routesDir ?? "routes";
  const islandsDir = options.islandsDir ?? "islands";

  const routes: RouteFileSpec[] = [];
  for (
    const rel of await walk(
      join(root, routesDir),
      "",
      [],
      new Set(["_components", "_islands"]),
    )
  ) {
    const relNoExt = stripExtension(rel);
    const basename = relNoExt.split("/").pop() ?? relNoExt;
    const kind = classify(basename);
    routes.push({
      file: `${routesDir}/${rel}`,
      absPath: join(root, routesDir, rel),
      kind,
      urlPath: urlPathOf(relNoExt, kind === "route"),
    });
  }

  const islands: IslandSpec[] = [];
  const seen = new Set<string>();
  const islandFiles = [
    ...(await walk(join(root, islandsDir), "")).map((rel) => ({
      rel,
      file: `${islandsDir}/${rel}`,
      absPath: join(root, islandsDir, rel),
      namePath: stripExtension(rel),
    })),
    ...(await walkLocalIslands(join(root, routesDir), "")).map((rel) => ({
      file: `${routesDir}/${rel}`,
      absPath: join(root, routesDir, rel),
      namePath: `local_${stripExtension(rel)}`,
    })),
  ];

  for (const spec of islandFiles) {
    const name = islandNameOf(spec.namePath);
    if (seen.has(name)) {
      options.logger?.warn(
        `hum: two island files map to the same island name "${name}". ` +
          `Rename one of them so markers stay unambiguous.`,
      );
      continue;
    }
    seen.add(name);
    islands.push({
      name,
      exportName: "default",
      file: spec.file,
      absPath: spec.absPath,
    });
  }

  return { routes, islands };
}
