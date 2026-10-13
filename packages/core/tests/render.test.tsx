import { type ComponentChildren, Fragment, h } from "preact";
import { type Signal, signal } from "@preact/signals";
import { Hono, type Next } from "hono";
import { basicAuth } from "hono/basic-auth";
import { Suspense } from "preact/compat";
import { describe, expect, it } from "vitest";

import {
  createApp,
  createResource,
  define,
  defineBuild,
  mountHum,
  page,
  Suspense as HumSuspense,
} from "../src/mod.js";
import { Partial } from "../src/runtime/shared.js";
import type { HumContext, HumManifest, RouteProps } from "../src/types.js";

const START: Signal<number> = signal(3);

function Counter(
  props: { count: Signal<number>; children?: ComponentChildren },
) {
  return h(
    "button",
    { id: "counter", type: "button" },
    `count: ${props.count.value}`,
    props.children,
  );
}

function App(props: { children?: ComponentChildren }) {
  return h(
    "html",
    { lang: "en" },
    // Head tags come from the `head` exports of the render chain, so the shell
    // only carries what is structural.
    h("head", null, h("meta", { charset: "utf-8" })),
    h("body", null, props.children),
  );
}

function Layout(props: { children?: ComponentChildren }) {
  return h(
    "div",
    { id: "layout" },
    h("nav", null, h("a", { href: "/" }, "home")),
    props.children,
  );
}

function Home(props: RouteProps) {
  return h(
    "main",
    { id: "home" },
    h(Counter, { count: START }, h("b", null, "slot content")),
    h("p", null, `path ${props.url.pathname}`),
  );
}

function FormPage() {
  return h(
    "form",
    { method: "post", action: "/form" },
    h("input", { name: "name" }),
  );
}

function Boom(): never {
  throw new Error("kaboom");
}

let streamReady = false;
let resolveStream: () => void = () => {};
const streamPending = new Promise<void>((resolve) => {
  resolveStream = () => {
    streamReady = true;
    resolve();
  };
});

let rejectResourceStream: () => void = () => {};
const resourceStreamPending = new Promise<string>((_resolve, reject) => {
  rejectResourceStream = () => reject(new Error("resource stream failed"));
});

let resolveRenderErrorStream: () => void = () => {};
const renderErrorStreamPending = new Promise<string>((resolve) => {
  resolveRenderErrorStream = () => resolve("ready");
});

function StreamContent() {
  if (!streamReady) throw streamPending;
  return h(
    "strong",
    null,
    "stream resolved ",
    h(Counter, { count: START }),
  );
}

function StreamingPage() {
  return h(
    Suspense,
    { fallback: h("i", null, "stream fallback") },
    h(StreamContent),
  );
}

function ResourceFailurePage(
  props: { data: { resource: ReturnType<typeof createResource<string>> } },
) {
  return h(HumSuspense, {
    resource: props.data.resource,
    fallback: h("i", null, "resource pending"),
    errorFallback: h("p", null, "resource error fallback"),
    children: (value) => h("p", null, value),
  });
}

function ResourceRenderFailurePage(
  props: { data: { resource: ReturnType<typeof createResource<string>> } },
) {
  return h(HumSuspense, {
    resource: props.data.resource,
    fallback: h("i", null, "render error pending"),
    errorFallback: h("p", null, "render error fallback"),
    children: () => h(Boom),
  });
}

function PartialsPage() {
  return h(
    "div",
    { id: "partials" },
    h(
      "div",
      { "data-hum-client-nav": true },
      h("a", { href: "/" }, "go home"),
    ),
    h(Partial, { name: "list" }, h("ul", null, h("li", null, "one"))),
  );
}

const PageView = define.page<
  {
    extra?: string;
    params?: { id: string };
  } | undefined
>(
  function PageView(
    props: RouteProps & {
      data: { extra?: string; params?: { id: string } } | undefined;
    },
  ) {
    return h(
      "div",
      { id: "page-view" },
      `extra: ${props.data?.extra ?? "none"}; ` +
        `route param: ${props.params.id ?? "none"}; ` +
        `data param: ${props.data?.params?.id ?? "none"}`,
    );
  },
);

