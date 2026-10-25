// @vitest-environment happy-dom
import { h } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { Partial } from "../src/shared/partial.js";
import "../src/runtime/navigation.js";
import { renderFragment } from "./helpers/ssr.js";
import { renderPartialResponse } from "./helpers/partial_response.js";
import { hydrate, setupClientCleanup, text } from "./helpers/client.js";

setupClientCleanup();
const previousUrl = location.href;
afterEach(() => history.replaceState(null, "", previousUrl));

async function formPage(extra: Record<string, string> = {}) {
  history.replaceState({ humClientNav: true, index: 0 }, "", "/products?q=old");
  const { html, payload } = await renderFragment(() => h("main", { "data-hum-client-nav": "" },
    h("form", { action: "/products?ignored=old", method: "get", ...extra },
      h("input", { name: "q", value: "a guide" }),
      h("input", { name: "tag", value: "html" }),
      h("input", { name: "tag", value: "css" }),
      h("button", { type: "submit", name: "sort", value: "price" }, "Search")),
    h(Partial, { name: "results" }, h("p", null, "initial"))));
  await hydrate(html, payload);
  return document.querySelector("form")!;
}

it("puts GET controls in the request and a new history URL, preserving repeated fields and submitters", async () => {
  const form = await formPage();
  const fetch = vi.fn().mockResolvedValue(await renderPartialResponse(() => h(Partial, { name: "results" }, h("p", null, "filtered"))));
  vi.stubGlobal("fetch", fetch);
  const push = vi.spyOn(history, "pushState");
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector("button") });
  form.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(text("p")).toBe("filtered"));
  await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  const request = new URL(fetch.mock.calls[0][0]);
  expect(request.searchParams.get("q")).toBe("a guide");
  expect(request.searchParams.getAll("tag")).toEqual(["html", "css"]);
  expect(request.searchParams.get("sort")).toBe("price");
  expect(request.searchParams.has("ignored")).toBe(false);
  const publicUrl = new URL(location.href);
  expect(publicUrl.pathname).toBe("/products");
  expect(publicUrl.searchParams.get("q")).toBe("a guide");
  expect(publicUrl.searchParams.getAll("tag")).toEqual(["html", "css"]);
  expect(publicUrl.searchParams.has("__hum_partial")).toBe(false);
});

it("keeps explicit partial endpoint parameters separate from the browser URL", async () => {
  const form = await formPage({ "data-hum-partial": "/fragments/products?panel=grid&q=stale" });
  const fetch = vi.fn().mockResolvedValue(await renderPartialResponse(() => h(Partial, { name: "results" }, h("p", null, "filtered"))));
  vi.stubGlobal("fetch", fetch);
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(new URL(location.href).searchParams.get("q")).toBe("a guide"));
  const request = new URL(fetch.mock.calls[0][0]);
  expect(request.pathname).toBe("/fragments/products");
  expect(request.searchParams.get("panel")).toBe("grid");
  expect(request.searchParams.getAll("q")).toEqual(["a guide"]);
  expect(location.pathname).toBe("/products");
  expect(new URL(location.href).searchParams.has("panel")).toBe(false);
});

it("honors a submitter's action and keeps the URL unchanged on a failed request", async () => {
  const form = await formPage();
  form.querySelector("button")!.setAttribute("formaction", "/search");
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const original = location.href;
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector("button") }));
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
  expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/search");
  expect(location.href).toBe(original);
  expect(text("p")).toBe("initial");
});
