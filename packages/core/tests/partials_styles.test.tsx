// @vitest-environment happy-dom
import { h } from "preact";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderFragment } from "./helpers/ssr.js";

import { Partial } from "../src/runtime/shared.js";

import { applyPartials, startPartialNavigation } from "../src/runtime/client/partials.js";

import { renderPartialResponse } from "./helpers/partial_response.js";
import { flush, setupClientCleanup, hydrate, text } from "./helpers/client.js";

setupClientCleanup();

describe("partial response stylesheets", () => {
  // Happy DOM has no network loader here. Control stylesheet events explicitly.
  let restoreLinkEvents: () => void;
  beforeEach(() => {
    const settings = (window as unknown as {happyDOM: {settings: {handleDisabledFileLoadingAsSuccess: boolean}}}).happyDOM.settings;
    const previous = settings.handleDisabledFileLoadingAsSuccess;
    settings.handleDisabledFileLoadingAsSuccess = true;
    const dispatch = HTMLLinkElement.prototype.dispatchEvent;
    const events = vi.spyOn(HTMLLinkElement.prototype, "dispatchEvent").mockImplementation(function (this: HTMLLinkElement, event: Event) {
      if ((event.type === "load" || event.type === "error") && !(event instanceof CustomEvent)) return true;
      return dispatch.call(this, event);
    });
    restoreLinkEvents = () => { events.mockRestore(); settings.handleDisabledFileLoadingAsSuccess = previous; };
  });
  afterEach(() => restoreLinkEvents());
  async function setup(url: string) {
    const view = (value: string) => h(Partial, {name: "styled-content"}, h("p", {id: "styled-content"}, value));
    const initial = await renderFragment(() => view("initial"));
    await hydrate(initial.html, initial.payload);
    const response = await renderPartialResponse(() => view("next"));
    const body = (await response.text()).replace("</head>", `<link rel="stylesheet" href="${url}"/></head>`);
    return () => new Response(body, {headers: {"Content-Type": "text/html"}});
  }

  it("waits for new CSS before updating the DOM and reuses the loaded stylesheet", async () => {
    const response = await setup("/partial-success.css");
    const work = applyPartials(response());
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/partial-success.css"]')).not.toBeNull());
    const link = document.head.querySelector<HTMLLinkElement>('link[href="/partial-success.css"]')!;
    try {
      expect(text("#styled-content")).toBe("initial");
      link.dispatchEvent(new CustomEvent("load"));
      await work;
      await flush();
      expect(text("#styled-content")).toBe("next");
      await applyPartials(response());
      expect(document.head.querySelectorAll('link[href="/partial-success.css"]')).toHaveLength(1);
    } finally { link.remove(); }
  });

  it("keeps the previous DOM on CSS failure and allows a retry", async () => {
    const response = await setup("/partial-retry.css");
    const work = applyPartials(response());
    const rejected = expect(work).rejects.toThrow(/failed to load stylesheet/);
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/partial-retry.css"]')).not.toBeNull());
    document.head.querySelector('link[href="/partial-retry.css"]')!.dispatchEvent(new CustomEvent("error"));
    await rejected;
    expect(text("#styled-content")).toBe("initial");
    expect(document.head.querySelector('link[href="/partial-retry.css"]')).toBeNull();
    const retry = applyPartials(response());
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/partial-retry.css"]')).not.toBeNull());
    const link = document.head.querySelector('link[href="/partial-retry.css"]')!;
    try {
      link.dispatchEvent(new CustomEvent("load"));
      await retry;
      await flush();
      expect(text("#styled-content")).toBe("next");
    } finally { link.remove(); }
  });

  it("discards a navigation superseded while waiting for CSS", async () => {
    const response = await setup("/partial-stale.css");
    const work = applyPartials(response());
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/partial-stale.css"]')).not.toBeNull());
    const link = document.head.querySelector('link[href="/partial-stale.css"]')!;
    try {
      startPartialNavigation();
      link.dispatchEvent(new CustomEvent("load"));
      await work;
      await flush();
      expect(text("#styled-content")).toBe("initial");
    } finally { link.remove(); }
  });
});