const manifest: HumManifest = {
  islands: [
    {
      name: "Counter",
      exportName: "default",
      file: "islands/Counter.tsx",
      load: async () => ({ default: Counter }),
    },
  ],
  routes: [
    {
      file: "routes/_app.tsx",
      kind: "app",
      urlPath: "/",
      load: async () => ({
        default: App,
        head: () => h("title", null, "default"),
      }),
    },
    {
      file: "routes/_layout.tsx",
      kind: "layout",
      urlPath: "/",
      load: async () => ({ default: Layout }),
    },
    {
      file: "routes/_404.tsx",
      kind: "notFound",
      urlPath: "/",
      load: async () => ({
        default: () => h("div", { id: "not-found" }, "custom 404"),
      }),
    },
    {
      file: "routes/_error.tsx",
      kind: "error",
      urlPath: "/",
      load: async () => ({
        default: () => h("div", { id: "error-page" }, "custom error page"),
      }),
    },
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
      file: "routes/form.tsx",
      kind: "route",
      urlPath: "/form",
      load: async () => ({
        default: FormPage,
        handlers: {
          POST: async (c: {
            req: { formData: () => Promise<FormData> };
            text: (body: string) => Response;
          }) => {
            const data = await c.req.formData();
            return c.text(`posted:${String(data.get("name"))}`);
          },
        },
      }),
    },
    {
      file: "routes/page-fn.tsx",
      kind: "route",
      urlPath: "/page-fn",
      load: async () => ({
        default: PageView,
        handlers: {
          GET: () =>
            page({
              extra: "from-handler",
              params: { id: "from-data" },
            }, { status: 202 }),
        },
      }),
    },
    {
      file: "routes/page-fallthrough.tsx",
      kind: "route",
      urlPath: "/page-fallthrough",
      load: async () => ({
        default: PageView,
        handlers: {
          GET: () => {
            // Returning nothing falls through to the page component.
          },
        },
      }),
    },
    {
      file: "routes/boom.tsx",
      kind: "route",
      urlPath: "/boom",
      load: async () => ({ default: Boom }),
    },
    {
      file: "routes/seo.tsx",
      kind: "route",
      urlPath: "/seo",
      load: async () => ({
        default: () => h("p", null, "seo page"),
        // `head` as a plain JSX fragment: no props needed.
        head: h(
          Fragment,
          null,
          h("title", null, "SEO"),
          h("meta", { name: "description", content: "static seo" }),
        ),
      }),
    },
    {
      file: "routes/blogs/[id].tsx",
      kind: "route",
      urlPath: "/blogs/[id]",
      load: async () => ({
        default: () => h("p", null, "blog"),
        // `head` as a function so it can use the matched params.
        head: (props: RouteProps) =>
          h("title", null, `Blog ${props.params.id}`),
      }),
    },
    {
      file: "routes/partials.tsx",
      kind: "route",
      urlPath: "/partials",
      load: async () => ({ default: PartialsPage }),
    },
    {
      file: "routes/streaming.tsx",
      kind: "route",
      urlPath: "/streaming",
      load: async () => ({
        default: StreamingPage,
        config: { streaming: true },
        head: h("title", null, "Streaming"),
      }),
    },
    {
      file: "routes/resource-failure.tsx",
      kind: "route",
      urlPath: "/resource-failure",
      load: async () => ({
        default: ResourceFailurePage,
        config: { streaming: true },
        handlers: {
          GET: () => page({ resource: createResource(resourceStreamPending) }),
        },
      }),
    },
    {
      file: "routes/resource-render-failure.tsx",
      kind: "route",
      urlPath: "/resource-render-failure",
      load: async () => ({
        default: ResourceRenderFailurePage,
        config: { streaming: true },
        handlers: {
          GET: () =>
            page({ resource: createResource(renderErrorStreamPending) }),
        },
      }),
    },
  ],
};

// The build the app boots from, registered the way the generated module does.
defineBuild({ ...manifest, prod: null });
const app = await createApp({ dev: true });

async function get(path: string): Promise<string> {
  const res = await app.request(`http://localhost${path}`);
  return await res.text();
}

describe("island rendering", () => {
  it("wraps islands in markers and keeps the surrounding page static", async () => {
    const html = await get("/");
    expect(html).toContain("<!--hum:island:Counter:0:-->");
    expect(html).toContain("<!--/hum:island-->");
    expect(html).toContain('id="counter"');
    expect(html).toContain("count: 3");
    expect(html).toContain("path /");
  });

  it("injects the boot script with island imports and serialized props", async () => {
    const html = await get("/");
    expect(html).toContain('import { boot } from "/_hum/runtime.js"');
    expect(html).toContain('import hum_island_0 from "/islands/Counter.tsx"');
    expect(html).toContain('boot({"Counter":hum_island_0},');
  });

  it("serializes signals so they can be revived on the client", async () => {
    const html = await get("/");
    // The props payload is embedded as a JS string literal, so the quotes of
    // the encoded tags arrive escaped.
    expect(html).toContain('\\"Signal\\"');
  });

  it("turns JSX element props into slots", async () => {
    const html = await get("/");
    expect(html).toMatch(/<!--hum:slot:0:children--><b>slot content<\/b>/);
    expect(html).toContain('\\"Slot\\"');
  });

  it("preloads the client entry and islands", async () => {
    const res = await app.request("http://localhost/");
    const link = res.headers.get("Link") ?? "";
    expect(link).toContain("rel=modulepreload");
    expect(link).toContain("/islands/Counter.tsx");
  });
});

