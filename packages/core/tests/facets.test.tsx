import { Fragment, h, type ComponentChildren } from "preact";
import { computed, signal, type Signal } from "@preact/signals";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import { BuildCache } from "../src/build_cache.js";
import { parse } from "../src/jsonify/parse.js";
import { tagIsland } from "../src/routing/island_tag.js";
import { CUSTOM_PARSER, type Payload } from "../src/runtime/client/reviver.js";
import {
  add,
  defineFactory,
  setFromProp,
  toggle,
} from "../src/runtime/events.js";
import { Partial } from "../src/runtime/shared.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";

interface RenderOptions {
  pathname?: string;
  /** Island components to register, as `[component, name]` pairs. */
  islands?: Array<[unknown, string]>;
}

interface Rendered {
  html: string;
  state: RenderState;
  /** The payload as it is embedded into the document. */
  serialized: string;
  /** The payload as the client runtime revives it. */
  revived: Payload;
}

/**
 * The page is built inside the render context on purpose: page level facets are
 * picked up while the page's vnodes are created, exactly like a route component
 * that returns JSX.
 */
async function renderPage(
  page: () => ComponentChildren,
  options: RenderOptions = {},
): Promise<Rendered> {
  const state = new RenderState({
    url: new URL(options.pathname ?? "/", "http://localhost"),
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

  const serialized = serializePayload(state);
  return {
    html,
    state,
    serialized,
    revived: parse<Payload>(serialized, CUSTOM_PARSER),
  };
}

function revivedSignal(revived: Payload): Signal<unknown> {
  const entry = revived.find((item) => "signal" in item);
  if (entry === undefined || !("signal" in entry)) {
    throw new Error("the payload contains no signal entry");
  }
  return entry.signal as Signal<unknown>;
}

function revivedHandler(revived: Payload): (event: unknown) => void {
  const entry = revived.find((item) => "handler" in item);
  if (entry === undefined || !("handler" in entry)) {
    throw new Error("the payload contains no handler entry");
  }
  return entry.handler as (event: unknown) => void;
}

describe("page level signals", () => {
  it("brackets a signal child in markers and records it in the payload", async () => {
    const count = signal(3);
    const { html, state, revived } = await renderPage(() => h("p", null, count));

    expect(html).toContain("<!--hum:signal:0-->3<!--/hum:signal-->");
    expect(html).not.toContain("hum:island");
    // The recorded entry is the signal itself, not a snapshot of its value.
    expect(state.payload).toEqual([{ signal: count }]);
    expect(revivedSignal(revived).value).toBe(3);
  });

  it("records a signal created with the view", async () => {
    function Page() {
      const count = signal(4);
      return h("p", null, count);
    }

    const { html, state, revived } = await renderPage(() => h(Page, null));

    expect(html).toContain("<!--hum:signal:0-->4<!--/hum:signal-->");
    expect(state.payload).toHaveLength(1);
    expect(revivedSignal(revived).value).toBe(4);
  });

  it("renders a signal prop and marks the element for rebinding", async () => {
    const value = signal("hi");
    const { html, state, revived } = await renderPage(() =>
      h("input", { type: "text", value })
    );

    expect(html).toContain('type="text"');
    expect(html).toContain('value="hi"');
    expect(html).toContain('data-hum-signal="{&quot;value&quot;:0}"');
    expect(html).not.toContain("data-hum-handler");
    expect(state.payload).toEqual([{ signal: value }]);
    expect(revivedSignal(revived).value).toBe("hi");
  });

  it("keeps computed signals as a static value", async () => {
    const count = signal(2);
    const doubled = computed(() => count.value * 2);
    const { html, state } = await renderPage(() => h("p", null, doubled));

    expect(html).toContain("<p>4</p>");
    expect(html).not.toContain("hum:signal");
    expect(state.payload).toEqual([]);
  });

  it("leaves signals inside an island to the island's own client render", async () => {
    const count = signal(3);
    function Inner(props: { count: Signal<number> }) {
      return h(
        "div",
        null,
        h("span", null, props.count),
        h("input", { value: props.count }),
      );
    }

    const { html, state } = await renderPage(() => h(Inner, { count }), {
      islands: [[Inner, "Inner"]],
    });

    // The island renders the current value, but nothing inside it is marked:
    // the island's client render binds the signal itself.
    expect(html).toContain("<span>3</span>");
    expect(html).toContain('value="3"');
    expect(html).not.toContain("hum:signal");
    expect(html).not.toContain("data-hum-signal=");
    expect(state.payload).toEqual([{ props: { count } }]);
  });

  it("records only the facets inside a partial region of a partial response", async () => {
    const outside = signal(1);
    const inside = signal(2);
    const page = () =>
      h(
        "div",
        null,
        h("p", null, outside),
        h(Partial, { name: "list" }, h("p", null, inside)),
      );

    const partial = await renderPage(page, {
      pathname: "/?_hum_partial=true",
    });
    expect(partial.html).toContain("<!--hum:signal:0-->2<!--/hum:signal-->");
    expect(partial.html).toContain("<p>1</p>");
    expect(partial.state.payload).toEqual([{ signal: inside }]);

    const full = await renderPage(page);
    expect(full.html).toContain("<!--hum:signal:0-->1<!--/hum:signal-->");
    expect(full.html).toContain("<!--hum:signal:1-->2<!--/hum:signal-->");
    expect(full.state.payload).toEqual([
      { signal: outside },
      { signal: inside },
    ]);
  });
});

describe("page level handlers", () => {
  it("shares one signal instance between a text binding and a handler", async () => {
    const count = signal(1);
    const { html, revived } = await renderPage(() =>
      h(
        "div",
        null,
        h("p", null, count),
        h("button", { onClick: add(count, 1) }, "+"),
      )
    );

    expect(html).toContain("<!--hum:signal:0-->1<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');

    // Both payload entries point at the same revived signal, so the handler
    // drives the text the page already bound.
    const sig = revivedSignal(revived);
    revivedHandler(revived)({ currentTarget: null });
    expect(sig.value).toBe(2);
  });

  it("coerces the value read off the event target to the signal's type", async () => {
    const value = signal(5);
    const { revived } = await renderPage(() =>
      h("input", {
        type: "number",
        value,
        onInput: setFromProp(value, "value"),
      })
    );

    const sig = revivedSignal(revived);
    const handler = revivedHandler(revived);
    handler({ currentTarget: { value: "42" } });
    expect(sig.value).toBe(42);
    handler({ currentTarget: { value: "" } });
    expect(sig.value).toBe(0);
  });

  it("flips a boolean signal", async () => {
    const open = signal(false);
    const { html, revived } = await renderPage(() =>
      h(
        "div",
        null,
        h("p", null, open),
        h("button", { onClick: toggle(open) }, "toggle"),
      )
    );

    // A boolean signal renders as the string the DOM would show.
    expect(html).toContain("hum:signal:0");
    const sig = revivedSignal(revived);
    expect(sig.value).toBe(false);
    revivedHandler(revived)({});
    expect(sig.value).toBe(true);
  });

  it("rejects a page level closure instead of dropping it silently", async () => {
    await expect(renderPage(() => h("button", { onClick: () => {} }, "x")))
      .rejects.toThrow(/@humjs\/core\/events/);
  });

  it("rejects a closure on an event name an addon lowercased", async () => {
    // `preact/compat` rewrites `onInput`—and the `onChange` of a text input—to
    // the lowercased `oninput` before Hum sees the vnode, so the guard has to
    // recognize that shape as an event too.
    await expect(
      renderPage(() => h("input", { type: "text", oninput: () => {} })),
    ).rejects.toThrow(/@humjs\/core\/events/);
  });

  it("serializes the factory call and revives it as a function", async () => {
    const count = signal(0);
    const { serialized, revived } = await renderPage(() =>
      h("button", { onClick: add(count, 2) }, "+")
    );

    expect(serialized).toContain('"Fn"');
    expect(serialized).toContain('"add"');
    expect(typeof revivedHandler(revived)).toBe("function");
  });

  it("round-trips a factory the app defined itself", async () => {
    const selectRow = testFactory(
      "selectRow",
      (selected: Signal<string | null>, id: string) => () => {
        selected.value = id;
      },
    );

    const selected = signal<string | null>(null);
    const { serialized, revived } = await renderPage(() =>
      h(
        "div",
        null,
        h("p", null, selected),
        h("button", { onClick: selectRow(selected, "row-3") }, "pick"),
      ));

    expect(serialized).toContain('"selectRow"');

    // The handler is rebuilt from the factory name, and the signal it received
    // is the one the page bound, so the server's copy stays untouched.
    revivedHandler(revived)({});
    expect(revivedSignal(revived).value).toBe("row-3");
    expect(selected.value).toBeNull();
  });
});

// Model the compiler's hidden identity argument without exposing it publicly.
function testFactory<A extends unknown[], R>(id: string, fn: (...args: A) => R): (...args: A) => R {
  return (defineFactory as (fn: (...args: A) => R, id: string) => (...args: A) => R)(fn, id);
}
