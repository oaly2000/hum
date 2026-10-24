// @vitest-environment happy-dom
import { Fragment, h, type ComponentChildren } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { afterEach, describe, expect, it, vi } from "vitest";

// An app evaluates the framework entry before the route module that imports
// signals, so the Hum modules are imported first here as well.
import { BuildCache } from "../src/build_cache.js";
import { add, defineFactory, hum_factories, setFromProp } from "../src/runtime/events.js";
import { Partial } from "../src/runtime/shared.js";
import { renderScripts } from "../src/runtime/server/document.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";
import { signal } from "@preact/signals";
import { Hono } from "hono";
import { defineBuild, mountHum, prerenderPages } from "../src/mod.js";
import {
  applyPartials,
  startPartialNavigation,
} from "../src/runtime/client/partials.js";
import {
  ACTIVE_PARTIALS,
  boot,
  currentInteractionManager,
} from "../src/runtime/client/reviver.js";

afterEach(() => {
  vi.useRealTimers();
});

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
  title = "partial",
): Promise<Response> {
  const { html, state } = await renderFragment(
    page,
    "/?_hum_partial=true",
  );
  const doc = `<!DOCTYPE html><html><head><title>${title}</title></head><body>${html}${
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

describe("interaction runtime boot lifecycle", () => {
  it("preserves a connected manager and its DOM when a second boot is rejected", async () => {
    const { html, payload } = await renderFragment(() =>
      h(Partial, { name: "current" }, h("p", null, "owned")));
    document.body.innerHTML = html;
    const manager = boot({}, payload);
    const domAfterBoot = document.body.innerHTML;

    expect(() => boot({}, payload)).toThrow(/booted again/);
    expect(currentInteractionManager()).toBe(manager);
    expect(document.body.innerHTML).toBe(domAfterBoot);

    await flush();
    expect(document.body.textContent).toContain("owned");
  });

  it("clears a detached manager when replacement boot fails", async () => {
    const { html, payload } = await renderFragment(() =>
      h(Partial, { name: "current" }, h("p", null, "owned")));
    document.body.innerHTML = html;
    boot({}, payload);
    document.body.replaceChildren();

    expect(() => boot({}, "{")).toThrow();
    expect(currentInteractionManager()).toBeNull();

    document.body.innerHTML = html;
    expect(() => boot({}, payload)).not.toThrow();
    await flush();
    expect(document.body.textContent).toContain("owned");
  });
});

describe("page level facets when a partial updates", () => {
  it("keeps the current URL when a client navigation request fails", async () => {
    const initial = () =>
      h(
        "div",
        { "data-hum-client-nav": "" },
        h("a", { href: "/network-offline" }, "Offline"),
        h(Partial, { name: "route" }, h("p", { id: "content" }, "current")),
      );
    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);
    const currentUrl = location.href;
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      document.querySelector("a")!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );

      await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
      expect(error).toHaveBeenCalledWith(
        "Hum: client navigation failed; keeping the current page.",
        networkError,
      );
      expect(location.href).toBe(currentUrl);
      expect(text("#content")).toBe("current");
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each([true, false])(
    "keeps URL highlights in sync (View Transitions support: %s)",
    async (supportsViewTransitions) => {
      const initial = () =>
        h(
          "div",
          { "data-hum-client-nav": "" },
          h("a", { href: "/next", "data-current": "false" }, "Next"),
          h(Partial, { name: "route" }, h("p", { id: "content" }, "old")),
        );
      const { html, payload } = await renderFragment(initial);
      await hydrate(html, payload);

      const response = await renderPartialResponse(() =>
        h(Partial, { name: "route" }, h("p", { id: "content" }, "new")));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

      const originalDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "startViewTransition",
      );
      let callbackDone: Promise<void> | undefined;
      const startViewTransition = vi.fn((update: () => Promise<void>) => {
        callbackDone = update();
        return { updateCallbackDone: callbackDone };
      });
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value: supportsViewTransitions ? startViewTransition : undefined,
      });

      try {
        document.querySelector("a")!.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            button: 0,
            cancelable: true,
          }),
        );
        if (supportsViewTransitions) {
          await vi.waitFor(() =>
            expect(startViewTransition).toHaveBeenCalledOnce()
          );
          await callbackDone;
        } else {
          await vi.waitFor(() => expect(text("#content")).toBe("new"));
          expect(startViewTransition).not.toHaveBeenCalled();
        }

        expect(text("#content")).toBe("new");
        expect(document.querySelector("a")?.getAttribute("data-current")).toBe(
          "true",
        );
        expect(document.querySelector("a")?.getAttribute("aria-current")).toBe(
          "page",
        );
        await vi.waitFor(() => expect(location.pathname).toBe("/next"));
      } finally {
        if (originalDescriptor === undefined) {
          Reflect.deleteProperty(document, "startViewTransition");
        } else {
          Object.defineProperty(
            document,
            "startViewTransition",
            originalDescriptor,
          );
        }
        vi.unstubAllGlobals();
      }
    },
  );

  it("shares response state between separately updated partial roots", async () => {
    const initial = () =>
      h(
        "div",
        null,
        h(Partial, { name: "left" }, h("p", { id: "left" }, "old")),
        h(Partial, { name: "right" }, h("p", { id: "right" }, "old")),
      );
    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    const shared = signal(5);
    const response = await renderPartialResponse(() =>
      h(
        "div",
        null,
        h(
          Partial,
          { name: "left" },
          h("button", { id: "change", onClick: add(shared, 1) }, "+"),
        ),
        h(Partial, { name: "right" }, h("p", { id: "right" }, shared)),
      ));
    expect(ACTIVE_PARTIALS.has("left")).toBe(true);
    expect(ACTIVE_PARTIALS.has("right")).toBe(true);
    expect(ACTIVE_PARTIALS.get("left")).not.toBe(ACTIVE_PARTIALS.get("right"));
    await applyPartials(response);
    await flush();

    expect(document.body.innerHTML).toContain('id="change"');
    click("#change");
    await flush();
    expect(text("#right")).toBe("6");
  });

  it("routes a nested partial update through its owning partial root", async () => {
    const initial = () =>
      h(
        Partial,
        { name: "page" },
        h("h1", null, "Page"),
        h(Partial, { name: "details" }, h("p", { id: "details" }, "initial")),
      );
    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    const response = await renderPartialResponse(() =>
      h(Partial, { name: "details" }, h("p", { id: "details" }, "updated")));
    await applyPartials(response);
    await flush();

    expect(text("h1")).toBe("Page");
    expect(text("#details")).toBe("updated");
  });

  it("registers nested partial targets introduced by a replacement", async () => {
    const initial = () =>
      h(
        Partial,
        { name: "page" },
        h(Partial, { name: "old-details" }, h("p", null, "old")),
      );
    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    const replaceParent = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "page" },
        h(Partial, { name: "new-details" }, h("p", { id: "details" }, "first")),
      ));
    await applyPartials(replaceParent);
    await flush();
    expect(currentInteractionManager()?.update("partial", "old-details", () => {}))
      .toBe(false);
    expect(currentInteractionManager()?.update("partial", "new-details", () => {}))
      .toBe(true);

    const updateChild = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "new-details" },
        h("p", { id: "details" }, "second"),
      ));
    await applyPartials(updateChild);
    await flush();

    expect(text("#details")).toBe("second");
  });

  it("queues a response until its initial partial root mounts", async () => {
    vi.useFakeTimers();
    const initial = () =>
      h(Partial, { name: "cart" }, h("p", { id: "count" }, "initial"));
    const { html, payload } = await renderFragment(initial);
    document.body.innerHTML = html;
    boot({}, payload);

    const response = await renderPartialResponse(() =>
      h(Partial, { name: "cart" }, h("p", { id: "count" }, "updated")));
    await applyPartials(response);

    expect(text("#count")).toBe("initial");
    await vi.runAllTimersAsync();
    expect(text("#count")).toBe("updated");
  });

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

describe("overlapping partial requests", () => {
  it("does not apply head changes from a response superseded while queued", async () => {
    vi.useFakeTimers();
    const initial = () =>
      h(Partial, { name: "panel" }, h("p", null, "initial"));
    const { html, payload } = await renderFragment(initial);
    document.body.innerHTML = html;
    document.title = "initial";
    boot({}, payload);
    await vi.runAllTimersAsync();

    const slow = await renderPartialResponse(
      () => h(Partial, { name: "panel" }, h("p", null, "slow")),
      "slow response",
    );
    const fast = await renderPartialResponse(
      () => h(Partial, { name: "panel" }, h("p", null, "fast")),
      "fast response",
    );

    await applyPartials(slow, startPartialNavigation());
    expect(document.title).toBe("initial");
    await applyPartials(fast, startPartialNavigation());
    expect(document.title).toBe("initial");

    await vi.runAllTimersAsync();
    expect(document.title).toBe("fast response");
    expect(text("p")).toBe("fast");
  });

  it("drops an update that is superseded after it was queued", async () => {
    vi.useFakeTimers();
    const initial = () =>
      h(Partial, { name: "feed" }, h("li", null, "initial"));
    const { html, payload } = await renderFragment(initial);
    document.body.innerHTML = html;
    boot({}, payload);
    await vi.runAllTimersAsync();

    const slow = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "feed", mode: "append" },
        h("li", null, "slow"),
      ));
    const fast = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "feed", mode: "append" },
        h("li", null, "fast"),
      ));
    const slowNav = startPartialNavigation();
    await applyPartials(slow, slowNav);
    const fastNav = startPartialNavigation();
    await applyPartials(fast, fastNav);

    await vi.runAllTimersAsync();
    expect(Array.from(document.querySelectorAll("li")).map((li) => li.textContent))
      .toEqual(["initial", "fast"]);
  });

  it("drops the response of a request that was superseded", async () => {
    const initial = () =>
      h(Partial, { name: "feed" }, h("li", null, "a"));

    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);

    const slow = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "feed", mode: "append" },
        h("li", null, "slow"),
      ));
    const fast = await renderPartialResponse(() =>
      h(
        Partial,
        { name: "feed", mode: "append" },
        h("li", null, "fast"),
      ));

    // Two overlapping navigations, the second one (the fast response) started
    // while the first was still in flight.
    const slowNav = startPartialNavigation();
    const fastNav = startPartialNavigation();

    // The slow response lands after the fast one was applied, which is exactly
    // the case that used to append both.
    await applyPartials(fast, fastNav);
    await applyPartials(slow, slowNav);
    await flush();

    expect(document.querySelectorAll("li")).toHaveLength(2);
    expect(text("li:last-child")).toBe("fast");
  });

  it("does not overwrite a newer replacement with a late response", async () => {
    const initial = () =>
      h(Partial, { name: "panel" }, h("p", { id: "panel" }, "first"));

    const { html, payload } = await renderFragment(initial);
    await hydrate(html, payload);
    expect(text("#panel")).toBe("first");

    const newer = await renderPartialResponse(() =>
      h(Partial, { name: "panel" }, h("p", { id: "panel" }, "second")));
    const older = await renderPartialResponse(() =>
      h(Partial, { name: "panel" }, h("p", { id: "panel" }, "third")));

    const olderNav = startPartialNavigation();
    const newerNav = startPartialNavigation();

    // The newer response lands first, the older one arrives afterwards and
    // must not put its own content back on screen.
    await applyPartials(newer, newerNav);
    await applyPartials(older, olderNav);
    await flush();

    expect(text("#panel")).toBe("second");
  });
});

// Model the compiler's hidden identity argument without exposing it publicly.
function testFactory<A extends unknown[], R>(id: string, fn: (...args: A) => R): (...args: A) => R {
  return (defineFactory as (fn: (...args: A) => R, id: string) => (...args: A) => R)(fn, id);
}
