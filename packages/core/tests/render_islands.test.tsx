import { h } from "preact";
import { signal } from "@preact/signals";

import { describe, expect, it } from "vitest";

import { Partial } from "../src/runtime/shared.js";

import { START, Counter, NestedIsland, Home } from "./helpers/render_components.js";
import { createRenderApp } from "./helpers/render_app.js";

function PartialIslandPage() {
  return h(
    Partial,
    { name: "island" },
    h(Counter, { count: START }),
  );
}

function MixedInteractionPage() {
  return h(
    "main",
    null,
    h("section", { class: signal("facet-host") }, h(NestedIsland)),
    h(Counter, { count: START }),
  );
}

const { app, get } = await createRenderApp([
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
    file: "routes/partial-island.tsx",
    kind: "route",
    urlPath: "/partial-island",
    load: async () => ({ default: PartialIslandPage }),
  },
  {
    file: "routes/mixed-interactions.tsx",
    kind: "route",
    urlPath: "/mixed-interactions",
    load: async () => ({ default: MixedInteractionPage }),
  },
], ["Counter", "NestedIsland"]);

describe("island rendering", () => {
  it("wraps islands in markers and keeps the surrounding page static", async () => {
    const html = await get("/");
    expect(html).toContain("<!--hum:island:Counter:0:-->");
    expect(html).toContain("<!--/hum:island-->");
    expect(html).toContain('id="counter"');
    expect(html).toContain("count: 3");
    expect(html).toContain("path /");
  });

  it("defers standalone island modules until their roots become visible", async () => {
    const html = await get("/");
    expect(html).toContain('import { boot } from "/_hum/runtime.js"');
    expect(html).not.toContain('import hum_island_0 from "/islands/Counter.tsx"');
    expect(html).toContain('boot({},');
    expect(html).toContain(
      '"Counter":()=>import("/islands/Counter.tsx").then((module)=>module["default"])',
    );
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

  it("preloads the client entry but not a deferred standalone island", async () => {
    const res = await app.request("http://localhost/");
    const link = res.headers.get("Link") ?? "";
    expect(link).toContain("rel=modulepreload");
    expect(link).not.toContain("/islands/Counter.tsx");
  });

  it("eagerly imports islands owned by an initial partial root", async () => {
    const res = await app.request("http://localhost/partial-island");
    const html = await res.text();
    expect(html).toContain('import hum_island_0 from "/islands/Counter.tsx"');
    expect(html).toContain('boot({"Counter":hum_island_0},');
    expect(res.headers.get("Link")).toContain("/islands/Counter.tsx");
  });

  it("keeps unrelated islands lazy on pages with facet-owned subtrees", async () => {
    const res = await app.request("http://localhost/mixed-interactions");
    const html = await res.text();
    const bootScript = html.match(
      /<script type="module"[^>]*>(import \{ boot \}[\s\S]*?)<\/script>/,
    )?.[1] ?? "";
    const eagerModules = [...bootScript.matchAll(/import hum_island_\d+ from/g)];
    const deferredModules = [...bootScript.matchAll(/:\(\)=>import\(/g)];
    const islandPreloads = [...(res.headers.get("Link") ?? "").matchAll(
      /\/islands\/[^>;]+/g,
    )];

    expect(eagerModules).toHaveLength(1);
    expect(deferredModules).toHaveLength(1);
    expect(islandPreloads).toHaveLength(1);
    expect(html).toContain(
      'import hum_island_0 from "/islands/NestedIsland.tsx"',
    );
    expect(html).toContain('"NestedIsland":hum_island_0');
    expect(html).toContain(
      '"Counter":()=>import("/islands/Counter.tsx").then((module)=>module["default"])',
    );
    expect(html).not.toContain('import hum_island_1 from "/islands/Counter.tsx"');
    expect(res.headers.get("Link")).toContain("/islands/NestedIsland.tsx");
    expect(res.headers.get("Link")).not.toContain("/islands/Counter.tsx");
  });
});
