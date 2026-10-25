import { Fragment, h, type ComponentChildren } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

// The framework entry is loaded before the route module that imports signals in
// a real app, which installs Hum's Preact hooks *inside* the ones a later addon
// installs: the addon's `diff` hook then runs first. These tests pin the
// behavior of that order down, so `@preact/signals` may only be imported below
// the Hum modules.
import { BuildCache } from "../src/server/build_cache.js";
import { add, setFromProp } from "../src/shared/events.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/server/preact_hooks.js";
import { signal, type Signal } from "@preact/signals";

interface Rendered {
  html: string;
  payload: Array<Record<string, unknown>>;
}

async function render(page: () => ComponentChildren): Promise<Rendered> {
  const state = new RenderState({
    url: new URL("/", "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });

  const html = await withRenderState(state, () =>
    renderToStringAsync(h(Fragment, null, page())));

  return { html, payload: state.payload as Array<Record<string, unknown>> };
}

/** The signal a payload entry holds, so instances can be compared by identity. */
function entrySignal(entry: Record<string, unknown>): Signal<unknown> {
  return entry.signal as Signal<unknown>;
}

describe("facets when an addon patches Preact after Hum", () => {
  it("records a signal prop that was replaced before the diff hook ran", async () => {
    const value = signal("hi");
    const { html, payload } = await render(() =>
      h("div", null, h("p", null, value), h("input", { type: "text", value })));

    // The child is bound through the marker its component emits.
    expect(html).toContain("<!--hum:signal:0-->hi<!--/hum:signal-->");
    // The prop is bound through `data-hum-signal` even though the addon already turned it
    // into a plain string before Hum's diff hook could see the signal.
    expect(html).toContain('data-hum-signal="{&quot;value&quot;:1}"');
    expect(html).toContain('value="hi"');

    // Both entries hold the same signal, so the client revives one instance for
    // the text and the input.
    expect(payload).toHaveLength(2);
    expect(entrySignal(payload[0])).toBe(value);
    expect(entrySignal(payload[1])).toBe(value);
  });

  it("binds a signal prop and a handler on the same element", async () => {
    const value = signal(2);
    const { html, payload } = await render(() =>
      h("input", {
        type: "number",
        value,
        onInput: setFromProp(value, "value"),
      }));

    expect(html).toContain('data-hum-signal="{&quot;value&quot;:0}"');
    expect(html).toContain('data-hum-handler="{&quot;onInput&quot;:1}"');

    expect(entrySignal(payload[0])).toBe(value);
    expect(typeof (payload[1] as { handler?: unknown }).handler).toBe("function");
  });

  it("still records page level handlers and bounds", async () => {
    const count = signal(1);
    const { html, payload } = await render(() =>
      h(
        "div",
        null,
        h("p", null, count),
        h("button", { onClick: add(count, 1, { min: 0, max: 5 }) }, "+"),
      ));

    expect(html).toContain("<!--hum:signal:0-->1<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');
    expect(entrySignal(payload[0])).toBe(count);
    expect(
      (payload[1] as { handler: (event: unknown) => void }).handler,
    ).toBeTypeOf("function");
  });
});
