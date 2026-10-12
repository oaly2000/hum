import { h } from "preact";
import { Suspense } from "preact/compat";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import { createResource } from "../src/resource.js";

describe("createResource", () => {
  it("suspends while pending and returns the resolved value", async () => {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((res) => resolve = res);
    const resource = createResource(promise);

    let suspension: unknown;
    try {
      resource.read();
    } catch (error) {
      suspension = error;
    }
    expect(suspension).toBeInstanceOf(Promise);

    resolve("ready");
    await promise;
    await suspension;
    expect(resource.read()).toBe("ready");
  });

  it("throws the rejection reason after the promise rejects", async () => {
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((_resolve, rej) => reject = rej);
    const resource = createResource(promise);
    const error = new Error("load failed");

    let suspension: unknown;
    try {
      resource.read();
    } catch (reason) {
      suspension = reason;
    }
    reject(error);
    await suspension;

    expect(() => resource.read()).toThrow(error);
  });

  it("supports promises that have already resolved", async () => {
    const resource = createResource(Promise.resolve(42));
    await Promise.resolve();
    expect(resource.read()).toBe(42);
  });

  it("integrates with Suspense during async SSR", async () => {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((res) => resolve = res);
    const resource = createResource(promise);
    function Content() {
      return h("p", null, resource.read());
    }

    const rendered = renderToStringAsync(
      h(
        Suspense,
        { fallback: h("i", null, "loading") },
        h(Content),
      ),
    );
    resolve("loaded");

    await expect(rendered).resolves.toContain("<p>loaded</p>");
    await expect(rendered).resolves.not.toContain("loading");
  });
});
