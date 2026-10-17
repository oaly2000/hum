/** @jsxImportSource preact */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createPageService, defineBuild, mountHum, page, planPages, prerenderPages,
  createMemoryPageStore, type HumBuild, type PageRenderMode, type PageServiceOptions, type RouteModule,
} from "../src/mod.js";
import { Partial } from "../src/shared.js";

function build(routes: Record<string, RouteModule>): HumBuild {
  return {
    prod: { buildId: "pages-test", assetsBase: "/_hum", clientEntry: "runtime.js", islands: {} },
    origin: "https://example.com",
    islands: [],
    routes: Object.entries(routes).map(([urlPath, mod]) => ({
      file: `routes${urlPath === "/" ? "/index" : urlPath}.tsx`,
      kind: "route", urlPath, load: async () => mod as Record<string, unknown>,
    })),
  };
}

async function fixture(policy: PageRenderMode, options: PageServiceOptions = {}, dev = false) {
  let renders = 0;
  let fail = false;
  let post = 0;
  const source = build({
    "/posts/[slug]": {
      config: { render: policy },
      handlers: {
        GET: async (c) => {
          renders++;
          if (fail) throw new Error("generation failed");
          return page({ n: renders, user: c.req.header("authorization") ?? "public" });
        },
        POST: (c) => c.text(`post-${++post}`),
      },
      default: ({ params, url, data }: any) => <Partial name="post">
        <p>{params.slug}:{data.n}:{data.user}:{url.origin}</p>
      </Partial>,
    },
  });
  defineBuild(source);
  const app = new Hono();
  let requests = 0;
  app.use("*", async (c, next) => {
    const request = ++requests;
    await next();
    c.header("x-request", String(request));
  });
  const pages = createPageService(options);
  const mounted = await mountHum(app, { pages, dev, logger: { info() {}, debug() {}, warn() {}, error() {} } });
  return { app: mounted, source, pages, renders: () => renders, fail: () => { fail = true; } };
}

describe("page generation planning", () => {
  it("expands single slugs and complete multi-parameter paths", async () => {
    const source = build({
      "/about": { config: { render: { mode: "ssg" } } },
      "/posts/[slug]": { config: { render: { mode: "ssg", slugs: ["hello", "/posts/world"] } } },
      "/[lang]/news/[id]": { config: { render: { mode: "ssg", slugs: ["/en/news/42"] } } },
      "/files/[...path]": { config: { render: { mode: "ssg", slugs: ["a/b"] } } },
      "/optional/[[id]]": { config: { render: { mode: "ssg", slugs: ["", "42"] } } },
      "/on-demand/[id]": { config: { render: { mode: "isg", revalidate: 60 } } },
    });
    expect((await planPages(source)).map((p) => p.path).sort()).toEqual([
      "/about", "/en/news/42", "/files/a/b", "/optional", "/optional/42", "/posts/hello", "/posts/world",
    ]);
  });

  it.each([
    [{ mode: "ssg" }, "require slugs"],
    [{ mode: "ssg", slugs: ["a", "/posts/a/"] }, "duplicate"],
    [{ mode: "ssg", slugs: ["/other/a"] }, "does not match"],
    [{ mode: "ssg", slugs: ["../a"] }, "invalid page path"],
    [{ mode: "ssg", slugs: ["/posts/a?query=1"] }, "invalid page path"],
    [{ mode: "ssg", slugs: ["/posts/%2e%2e"] }, "invalid page path"],
    [{ mode: "isg", revalidate: 0 }, "positive"],
  ])("rejects invalid generation plans: %j", async (policy, error) => {
    await expect(planPages(build({ "/posts/[slug]": { config: { render: policy as PageRenderMode } } })))
      .rejects.toThrow(error);
  });

  it("allows an empty SSG table and rejects shadowed output", async () => {
    expect(await planPages(build({ "/posts/[slug]": { config: { render: { mode: "ssg", slugs: [] } } } }))).toEqual([]);
    await expect(planPages(build({
      "/posts/[slug]": { config: { render: { mode: "ssg", slugs: ["reserved"] } } },
      "/posts/reserved": {},
    }))).rejects.toThrow("shadowed");
  });
});