describe("head handling", () => {
  it("renders the page head into <head> and overrides the app head", async () => {
    const html = await get("/");
    expect(html).toContain("<title>Hum home</title>");
    expect(html).not.toContain("<title>default</title>");
    expect(html.indexOf("<title>Hum home</title>")).toBeLessThan(
      html.indexOf("</head>"),
    );
  });

  it("falls back to the app head when the route has none", async () => {
    const html = await get("/partials");
    expect(html).toContain("<title>default</title>");
  });

  it("supports head as a plain JSX fragment", async () => {
    const html = await get("/seo");
    expect(html).toContain("<title>SEO</title>");
    expect(html).toMatch(/name="description" content="static seo"/);
  });

  it("supports head as a function of the route props", async () => {
    expect(await get("/blogs/42")).toContain("<title>Blog 42</title>");
    expect(await get("/blogs/7")).toContain("<title>Blog 7</title>");
  });

  it("marks the active link", async () => {
    const html = await get("/");
    expect(html).toContain('aria-current="page"');
  });
});

describe("experimental streaming", () => {
  it("streams the Suspense fallback before the resolved subtree", async () => {
    const response = await app.request("http://localhost/streaming");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("stream fallback")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      html += decoder.decode(value, { stream: true });
    }
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Streaming</title>");
    resolveStream();

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain("stream resolved");
    expect(html).toContain("hum:island:Counter");
    expect(html).toContain('import hum_island_0 from "/islands/Counter.tsx"');
    expect(html).toContain("</body></html>");
  });

  it("streams the Hum Suspense error fallback when a resource rejects", async () => {
    const response = await app.request("http://localhost/resource-failure");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("resource pending")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      html += decoder.decode(value, { stream: true });
    }

    rejectResourceStream();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain("resource error fallback");
  });

  it("streams the Hum Suspense error fallback when a resumed child throws", async () => {
    const response = await app.request(
      "http://localhost/resource-render-failure",
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = "";
    const chunks: string[] = [];
    while (!html.includes("render error pending")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      html += chunk;
    }

    resolveRenderErrorStream();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      html += chunk;
    }
    const finalChunk = decoder.decode();
    chunks.push(finalChunk);
    html += finalChunk;

    expect(html).toContain("render error fallback");
    const deferredSubtree = /<preact-island\b[^>]*>[\s\S]*?<\/preact-island>/g;
    const matches = [...html.matchAll(deferredSubtree)];
    expect(matches.length).toBeGreaterThan(0);
    let chunkStart = 0;
    const chunkRanges = chunks.map((chunk) => {
      const start = chunkStart;
      chunkStart += chunk.length;
      return { start, end: chunkStart };
    });
    for (const match of matches) {
      const start = match.index!;
      const end = start + match[0].length;
      expect(
        chunkRanges.some((range) => range.start <= start && end <= range.end),
      ).toBe(true);
    }
  });
});

describe("layouts and app shell", () => {
  it("wraps the page in the layout chain and app shell", async () => {
    const html = await get("/");
    expect(html).toContain('<div id="layout">');
    expect(html).toContain('<html lang="en">');
  });
});

describe("handlers", () => {
  it("renders the page for GET when no handler is defined", async () => {
    const html = await get("/form");
    expect(html).toContain('name="name"');
  });

  it("lets handlers answer the request", async () => {
    const res = await app.request("http://localhost/form", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=hum",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("posted:hum");
  });

  it("answers 405 for unsupported methods", async () => {
    const res = await app.request("http://localhost/form", {
      method: "DELETE",
    });
    expect(res.status).toBe(405);
  });

  it("gives handlers a page() function to render their own view", async () => {
    const res = await app.request("http://localhost/page-fn");
    const html = await res.text();

    expect(res.status).toBe(202);
    // The handler's data reached the page component...
    expect(html).toContain("extra: from-handler");
    expect(html).toContain("route param: none; data param: from-data");
    // ...and the result is still a full document.
    expect(html).toContain('<div id="page-view">');
    expect(html).toContain('<div id="layout">');
    expect(html).toContain('<html lang="en">');
  });

  it("falls through to the view when a handler returns nothing", async () => {
    const html = await get("/page-fallthrough");
    expect(html).toContain('<div id="page-view">');
    expect(html).toContain("extra: none");
  });
});

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

describe("partials", () => {
  it("adds partial markers and reports client nav usage", async () => {
    const html = await get("/partials");
    expect(html).toContain("<!--hum:partial:list:0:-->");
    expect(html).toContain("<!--/hum:partial-->");
    expect(html).toContain('data-hum-client-nav="true"');
  });

  it("emits the partial state script for partial requests", async () => {
    const html = await get("/partials?_hum_partial=true");
    expect(html).toContain('id="__HUM_STATE__"');
    expect(html).not.toContain("import { boot }");
  });
});
