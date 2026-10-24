// @vitest-environment happy-dom
import { h } from "preact";

import { describe, expect, it, vi } from "vitest";

import { renderFragment } from "./helpers/ssr.js";

import { Partial } from "../src/runtime/shared.js";

import { applyPartials, startPartialNavigation } from "../src/runtime/client/partials.js";
import { boot } from "../src/runtime/client/reviver.js";

import { renderPartialResponse } from "./helpers/partial_response.js";
import { flush, setupClientCleanup, hydrate, text } from "./helpers/client.js";

setupClientCleanup();

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
