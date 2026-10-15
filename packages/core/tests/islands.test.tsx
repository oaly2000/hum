// @vitest-environment happy-dom
import { Fragment, h, type ComponentChildren } from "preact";
import { signal } from "@preact/signals";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";

import { BuildCache } from "../src/build_cache.js";
import { tagIsland } from "../src/routing/island_tag.js";
import { boot, ISLAND_REGISTRY } from "../src/runtime/client/reviver.js";
import { setFromProp } from "../src/runtime/events.js";
import { Partial } from "../src/runtime/shared.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";

/** An island that renders the slot it was handed as `children`. */
function Card(props: { title?: string; children?: ComponentChildren }) {
  return h(
    "article",
    { id: "card" },
    h("h4", { id: "card-title" }, props.title),
    props.children,
  );
}

interface RenderOptions {
  /** Islands the server knows about, as `[component, name]`. */
  islands?: Array<[unknown, string]>;
}

async function render(
  page: () => ComponentChildren,
  options: RenderOptions = {},
): Promise<{ html: string; payload: string }> {
  const state = new RenderState({
    url: new URL("/", "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });
  for (const [component, name] of options.islands ?? []) {
    const file = `islands/${name}.tsx`;
    state.buildCache.islands.set(name, {
      name,
      exportName: "default",
      file,
      clientUrl: `/${file}`,
      css: [],
    });
    tagIsland(component, { name, file, exportName: "default" });
  }

  const html = await withRenderState(state, () =>
    renderToStringAsync(h(Fragment, null, page())));
  return { html, payload: serializePayload(state) };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("slots reach an island through either revive path", () => {
  async function hydrate(
    page: () => ComponentChildren,
    islands: Record<string, unknown> = { Card },
  ): Promise<string> {
    const { html, payload } = await render(page, {
      islands: [[Card, "Card"]],
    });
    document.body.innerHTML = html;
    boot(islands as never, payload);
    await flush();
    return document.body.innerHTML;
  }

  it("revives a slot of an island that is its own root", async () => {
    const html = await hydrate(() =>
      h(Card, { title: "direct" }, h("b", { id: "slot" }, "slot content")));

    expect(document.querySelector("#card-title")!.textContent).toBe("direct");
    expect(document.querySelector("#slot")!.textContent).toBe("slot content");
    // The markers are consumed, not left behind in the DOM.
    expect(html).not.toContain("hum:slot");
  });

  it("revives a slot of an island inside a partial region", async () => {
    const html = await hydrate(() =>
      h(
        Partial,
        { name: "box" },
        h(Card, { title: "in region" }, h("b", { id: "slot" }, "slot content")),
      ));

    expect(document.querySelector("#card-title")!.textContent).toBe("in region");
    expect(document.querySelector("#slot")!.textContent).toBe("slot content");
    expect(html).not.toContain("hum:slot");
  });
});

describe("hydration is scheduled", () => {
  it("leaves the document untouched until the scheduled pass runs", async () => {
    let renders = 0;
    function Island() {
      renders++;
      return h("i", { id: "inner" }, "inner");
    }
    const theme = signal("hero");
    const { html, payload } = await render(
      () => h("div", { id: "host", class: theme }, h(Island, null)),
      { islands: [[Island, "Island"]] },
    );

    document.body.innerHTML = html;
    renders = 0;
    boot({ Island }, payload);

    // Neither the island nor the bound element is live when `boot` returns.
    expect(renders).toBe(0);
    expect(document.querySelector("#host")!.getAttribute("data-hum-signal")).not.toBeNull();

    await flush();

    // One scheduled pass renders the host, and the island inside it with it.
    expect(renders).toBe(1);
    expect(document.querySelector("#host")!.getAttribute("data-hum-signal")).toBeNull();
  });
});

describe("standalone islands activate when visible", () => {
  it("waits for the observer and disconnects it after hydration", async () => {
    let renders = 0;
    function Island() {
      renders++;
      return h("article", { id: "visible-island" }, "ready");
    }
    const { html, payload } = await render(() => h(Island, null), {
      islands: [[Island, "Island"]],
    });
    const loadIsland = vi.fn(async () => Island);

    const observers: Array<{
      callback: IntersectionObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
    }> = [];
    class TestIntersectionObserver {
      callback: IntersectionObserverCallback;
      disconnect = vi.fn();
      observe = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
    }
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: TestIntersectionObserver,
    });

    try {
      document.body.innerHTML = html;
      renders = 0;
      ISLAND_REGISTRY.clear();
      boot({}, payload, { Island: loadIsland });
      await flush();

      expect(renders).toBe(0);
      expect(loadIsland).not.toHaveBeenCalled();
      expect(observers).toHaveLength(1);
      expect(observers[0].observe).toHaveBeenCalledOnce();

      observers[0].callback(
        [{
          isIntersecting: false,
          intersectionRatio: 0,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      expect(renders).toBe(0);

      observers[0].callback(
        [{
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await flush();
      expect(loadIsland).toHaveBeenCalledOnce();
      expect(renders).toBe(1);
      expect(observers[0].disconnect).toHaveBeenCalledOnce();
      expect(document.querySelector("#visible-island")!.textContent).toBe(
        "ready",
      );
    } finally {
      if (previous === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(globalThis, "IntersectionObserver", previous);
      }
    }
  });

  it("does not hydrate if the island unit is disposed before becoming visible", async () => {
    let renders = 0;
    function Island() {
      renders++;
      return h("article", null, "ready");
    }
    const { html, payload } = await render(() => h(Island, null), {
      islands: [[Island, "Island"]],
    });
    const loadIsland = vi.fn(async () => Island);
    let callback: IntersectionObserverCallback | undefined;
    const disconnectSpy = vi.fn();
    class TestIntersectionObserver {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }

      observe(): void {}
      disconnect = disconnectSpy;
    }
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: TestIntersectionObserver,
    });

    try {
      document.body.innerHTML = html;
      renders = 0;
      ISLAND_REGISTRY.clear();
      const manager = boot({}, payload, { Island: loadIsland });
      await flush();
      expect(renders).toBe(0);

      manager.unregister("island:Island:0");
      expect(disconnectSpy).toHaveBeenCalledOnce();
      callback?.(
        [{
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await flush();
      expect(renders).toBe(0);
      expect(loadIsland).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(globalThis, "IntersectionObserver", previous);
      }
    }
  });

  it("reports lazy import failure and retries when the island re-enters view", async () => {
    let renders = 0;
    function Island() {
      renders++;
      return h("article", { id: "server-markup" }, "ready");
    }
    const { html, payload } = await render(() => h(Island, null), {
      islands: [[Island, "Island"]],
    });
    let attempts = 0;
    const loadIsland = vi.fn(async () => {
      if (attempts++ === 0) throw new Error("network failure");
      return Island;
    });
    let callback: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }

      observe(): void {}
      disconnect(): void {}
    }
    const previousObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: TestIntersectionObserver,
    });

    try {
      document.body.innerHTML = html;
      renders = 0;
      ISLAND_REGISTRY.clear();
      boot({}, payload, { Island: loadIsland });
      await flush();
      callback?.(
        [{
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await flush();

      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0]).toBe(
        'Hum: failed to load or hydrate island "Island".',
      );
      expect(document.querySelector("#server-markup")!.textContent).toBe(
        "ready",
      );
      expect(renders).toBe(0);

      callback?.(
        [{
          isIntersecting: false,
          intersectionRatio: 0,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      callback?.(
        [{
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await flush();
      expect(loadIsland).toHaveBeenCalledTimes(2);
      expect(renders).toBe(1);
    } finally {
      error.mockRestore();
      if (previousObserver === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(
          globalThis,
          "IntersectionObserver",
          previousObserver,
        );
      }
    }
  });

  it("uses the new lazy module after a detached runtime is booted again", async () => {
    function ServerIsland() {
      return h("p", null, "server");
    }
    function OldIsland() {
      return h("p", null, "old");
    }
    function NewIsland() {
      return h("p", null, "new");
    }
    const { html, payload } = await render(() => h(ServerIsland, null), {
      islands: [[ServerIsland, "Island"]],
    });
    const oldLoader = vi.fn(async () => OldIsland);
    const newLoader = vi.fn(async () => NewIsland);
    const previousObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    });
    try {
      document.body.innerHTML = html;
      boot({}, payload, { Island: oldLoader });
      await flush();
      expect(document.body.textContent).toBe("old");

      document.body.replaceChildren();
      document.body.innerHTML = html;
      boot({}, payload, { Island: newLoader });
      await flush();

      expect(newLoader).toHaveBeenCalledOnce();
      expect(document.body.textContent).toBe("new");
    } finally {
      if (previousObserver === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(globalThis, "IntersectionObserver", previousObserver);
      }
    }
  });

  it("does not retain lazy loaders from a detached runtime", async () => {
    function ServerIsland() {
      return h("p", null, "server");
    }
    function OldIsland() {
      return h("p", null, "stale");
    }
    const { html, payload } = await render(() => h(ServerIsland, null), {
      islands: [[ServerIsland, "Island"]],
    });
    const oldLoader = vi.fn(async () => OldIsland);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    });

    try {
      document.body.innerHTML = html;
      boot({}, payload, { Island: oldLoader });
      await flush();
      expect(document.body.textContent).toBe("stale");

      document.body.replaceChildren();
      document.body.innerHTML = html;
      boot({}, payload);
      await flush();

      expect(oldLoader).toHaveBeenCalledOnce();
      expect(document.body.textContent).toBe("server");
      expect(error).toHaveBeenCalledWith('Hum: unknown island "Island".');
    } finally {
      error.mockRestore();
      if (previousObserver === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(globalThis, "IntersectionObserver", previousObserver);
      }
    }
  });
});

describe("an island whose module never loaded", () => {
  it("keeps hydrating the rest of the region and its own markup", async () => {
    function Missing(props: { children?: ComponentChildren }) {
      return h("article", { id: "missing" }, props.children);
    }

    const count = signal(1);
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };

    try {
      const { html, payload } = await render(
        () =>
          h(
            Partial,
            { name: "box" },
            h(
              Missing,
              null,
              h("b", { id: "slot" }, "slot content"),
            ),
            h("p", { id: "count" }, count),
            h("input", {
              id: "field",
              value: count,
              onInput: setFromProp(count, "value"),
            }),
          ),
        { islands: [[Missing, "Missing"]] },
      );

      // The client never learns about `Missing`, like a failed module import.
      ISLAND_REGISTRY.clear();
      document.body.innerHTML = html;
      boot({}, payload);
      await flush();
    } finally {
      console.error = originalError;
    }

    expect(errors.join("\n")).toContain('unknown island "Missing"');

    // The island's own markup, including the slot it was handed, is kept.
    expect(document.querySelector("#slot")!.textContent).toBe("slot content");

    // The rest of the region still hydrated: typing drives the shared signal.
    const field = document.querySelector<HTMLInputElement>("#field")!;
    field.value = "9";
    field.dispatchEvent(new Event("input"));
    await flush();
    expect(document.querySelector("#count")!.textContent).toBe("9");
  });
});
