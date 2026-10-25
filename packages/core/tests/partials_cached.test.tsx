// @vitest-environment happy-dom
import { Fragment, h } from "preact";

import { describe, expect, it, vi } from "vitest";

// An app evaluates the framework entry before the route module that imports
// signals, so the Hum modules are imported first here as well.
import { renderFragment } from "./helpers/ssr.js";
import { add } from "../src/shared/events.js";
import { hum_factories } from "../src/protocol/factory.js";
import { Partial } from "../src/shared/partial.js";

import { signal } from "@preact/signals";
import { Hono } from "hono";
import { defineBuild, prerenderPages } from "../src/build.js";
import { mountHum } from "../src/mod.js";
import { applyPartials } from "../src/runtime/partials.js";

import { testFactory } from "./helpers/factory.js";
import { renderPartialResponse } from "./helpers/partial_response.js";
import { flush, setupClientCleanup, hydrate, click, text } from "./helpers/client.js";

setupClientCleanup();

describe("pre-generated partial responses", () => {
  it("loads a newly encountered factory before parsing the shared partial graph", async () => {
    const initial = await renderFragment(() => h(Partial, { name: "factory-target" }, h("p", null, "initial")));
    await hydrate(initial.html, initial.payload);
    const factory = testFactory("partial-auto-factory", (value: ReturnType<typeof signal<number>>) => () => value.value += 2);
    const response = await renderPartialResponse(() => {
      const shared = signal(5);
      return h(Fragment, null,
        h(Partial, { name: "factory-target" },
          h("output", { id: "factory-value" }, shared),
          h("button", { id: "factory-button", onClick: factory(shared) }, "+")));
    });
    delete hum_factories["partial-auto-factory"];
    // A module first encountered on this navigation registers its implementation.
    const register = () => testFactory("partial-auto-factory", (value: ReturnType<typeof signal<number>>) => () => value.value += 2);
    vi.stubGlobal("__humRegisterPartialFactory", register);
    const module = "data:text/javascript," + encodeURIComponent("globalThis.__humRegisterPartialFactory(); export {}; ");
    const body = (await response.text()).replace('"factories":[]', `"factories":[${JSON.stringify(module)}]`);
    try {
      await applyPartials(new Response(body, { headers: { "Content-Type": "text/html" } }));
      await flush();
      expect(text("#factory-value")).toBe("5");
      click("#factory-button");
      await flush();
      expect(text("#factory-value")).toBe("7");
    } finally {
      delete hum_factories["partial-auto-factory"];
      vi.unstubAllGlobals();
    }
  });

  it("revives one shared signal for multiple cached partials and a factory handler", async () => {
    function content(value: number) {
      const shared = signal(value);
      return h(Fragment, null,
        h("p", { id: "outside-cached" }, shared),
        h(Partial, { name: "cached-left" },
          h("p", { id: "cached-left" }, shared),
          h("button", { id: "cached-add", onClick: add(shared, 1) }, "+")),
        h(Partial, { name: "cached-right" }, h("p", { id: "cached-right" }, shared)));
    }
    const initial = await renderFragment(() => content(0));
    await hydrate(initial.html, initial.payload);
    defineBuild({
      prod: { buildId: "cached-partials", assetsBase: "/_hum", clientEntry: "runtime.js", islands: {} },
      islands: [],
      routes: [{
        file: "routes/next.tsx", kind: "route", urlPath: "/next",
        load: async () => ({ config: { render: { mode: "ssg" } }, default: () => content(10) }),
      }],
    });
    const app = await mountHum(new Hono(), { dev: false });
    await prerenderPages(app);
    const response = await app.request("http://localhost/next?_hum_partial=true");
    await applyPartials(response);
    await flush();
    expect(text("#cached-left")).toBe("10");
    expect(text("#cached-right")).toBe("10");
    click("#cached-add");
    await flush();
    expect(text("#cached-left")).toBe("11");
    expect(text("#cached-right")).toBe("11");
    expect(text("#outside-cached")).toBe("0");
  });
});
