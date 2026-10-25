import type { HumInternals } from "../server/app.js";
import type { HumBuild } from "../build/registry.js";
import type { HumConfig } from "../server/config.js";
import { ModuleLoader } from "../server/loader.js";
import { resolveRoutes } from "../routing/fs_routes.js";
import { compileMatcher } from "../routing/path_to_pattern.js";
import type { RouteModule } from "../types.js";
import type { GeneratedPage } from "./types.js";
import { fail, pagePaths, pagePolicy } from "./policy.js";

export interface PlannedPage {
  path: string;
  route: string;
}

/** Bundler discovery remains the sole source of routes. No file system access. */
export async function planPages(
  build: HumBuild,
  config: Pick<HumConfig, "routesDir"> = {},
): Promise<PlannedPage[]> {
  const { routes } = resolveRoutes(build.routes, config.routesDir ?? "routes");
  const loader = new ModuleLoader(false);
  const result: PlannedPage[] = [];
  const owners = new Map<string, string>();
  for (const route of routes) {
    const mod = await loader.load(route.file) as RouteModule;
    const policy = pagePolicy(route, mod.config);
    for (const path of pagePaths(route, policy)) {
      if (owners.has(path)) fail(route, `generated path ${path} is already owned by ${owners.get(path)}`);
      // Hono registration order must agree with the owner of each output URL.
      const owner = routes.find((candidate) => compileMatcher(candidate.pattern).test(decodeURI(path)));
      if (owner !== route) fail(route, `generated path ${path} is shadowed by ${owner?.file.file}`);
      owners.set(path, route.file.file);
      result.push({ path, route: route.file.file });
    }
  }
  return result;
}

export function prerenderPages(app: { hum: HumInternals }): Promise<Record<string, GeneratedPage>> {
  return app.hum.pages.prerender();
}
