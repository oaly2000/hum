// @vitest-environment happy-dom
import { h } from "preact";

import { describe, expect, it } from "vitest";

import { renderFragment } from "./helpers/ssr.js";

import { Partial } from "../src/shared/partial.js";

import { boot, currentInteractionManager } from "../src/runtime/boot.js";

import { flush, setupClientCleanup } from "./helpers/client.js";

setupClientCleanup();

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
