import type { ResolvedRoute } from "../routing/fs_routes.js";
import { compileMatcher } from "../routing/path_to_pattern.js";
import type { PageRenderMode, RouteConfig } from "../types.js";

class PagePlanError extends TypeError {}

export function fail(route: ResolvedRoute, message: string): never {
  throw new PagePlanError(`hum: ${route.file.file}: ${message}`);
}

/** Validate JavaScript consumers too, before a bad policy can reach a cache. */
export function pagePolicy(
  route: ResolvedRoute,
  config?: RouteConfig,
): PageRenderMode {
  const policy = config?.render ?? { mode: "ssr" };
  if (!["ssr", "ssg", "isg"].includes(policy.mode)) fail(route, "unknown render mode");
  if (policy.mode === "ssr") return policy;
  if (config?.streaming) fail(route, "streaming is only supported with SSR");
  if (policy.slugs !== undefined &&
    (!Array.isArray(policy.slugs) || policy.slugs.some((slug) => typeof slug !== "string"))) {
    fail(route, "slugs must be a string array");
  }
  if (policy.mode === "ssg" && route.params.length > 0 && policy.slugs === undefined) {
    fail(route, "dynamic SSG routes require slugs (use [] to generate no pages)");
  }
  if (policy.mode === "isg") {
    if (!Number.isFinite(policy.revalidate) || policy.revalidate <= 0) {
      fail(route, "ISG revalidate must be a positive number of seconds");
    }
    if (policy.fallback !== undefined && policy.fallback !== false && policy.fallback !== "blocking") {
      fail(route, "ISG fallback must be false or 'blocking'");
    }
  }
  return policy;
}

export function canonicalPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\\u0000-\u0020]/.test(path)) {
    throw new TypeError(`invalid page path ${JSON.stringify(path)}`);
  }
  // Reject traversal and encoded separators before URL normalization can hide them.
  for (const segment of path.split("/")) {
    const decoded = decodeURIComponent(segment);
    if (decoded === "." || decoded === ".." || /[/\\]/.test(decoded)) {
      throw new TypeError(`invalid page path ${JSON.stringify(path)}`);
    }
  }
  const pathname = new URL(path, "http://hum.local").pathname;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

export function pagePaths(route: ResolvedRoute, policy: PageRenderMode): string[] {
  if (policy.mode === "ssr") return [];
  const slugs = policy.slugs ?? (route.params.length === 0
    ? ["/" + route.pattern.segments.map((segment) => segment.raw).join("/")]
    : []);
  const paths = new Set<string>();
  for (const slug of slugs) {
    try {
      let path = slug;
      if (!slug.startsWith("/")) {
        if (route.params.length !== 1) fail(route, "use absolute paths in slugs for multiple parameters");
        path = "/" + route.pattern.segments.map((segment) => {
          if (segment.kind === "optional" && slug === "") return "";
          return segment.raw.replace(/\[\[\w+\]\]|\[\.\.\.\w+\]|\[\w+\]/g, () => slug);
        }).filter(Boolean).join("/");
      }
      path = canonicalPath(path);
      if (!compileMatcher(route.pattern).test(decodeURI(path))) {
        fail(route, `slug ${JSON.stringify(slug)} does not match the route`);
      }
      if (paths.has(path)) fail(route, `duplicate generated path ${path}`);
      paths.add(path);
    } catch (error) {
      if (error instanceof PagePlanError) throw error;
      fail(route, error instanceof Error ? error.message : String(error));
    }
  }
  return [...paths];
}
