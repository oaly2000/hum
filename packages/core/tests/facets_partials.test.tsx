// @vitest-environment happy-dom
import { Fragment, h, type ComponentChildren } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";

// An app evaluates the framework entry before the route module that imports
// signals, so the Hum modules are imported first here as well.
import { BuildCache } from "../src/build_cache.js";
import { add, setFromProp } from "../src/runtime/events.js";
import { Partial } from "../src/runtime/shared.js";
import { renderScripts } from "../src/runtime/server/document.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";
import { signal } from "@preact/signals";
import { applyPartials } from "../src/runtime/client/partials.js";
import { boot } from "../src/runtime/client/reviver.js";

interface Rendered {
  html: string;
  /** The serialized client payload. */
  payload: string;
  /** The payload entries the render recorded, in render order. */
  entries: Array<Record<string, unknown>>;
  state: RenderState;
}

async function renderFragment(
  page: () => ComponentChildren,
  pathname = "/",
): Promise<Rendered> {
  const state = new RenderState({
    url: new URL(pathname, "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });

  const html = await withRenderState(state, () =>
    renderToStringAsync(h(Fragment, null, page())));

  return {
    html,
    payload: serializePayload(state),
    entries: state.payload as Array<Record<string, unknown>>,
    state,
  };
}

/** A partial-only response, as the client navigation fetches and applies it. */
async function renderPartialResponse(
  page: () => ComponentChildren,
): Promise<Response> {
  const { html, state } = await renderFragment(
    page,
    "/?_hum_partial=true",
  );
  const doc = `<!DOCTYPE html><html><head><title>partial</title></head><body>${html}${
    renderScripts(state)
  }</body></html>`;

  return new Response(doc, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** `@preact/signals` (and the deferred island revive) write from a microtask. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Puts a server rendered page in place and hydrates it. */
async function hydrate(html: string, payload: string): Promise<void> {
  document.body.innerHTML = html;
  boot({}, payload);
  await flush();
}

function click(selector: string): void {
  document.querySelector<HTMLElement>(selector)!
    .dispatchEvent(new Event("click"));
}

function text(selector: string): string {
  return document.querySelector(selector)!.textContent ?? "";
}

describe("page level facets in a partial region on the server", () => {
  function page(outside: unknown, inside: unknown) {
    return h(
      "div",
      null,
      h("p", { id: "outside" }, outside),
      h("button", { id: "outside-button", onClick: add(outside as never, 1) }, "+"),
      h(
        Partial,
        { name: "cart" },
        h("p", { id: "inside" }, inside),
        h("button", { id: "inside-button", onClick: add(inside as never, 1) }, "+"),
      ),
    );
  }

  it("records only the region of a partial response, signals and handlers", async () => {
    const outside = signal(1);
    const inside = signal(2);

    const { html } = await renderFragment(
      () => page(outside, inside),
      "/?_hum_partial=true",
    );

    // The shell is rendered for context, but nothing of it is bound: the
    // client already owns those nodes.
    expect(html).toContain('<p id="outside">1</p>');
    expect(html).not.toContain("hum:signal:1");
    expect(html.match(/data-hum-handler=/g)).toHaveLength(1);

    // Inside the region both kinds of facet are recorded, in render order.
    expect(html).toContain("<!--hum:signal:0-->2<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');
  });

  it("records both sides of a full response", async () => {
    const outside = signal(1);
    const inside = signal(2);

    const { html, entries } = await renderFragment(() =>
      page(outside, inside));

    expect(html).toContain("<!--hum:signal:0-->1<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');
    expect(html).toContain("<!--hum:signal:2-->2<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:3}"');

    // Four entries: a signal and a handler for the shell, the same for the
    // region. Each pair holds one signal instance, shared with the text binding
    // and the handler that drives it.
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => Object.keys(entry)[0])).toEqual([
      "signal",
      "handler",
      "signal",
      "handler",
    ]);
    expect((entries[0] as { signal: unknown }).signal).toBe(outside);
    expect((entries[2] as { signal: unknown }).signal).toBe(inside);
  });
});

describe("page level facets when a partial updates", () => {
  it("revives the signals and handlers of the newly applied region", async () => {
    const qty = signal(1);
    const initial = () =>
      h(
        "div",
        null,
        h("p", { id: "shell" }, "shell"),
        h(
          Partial,
          { name: "cart" },
          h("p", { id: "count" }, qty),
          h("button", { id: "bump", onClick: add(qty, 1) }, "+"),
        ),
      );

    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    // The facets of the page that booted are live.
    expect(text("#count")).toBe("1");
    click("#bump");
    await flush();
    expect(text("#count")).toBe("2");

    // Now a partial navigation replaces the region with markup that carries its
    // own facets. They must bind to the instances revived from that response.
    const next = signal(10);
    const response = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "cart" },
        h("p", { id: "count" }, next),
        h("input", {
          id: "field",
          type: "number",
          value: next,
          onInput: setFromProp(next, "value"),
        }),
        h("button", { id: "bump", onClick: add(next, 5) }, "+5"),
      ));

    await applyPartials(response);
    await flush();

    const field = document.querySelector<HTMLInputElement>("#field")!;
    expect(text("#count")).toBe("10");
    // The bound prop is live, and the facet attributes are consumed.
    expect(field.value).toBe("10");
    expect(field.getAttribute("data-hum-signal")).toBeNull();
    expect(field.getAttribute("data-hum-handler")).toBeNull();

    // DOM -> handler -> signal -> the text binding.
    field.value = "42";
    field.dispatchEvent(new Event("input"));
    await flush();
    expect(text("#count")).toBe("42");

    // A handler without a DOM target flows into the same signal.
    click("#bump");
    await flush();
    expect(text("#count")).toBe("47");
  });

  it("leaves the shell facets of the page alone", async () => {
    const shellCount = signal(1);
    const region = signal(5);
    const page = (r: unknown) =>
      h(
        "div",
        null,
        h("p", { id: "shell-count" }, shellCount),
        h("button", { id: "shell-bump", onClick: add(shellCount, 1) }, "+"),
        h(Partial, { name: "panel" }, h("p", { id: "panel-count" }, r)),
      );

    const { html, payload } = await renderFragment(() => page(region));
    await hydrate(html, payload);

    expect(text("#shell-count")).toBe("1");

    const response = await renderPartialResponse(() =>
      page(signal(7)));

    await applyPartials(response);
    await flush();

    // The region followed the response, the shell kept its own bindings: the
    // partial response carries no facet for it, and none was touched.
    expect(text("#panel-count")).toBe("7");
    expect(text("#shell-count")).toBe("1");
    click("#shell-bump");
    await flush();
    expect(text("#shell-count")).toBe("2");
  });

  it("keeps the facets of both sides of an append live", async () => {
    const first = signal(1);
    const initial = () =>
      h(
        Partial,
        { name: "feed" },
        h("p", { id: "first" }, first),
        h("button", { id: "first-bump", onClick: add(first, 1) }, "+"),
      );

    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);
    expect(text("#first")).toBe("1");

    const more = signal(10);
    const response = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "feed", mode: "append" },
        h("p", { id: "more" }, more),
        h("button", { id: "more-bump", onClick: add(more, 5) }, "+5"),
      ));

    await applyPartials(response);
    await flush();

    expect(text("#first")).toBe("1");
    expect(text("#more")).toBe("10");

    // Both the appended content and the content that was already there answer
    // to their own handlers.
    click("#more-bump");
    await flush();
    expect(text("#more")).toBe("15");
    expect(text("#first")).toBe("1");

    click("#first-bump");
    await flush();
    expect(text("#first")).toBe("2");
  });

  it("hands a region inside a bound element to the page level host", async () => {
    const theme = signal("hero");
    const panel = signal(5);
    const page = (value: unknown) =>
      h(
        "div",
        { id: "shell", class: theme },
        h(Partial, { name: "panel" }, h("p", { id: "panel-count" }, value)),
      );

    const { html, payload } = await renderFragment(() => page(panel));
    document.body.innerHTML = html;
    boot({}, payload);
    await flush();

    // The host took the region over instead of being dropped, and the region
    // hydrated as part of that single render.
    expect(document.querySelector("#shell")!.getAttribute("data-hum-signal")).toBeNull();
    expect(text("#panel-count")).toBe("5");

    // It is still a live region, so a partial navigation finds it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await renderPartialResponse(() =>
      h(Partial, { name: "panel" }, h("p", { id: "panel-count" }, signal(7))));
    await applyPartials(response);
    await flush();
    warn.mockRestore();

    expect(warn).not.toHaveBeenCalled();
    expect(text("#panel-count")).toBe("7");
  });

  it("rebinds the region from its own response", async () => {
    const shared = signal(1);
    const initial = () =>
      h(
        "div",
        null,
        h("p", { id: "shell-count" }, shared),
        h("button", { id: "shell-bump", onClick: add(shared, 1) }, "+"),
        h(Partial, { name: "panel" }, h("p", { id: "panel-count" }, shared)),
      );

    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    // One response, one payload: the shell and the region share the instance,
    // so a click in the shell moves both.
    click("#shell-bump");
    await flush();
    expect(text("#shell-count")).toBe("2");
    expect(text("#panel-count")).toBe("2");

    // The next response is revived on its own, and the server renders the value
    // its own copy holds. The region therefore starts from that value again,
    // while the shell keeps the instance it has been driving.
    const response = await renderPartialResponse(() =>
      h(Partial, { name: "panel" }, h("p", { id: "panel-count" }, shared)));

    await applyPartials(response);
    await flush();

    expect(text("#shell-count")).toBe("2");
    expect(text("#panel-count")).toBe("1");
  });
});
