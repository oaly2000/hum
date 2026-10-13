import { h, Fragment } from "preact";
import { expect, it } from "vitest";

import { createApp } from "../src/mod.js";
import type { HumManifest } from "../src/types.js";

function app(manifest: HumManifest) {
  return createApp({ manifest, dev: true });
}

it("renders a plain page through the default shell", async () => {
  const manifest: HumManifest = {
    islands: [],
    routes: [
      {
        file: "routes/index.tsx",
        kind: "route",
        urlPath: "/",
        load: async () => ({ default: () => h("div", null, "hello") }),
      },
    ],
  };
  const instance = await app(manifest);
  const res = await instance.request("http://localhost/");
  const html = await res.text();
  expect(html).toContain("hello");
});

it("renders a custom app shell", async () => {
  function Shell(props: { children?: unknown }) {
    return h(
      "html",
      null,
      h("head", null, h("meta", { charset: "utf-8" })),
      h("body", null, props.children as never),
    );
  }
  const manifest: HumManifest = {
    islands: [],
    routes: [
      {
        file: "routes/_app.tsx",
        kind: "app",
        urlPath: "/",
        load: async () => ({ default: Shell }),
      },
      {
        file: "routes/index.tsx",
        kind: "route",
        urlPath: "/",
        load: async () => ({ default: () => h("div", null, "inside") }),
      },
    ],
  };
  const instance = await app(manifest);
  const html = await (await instance.request("http://localhost/")).text();
  expect(html).toContain("inside");
});

it("renders a page with an island", async () => {
  function Counter(props: { n: number }) {
    return h("p", null, `n=${props.n}`);
  }
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
        file: "routes/index.tsx",
        kind: "route",
        urlPath: "/",
        load: async () => ({
          default: () => h(Fragment, null, h(Counter, { n: 1 })),
        }),
      },
    ],
  };
  const instance = await app(manifest);
  const html = await (await instance.request("http://localhost/")).text();
  expect(html).toContain("hum:island");
});
