// @vitest-environment happy-dom
import { Fragment, h, type ComponentChildren, type ComponentType } from "preact";
import { useState } from "preact/hooks";
import { signal, type Signal } from "@preact/signals";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";

import { BuildCache } from "../src/server/build_cache.js";
import { defineIsland, Partial } from "../src/client.js";
import type { IslandTag } from "../src/shared/island_tag.js";
import { boot } from "../src/runtime/boot.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/server/preact_hooks.js";
import { flush, setupClientCleanup } from "./helpers/client.js";

const compiled = defineIsland as <P>(component: ComponentType<P>, tag: IslandTag) => ComponentType<P>;

setupClientCleanup();

describe("explicit island wrappers on the client", () => {
  it.each([false, true])("preserves hooks, slots and shared facet state (inside partial: %s)", async (insidePartial) => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const tag = { name: "i_generated", file: "components/Counter.tsx", exportName: "Counter" };
    const Counter = compiled(({ count, children }: { count: Signal<number>; children?: ComponentChildren }) => {
      const [local, setLocal] = useState(0);
      return h("section", null,
        h("button", { id: "shared", onClick: () => count.value++ }, count.value),
        h("button", { id: "local", onClick: () => setLocal(local + 1) }, local),
        children);
    }, tag);
    const buildCache = new BuildCache(true);
    buildCache.islands.set(tag.name, { ...tag, clientUrl: "/components/Counter.tsx", css: [] });
    const state = new RenderState({ url: new URL("http://localhost/"), buildCache, basePath: "/" });
    const count = signal(3);
    const html = await withRenderState(state, () => {
      const island = h(Counter, { count }, h("strong", { id: "slot" }, "server content"));
      return renderToStringAsync(h(Fragment, null,
        h("output", { id: "facet" }, count),
        insidePartial ? h(Partial, { name: "content" }, island) : island));
    });
    document.body.innerHTML = html;
    boot({ [tag.name]: Counter }, serializePayload(state));
    await flush();
    await flush();

    document.querySelector<HTMLButtonElement>("#shared")!.click();
    document.querySelector<HTMLButtonElement>("#local")!.click();
    await flush();
    expect(document.querySelector("#facet")!.textContent).toBe("4");
    expect(document.querySelector("#shared")!.textContent).toBe("4");
    expect(document.querySelector("#local")!.textContent).toBe("1");
    expect(document.querySelector("#slot")!.textContent).toBe("server content");
  });
});