describe("the unified page service", () => {
  it("pre-generates SSG once and serves both representations, HEAD, 404 and POST", async () => {
    const f = await fixture({ mode: "ssg", slugs: ["hello"] });
    const generated = await prerenderPages(f.app);
    expect(Object.keys(generated)).toEqual(["/posts/hello"]);
    const response = await f.app.request("/posts/hello?ignored=1", { headers: { authorization: "secret" } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("hello:1:public:https://example.com");
    expect(html).not.toContain('__HUM_STATE__');
    const partial = await f.app.request("/posts/hello?_hum_partial=true");
    const partialHtml = await partial.text();
    expect(partialHtml).toContain("hello:1:public:https://example.com");
    expect(partialHtml).toContain('id="__HUM_STATE__"');
    expect(partialHtml).not.toContain("boot(");
    expect(partial.headers.get("x-request")).not.toBe(response.headers.get("x-request"));
    const head = await f.app.request("/posts/hello", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await f.app.request("/posts/missing")).status).toBe(404);
    expect(await (await f.app.request("/posts/hello", { method: "POST" })).text()).toBe("post-1");
    expect(f.renders()).toBe(1);
  });

  it("serves a pre-generated build after mounting a new app", async () => {
    const f = await fixture({ mode: "ssg", slugs: ["hello"] });
    const pages = await f.pages.prerender();
    defineBuild({ ...f.source, pages });
    const app = await mountHum(new Hono(), { dev: false });
    expect((await app.request("/posts/hello")).status).toBe(200);
    expect(f.renders()).toBe(1);
  });

  it("assembles cached representations without rewriting inline script contents", async () => {
    defineBuild(build({ "/": {
      config: { render: { mode: "ssg" } },
      default: () => <div>
        <script dangerouslySetInnerHTML={{ __html: 'window.example = "</body>";' }} />
        <Partial name="content"><p>cached</p></Partial>
      </div>,
    } }));
    const app = await mountHum(new Hono(), { dev: false });
    const generated = await prerenderPages(app);
    expect(generated["/"].body).toContain('window.example = "</body>";');
    expect(generated["/"].partialBody).toContain('window.example = "</body>";</script>');
    expect(generated["/"].partialBody).toContain('id="__HUM_STATE__"');
  });

  it("applies outer Hono body transforms once on every cached response", async () => {
    defineBuild(build({ "/": {
      config: { render: { mode: "ssg" } },
      default: () => <Partial name="content"><p>content</p></Partial>,
    } }));
    const app = new Hono();
    app.use("*", async (c, next) => {
      await next();
      const response = c.res;
      c.res = new Response(await response.text() + "<!--outer-->", response);
    });
    const mounted = await mountHum(app, { dev: false });
    await prerenderPages(mounted);
    for (const path of ["/", "/?_hum_partial=true"]) {
      const html = await (await mounted.request(path)).text();
      expect(html.match(/<!--outer-->/g)).toHaveLength(1);
    }
  });

  it("retains directory middleware headers without rerunning it on cache hits", async () => {
    let calls = 0;
    const source = build({ "/": {
      config: { render: { mode: "ssg" } }, default: () => <p>cached</p>,
    } });
    source.routes.push({
      file: "routes/_middleware.ts", kind: "middleware", urlPath: "/",
      load: async () => ({ default: async (c: any, next: () => Promise<void>) => {
        calls++;
        await next();
        c.header("x-directory", "generated");
      } }),
    });
    defineBuild(source);
    const app = await mountHum(new Hono(), { dev: false });
    await prerenderPages(app);
    const response = await app.request("/");
    expect(response.headers.get("x-directory")).toBe("generated");
    expect(calls).toBe(1);
  });

  it("blocks and coalesces ISG misses and expiry, retaining old output on errors", async () => {
    let now = 0;
    const f = await fixture({ mode: "isg", revalidate: 10 }, { now: () => now });
    const first = await Promise.all(Array.from({ length: 5 }, () => f.app.request("/posts/new")));
    expect(first.every((r) => r.status === 200)).toBe(true);
    expect(f.renders()).toBe(1);
    now = 10_000;
    const refreshed = await Promise.all(Array.from({ length: 5 }, () => f.app.request("/posts/new")));
    expect(f.renders()).toBe(2);
    expect(await refreshed[0].text()).toContain("new:2:public");
    now = 20_000;
    f.fail();
    expect(await (await f.app.request("/posts/new")).text()).toContain("new:2:public");
  });

  it("returns stale output while an entry-provided executor owns regeneration", async () => {
    let now = 0;
    const tasks: Promise<void>[] = [];
    const f = await fixture({ mode: "isg", revalidate: 1 }, {
      now: () => now,
      background: (task) => { tasks.push(task); },
    });
    await f.app.request("/posts/hello");
    now = 1000;
    expect(await (await f.app.request("/posts/hello")).text()).toContain("hello:1:public");
    await Promise.all(tasks);
    expect(await (await f.app.request("/posts/hello")).text()).toContain("hello:2:public");
  });

  it("isolates a shared external store by build and forwards Worker bindings and context", async () => {
    const store = createMemoryPageStore();
    const source = build({ "/": {
      config: { render: { mode: "isg", revalidate: 60 } },
      handlers: { GET: (c) => {
        c.executionCtx.waitUntil(Promise.resolve());
        return page({ message: c.env.message });
      } },
      default: ({ data }: any) => <p>{data.message}</p>,
    } });
    const makeApp = async (id: string) => {
      defineBuild({ ...source, prod: { ...source.prod!, buildId: id } });
      return mountHum(new Hono(), { dev: false, pages: createPageService({ store }) });
    };
    const tasks: Promise<unknown>[] = [];
    const context = { waitUntil: (task: Promise<unknown>) => { tasks.push(task); }, passThroughOnException() {} };
    const first = await makeApp("first-build");
    const request = () => new Request("https://example.com/");
    expect(await (await first.fetch(request(), { message: "first" }, context)).text()).toContain("first");
    const second = await makeApp("second-build");
    expect(await (await second.fetch(request(), { message: "second" }, context)).text()).toContain("second");
    // A new service for the same build reads the previously persisted page.
    const restarted = await makeApp("first-build");
    expect(await (await restarted.fetch(request(), { message: "changed" }, context)).text()).toContain("first");
    await Promise.all(tasks);
  });

  it("restricts ISG fallback and renders fresh pages in development", async () => {
    const f = await fixture({ mode: "isg", revalidate: 60, slugs: ["hello"], fallback: false });
    await f.pages.prerender();
    expect((await f.app.request("/posts/missing")).status).toBe(404);
    const dev = await fixture({ mode: "ssg", slugs: ["hello"] }, {}, true);
    expect((await dev.app.request("/posts/not-in-table")).status).toBe(200);
    await dev.app.request("/posts/not-in-table");
    expect(dev.renders()).toBe(2);
  });

  it("rejects non-public output, streaming and missing SSG artifacts", async () => {
    const f = await fixture({ mode: "ssg", slugs: ["hello"] });
    expect((await f.app.request("/posts/hello")).status).toBe(500);
    const source = build({ "/": {
      config: { render: { mode: "ssg" } },
      handlers: { GET: (c) => { c.header("Set-Cookie", "session=private"); return page(); } },
      default: () => <p>private</p>,
    } });
    defineBuild(source);
    const app = await mountHum(new Hono(), { dev: false });
    await expect(prerenderPages(app)).rejects.toThrow("cacheable HTML");
    source.routes[0].load = async () => ({ config: { render: { mode: "ssg" }, streaming: true } });
    await expect(planPages(source)).rejects.toThrow("streaming");
  });
});
