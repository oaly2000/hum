import { describe, expect, it } from "vitest";

import {
  dirOf,
  resolveRoutes,
  sortRouteFiles,
  unmatchedRoute,
} from "../src/routing/fs_routes.js";
import type { RouteFileSpec } from "../src/types.js";

function file(
  path: string,
  kind: RouteFileSpec["kind"],
  urlPath: string,
): RouteFileSpec {
  return { file: `routes/${path}`, absPath: `/app/routes/${path}`, kind, urlPath };
}

const routes: RouteFileSpec[] = [
  file("_app.tsx", "app", "/"),
  file("_layout.tsx", "layout", "/"),
  file("_middleware.ts", "middleware", "/"),
  file("_404.tsx", "notFound", "/"),
  file("blogs/_layout.tsx", "layout", "/blogs"),
  file("blogs/_middleware.ts", "middleware", "/blogs"),
  file("blogs/_404.tsx", "notFound", "/blogs"),
  file("index.tsx", "route", "/"),
  file("blogs/index.tsx", "route", "/blogs"),
  file("blogs/[id].tsx", "route", "/blogs/[id]"),
  file("blogs/[...rest].tsx", "route", "/blogs/[...rest]"),
  file("[[lang]]/about.tsx", "route", "/[[lang]]/about"),
];

describe("dirOf", () => {
  it("returns the routes relative directory", () => {
    expect(dirOf("routes/blogs/[id].tsx", "routes")).toBe("blogs");
    expect(dirOf("routes/index.tsx", "routes")).toBe("");
  });
});

describe("sortRouteFiles", () => {
  it("puts specific routes first", () => {
    const sorted = sortRouteFiles(routes.filter((r) => r.kind === "route"));
    const index = sorted.findIndex((f) => f.urlPath === "/blogs");
    expect(index).toBeGreaterThanOrEqual(0);
    // `/blogs/[...rest]` is the least specific and must come last.
    expect(sorted.at(-1)?.urlPath).toBe("/blogs/[...rest]");
  });
});

describe("resolveRoutes", () => {
  const { routes: resolved, notFound } = resolveRoutes(routes, "routes");

  function find(urlPath: string) {
    const route = resolved.find((r) => r.file.urlPath === urlPath);
    if (route === undefined) throw new Error(`missing route ${urlPath}`);
    return route;
  }

  it("collects the middleware chain from the root down", () => {
    const route = find("/blogs/[id]");
    expect(route.middlewares.map((m) => m.file)).toEqual([
      "routes/_middleware.ts",
      "routes/blogs/_middleware.ts",
    ]);
  });

  it("collects the layout chain from the root down", () => {
    const route = find("/blogs/[id]");
    expect(route.layouts.map((m) => m.file)).toEqual([
      "routes/_layout.tsx",
      "routes/blogs/_layout.tsx",
    ]);
  });

  it("attaches the nearest app and error page", () => {
    expect(find("/blogs/[id]").app?.file).toBe("routes/_app.tsx");
    expect(find("/").app?.file).toBe("routes/_app.tsx");
  });

  it("exposes the Hono patterns for optional routes", () => {
    expect(find("/[[lang]]/about").honoPatterns).toEqual([
      "/:lang/about",
      "/about",
    ]);
  });

  it("orders 404 pages by depth", () => {
    expect(notFound.map((n) => n.file.file)).toEqual([
      "routes/blogs/_404.tsx",
      "routes/_404.tsx",
    ]);
    expect(notFound[0].matchers.some((m) => m.test("/blogs/42"))).toBe(true);
    expect(notFound[0].matchers.some((m) => m.test("/other"))).toBe(false);
  });

  it("builds a synthetic route for unmatched requests", () => {
    const route = unmatchedRoute(routes, "routes", "blogs", "/blogs/nope");
    expect(route.layouts.map((l) => l.file)).toEqual([
      "routes/_layout.tsx",
      "routes/blogs/_layout.tsx",
    ]);
  });
});
