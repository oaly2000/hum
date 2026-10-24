// @vitest-environment happy-dom
import { h } from "preact";

import { describe, expect, it, vi } from "vitest";

// An app evaluates the framework entry before the route module that imports
// signals, so the Hum modules are imported first here as well.
import { renderFragment } from "./helpers/ssr.js";
import { add, setFromProp } from "../src/runtime/events.js";
import { Partial } from "../src/runtime/shared.js";

import { signal } from "@preact/signals";

import { applyPartials } from "../src/runtime/client/partials.js";
import { ACTIVE_PARTIALS, boot, currentInteractionManager } from "../src/runtime/client/reviver.js";

import { renderPartialResponse } from "./helpers/partial_response.js";
import { flush, setupClientCleanup, hydrate, click, text } from "./helpers/client.js";

setupClientCleanup();

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
