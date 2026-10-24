import { type ComponentChildren, h } from "preact";

import { type Next } from "hono";

import { Suspense } from "preact/compat";
import { describe, expect, it } from "vitest";

import {
  createResource,
  createResourceKey,
  getResource,
  page,
  registerResource,
  Suspense as HumSuspense,
} from "../src/mod.js";

import type { HumContext } from "../src/types.js";

import { START, Counter } from "./helpers/render_components.js";
import { createRenderApp } from "./helpers/render_app.js";

const ROUTE_RESOURCE = createResourceKey<string>("render.test.route");
const DUPLICATE_RESOURCE = createResourceKey<string>(
  "render.test.duplicate",
);
const routeResourceResolvers = new Map<string, (value: string) => void>();
let lateResourceLookupReady = false;
let resolveLateResourceLookup: () => void = () => {};
const lateResourceLookupPending = new Promise<void>((resolve) => {
  resolveLateResourceLookup = () => {
    lateResourceLookupReady = true;
    resolve();
  };
});

function ResourceLayout(props: { children?: ComponentChildren }) {
  return h(
    "section",
    { id: "resource-layout" },
    h(HumSuspense, {
      resource: getResource(ROUTE_RESOURCE),
      fallback: h("i", null, "resource fallback"),
      errorFallback: h("i", null, "resource error"),
      children: (value) => h("strong", null, `resource:${value}`),
    }),
    props.children,
  );
}

function LateResourceLookup() {
  if (!lateResourceLookupReady) throw lateResourceLookupPending;
  return h("strong", null, `late:${getResource(ROUTE_RESOURCE).read()}`);
}

function LateResourcePage() {
  return h(
    Suspense,
    { fallback: h("i", null, "late lookup fallback") },
    h(LateResourceLookup),
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

const { app } = await createRenderApp([
  {
    file: "routes/resources/_middleware.ts",
    kind: "middleware",
    urlPath: "/resources",
    load: async () => ({
      default: async (c: HumContext, next: Next) => {
        registerResource(ROUTE_RESOURCE, async () => {
          const value = c.req.header("x-resource-value") ?? "default";
          if (value !== "streamed-resource") return value;
          return await new Promise<string>((resolve) => {
            routeResourceResolvers.set(value, resolve);
          });
        });
        await next();
      },
    }),
  },
  {
    file: "routes/resources/_layout.tsx",
    kind: "layout",
    urlPath: "/resources",
    load: async () => ({ default: ResourceLayout }),
  },
  {
    file: "routes/resources/index.tsx",
    kind: "route",
    urlPath: "/resources",
    load: async () => ({
      default: () => h("p", null, "resource route"),
      config: { streaming: true },
    }),
  },
  {
    file: "routes/resource-duplicate/_middleware.ts",
    kind: "middleware",
    urlPath: "/resource-duplicate",
    load: async () => ({
      default: async (_c: HumContext, next: Next) => {
        registerResource(DUPLICATE_RESOURCE, async () => "first");
        registerResource(DUPLICATE_RESOURCE, async () => "second");
        await next();
      },
    }),
  },
  {
    file: "routes/resource-duplicate/index.tsx",
    kind: "route",
    urlPath: "/resource-duplicate",
    load: async () => ({ default: () => h("p", null, "unreachable") }),
  },
  {
    file: "routes/resource-late-lookup/_middleware.ts",
    kind: "middleware",
    urlPath: "/resource-late-lookup",
    load: async () => ({
      default: async (_c: HumContext, next: Next) => {
        registerResource(ROUTE_RESOURCE, async () => "available");
        await next();
      },
    }),
  },
  {
    file: "routes/resource-late-lookup/index.tsx",
    kind: "route",
    urlPath: "/resource-late-lookup",
    load: async () => ({
      default: LateResourcePage,
      config: { streaming: true },
    }),
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
], ["Counter"]);

describe("experimental streaming", () => {
  it("shares typed resources from route middleware with inherited layouts", async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      app.request("http://localhost/resources", {
        headers: { "x-resource-value": "first-request" },
      }),
      app.request("http://localhost/resources", {
        headers: { "x-resource-value": "second-request" },
      }),
    ]);
    const [firstHtml, secondHtml] = await Promise.all([
      firstResponse.text(),
      secondResponse.text(),
    ]);

    expect(firstHtml).toContain("resource:first-request");
    expect(secondHtml).toContain("resource:second-request");
  });

  it("streams the fallback while a registered resource is pending", async () => {
    const response = await app.request("http://localhost/resources", {
      headers: { "x-resource-value": "streamed-resource" },
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("resource fallback")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      html += decoder.decode(value, { stream: true });
    }

    routeResourceResolvers.get("streamed-resource")!("streamed-value");
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain("resource:streamed-value");
  });

  it("keeps the request resource context during deferred stream rendering", async () => {
    const response = await app.request(
      "http://localhost/resource-late-lookup",
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("late lookup fallback")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      html += decoder.decode(value, { stream: true });
    }

    resolveLateResourceLookup();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain("late:available");
  });

  it("rejects registering the same resource key twice in one request", async () => {
    const response = await app.request(
      "http://localhost/resource-duplicate",
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('id="error-page"');
  });

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
    expect(html).toContain('()=>import("/islands/Counter.tsx")');
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
