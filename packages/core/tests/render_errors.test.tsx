import { h } from "preact";

import { Hono, type Next } from "hono";
import { basicAuth } from "hono/basic-auth";

import { describe, expect, it } from "vitest";

import { defineBuild } from "../src/build.js";
import { mountHum } from "../src/mod.js";

import type { HumContext, HumManifest } from "../src/types.js";

import { Home } from "./helpers/render_components.js";
import { createRenderApp } from "./helpers/render_app.js";

function Boom(): never {
  throw new Error("kaboom");
}

const { app, manifest } = await createRenderApp([
  {
    file: "routes/index.tsx",
    kind: "route",
    urlPath: "/",
    load: async () => ({
      default: Home,
      head: () => h("title", null, "Hum home"),
    }),
  },
  {
    file: "routes/boom.tsx",
    kind: "route",
    urlPath: "/boom",
    load: async () => ({ default: Boom }),
  },
], ["Counter"]);

describe("not found and errors", () => {
  it("renders the _404 page with status 404", async () => {
    const res = await app.request("http://localhost/nope");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('id="not-found"');
    expect(html).toContain('id="layout"');
  });

  it("runs the directory _middleware for unmatched paths", async () => {
    const guarded: HumManifest = {
      ...manifest,
      routes: [
        ...manifest.routes,
        {
          file: "routes/admin/_middleware.ts",
          kind: "middleware",
          urlPath: "/admin",
          load: async () => ({
            default: async (c: HumContext, next: Next) => {
              if (c.req.header("x-admin") !== "yes") {
                return c.text("admin guard", 403);
              }
              await next();
            },
          }),
        },
        {
          file: "routes/admin/_404.tsx",
          kind: "notFound",
          urlPath: "/admin",
          load: async () => ({
            default: () => h("div", { id: "admin-404" }, "admin 404"),
          }),
        },
        {
          file: "routes/admin/index.tsx",
          kind: "route",
          urlPath: "/admin",
          load: async () => ({
            default: () => h("div", { id: "admin-home" }, "admin home"),
          }),
        },
      ],
    };
    defineBuild({ ...guarded, prod: null });
    const mounted = await mountHum(new Hono(), { dev: true });

    const page = await mounted.request("http://localhost/admin");
    expect(page.status).toBe(403);
    expect(await page.text()).toBe("admin guard");

    // The guard also covers unmatched paths below its directory.
    const unmatched = await mounted.request("http://localhost/admin/typo");
    expect(unmatched.status).toBe(403);
    expect(await unmatched.text()).toBe("admin guard");

    const allowed = await mounted.request("http://localhost/admin/typo", {
      headers: { "x-admin": "yes" },
    });
    expect(allowed.status).toBe(404);
    const allowedHtml = await allowed.text();
    expect(allowedHtml).toContain('id="admin-404"');
    expect(allowedHtml).toContain('id="layout"');

    // Paths outside the guarded directory keep rendering the root 404 page.
    const outside = await mounted.request("http://localhost/nope");
    expect(outside.status).toBe(404);
    expect(await outside.text()).toContain('id="not-found"');
  });

  it("ignores a middleware export from a route file", async () => {
    // `_middleware.ts` is the only middleware mechanism: routing the chain
    // through a route file's own exports made the scope story ambiguous. Route
    // scoped request logic belongs in `handlers`.
    const withRouteMiddleware: HumManifest = {
      ...manifest,
      routes: [
        ...manifest.routes,
        {
          file: "routes/guarded.tsx",
          kind: "route",
          urlPath: "/guarded",
          load: async () => ({
            middleware: async (c: HumContext, _next: Next) =>
              c.text("route middleware ran", 403),
            default: () => h("div", { id: "guarded-page" }, "guarded"),
          }),
        },
      ],
    };
    defineBuild({ ...withRouteMiddleware, prod: null });
    const mounted = await mountHum(new Hono(), { dev: true });

    const res = await mounted.request("http://localhost/guarded");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="guarded-page"');
  });

  it("renders the _error page with status 500", async () => {
    const res = await app.request("http://localhost/boom");
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('id="error-page"');
  });

  it("mounts Hum without taking over Hono API error handling", async () => {
    const honoApp = new Hono();
    honoApp.use("*", async (c, next) => {
      c.header("x-app-middleware", "present");
      await next();
    });
    honoApp.onError((err, c) => c.text(`API error: ${err.message}`, 500));
    honoApp.notFound((c) => c.text("Hono 404"));
    honoApp.get("/api/boom", () => {
      throw new Error("API failure");
    });

    defineBuild({ ...manifest, prod: null });
    const mounted = await mountHum(honoApp, { dev: true });

    const apiError = await mounted.request("http://localhost/api/boom");
    expect(apiError.status).toBe(500);
    expect(await apiError.text()).toBe("API error: API failure");

    const humError = await mounted.request("http://localhost/boom");
    expect(humError.status).toBe(500);
    expect(await humError.text()).toContain('id="error-page"');
    expect(humError.headers.get("x-app-middleware")).toBe("present");

    const notFound = await mounted.request("http://localhost/nope");
    const notFoundHtml = await notFound.text();
    expect(notFound.status).toBe(404);
    expect(notFoundHtml).toContain('id="not-found"');
    expect(notFoundHtml).not.toContain("Hono 404");
  });

  it("applies Hono Basic Auth middleware to Hum pages and API routes", async () => {
    const honoApp = new Hono();
    const username = "hum-user";
    const password = "test-password";
    honoApp.use(
      "/api/private/*",
      basicAuth({ username, password, realm: "Hum test" }),
    );
    honoApp.get("/api/public", (c) => c.json({ public: true }));
    honoApp.get("/api/private/data", (c) => c.json({ secret: true }));

    const authManifest: HumManifest = {
      ...manifest,
      routes: [
        ...manifest.routes,
        {
          file: "routes/private/_middleware.ts",
          kind: "middleware",
          urlPath: "/private",
          load: async () => ({
            default: basicAuth({ username, password, realm: "Hum test" }),
          }),
        },
        {
          file: "routes/private/index.tsx",
          kind: "route",
          urlPath: "/private",
          load: async () => ({
            default: () => h("main", { id: "private-page" }, "private"),
          }),
        },
      ],
    };
    defineBuild({ ...authManifest, prod: null });
    const mounted = await mountHum(honoApp, { dev: true });

    const publicPage = await mounted.request("http://localhost/");
    expect(publicPage.status).toBe(200);
    expect(await publicPage.text()).toContain('id="home"');

    const pageDenied = await mounted.request("http://localhost/private");
    expect(pageDenied.status).toBe(401);

    const apiDenied = await mounted.request(
      "http://localhost/api/private/data",
    );
    expect(apiDenied.status).toBe(401);
    const publicApi = await mounted.request("http://localhost/api/public");
    expect(publicApi.status).toBe(200);
    expect(await publicApi.json()).toEqual({ public: true });

    const authorization = `Basic ${
      Buffer.from(`${username}:${password}`).toString("base64")
    }`;
    const pageAllowed = await mounted.request("http://localhost/private", {
      headers: { authorization },
    });
    expect(pageAllowed.status).toBe(200);
    expect(await pageAllowed.text()).toContain(
      'id="private-page"',
    );

    const apiAllowed = await mounted.request(
      "http://localhost/api/private/data",
      { headers: { authorization } },
    );
    expect(apiAllowed.status).toBe(200);
    expect(await apiAllowed.json()).toEqual({ secret: true });
  });
});
