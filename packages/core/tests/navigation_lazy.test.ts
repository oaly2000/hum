// @vitest-environment happy-dom
import { h } from "preact";
import { expect, it, vi } from "vitest";
import { renderFragment } from "./helpers/ssr.js";
import { Partial } from "../src/shared/partial.js";
import { hydrate, setupClientCleanup, text } from "./helpers/client.js";
import { renderPartialResponse } from "./helpers/partial_response.js";

setupClientCleanup();

it("intercepts first clicks synchronously and keeps the latest navigation while loading", async () => {
  // No static import of the partial response implementation: this exercises
  // the first dynamic load, including two clicks in the same event-loop turn.
  const navigation = await import("../src/runtime/navigation.js");
  const { html, payload } = await renderFragment(() => h("main", {
    "data-hum-client-nav": "",
  }, h("a", { href: "/older" }, "older"), h("a", { href: "/newer" }, "newer"),
  h(Partial, { name: "panel" }, h("p", null, "initial"))));
  await hydrate(html, payload);
  const older = await renderPartialResponse(() =>
    h(Partial, { name: "panel", mode: "append" }, h("p", null, "older")));
  const newer = await renderPartialResponse(() =>
    h(Partial, { name: "panel", mode: "append" }, h("p", null, "newer")));
  const fetch = vi.fn().mockResolvedValueOnce(older).mockResolvedValueOnce(newer);
  vi.stubGlobal("fetch", fetch);
  const previousUrl = location.href;
  try {
    for (const anchor of document.querySelectorAll("a")) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      anchor.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(navigation.lastNavigation).toBe(2);
    expect(text("p")).toBe("initial");
    await vi.waitFor(() => expect(location.pathname).toBe("/newer"));
    await vi.waitFor(() => expect(Array.from(document.querySelectorAll("p"), p => p.textContent))
      .toEqual(["initial", "newer"]));
  } finally {
    history.replaceState(null, "", previousUrl);
  }
});
