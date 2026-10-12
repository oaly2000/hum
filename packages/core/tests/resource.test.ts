import { h, options } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import { createResource, Suspense } from "../src/resource.js";

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
    const rendered = renderToStringAsync(
      h(
        Suspense,
        {
          resource,
          fallback: h("i", null, "loading"),
          errorFallback: h("b", null, "failed"),
          children: (value) => h("p", null, value),
        },
      ),
    );
    resolve("loaded");

    await expect(rendered).resolves.toContain("<p>loaded</p>");
    await expect(rendered).resolves.not.toContain("loading");
  });

  it("renders its error fallback when a suspended resource rejects", async () => {
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((_resolve, rej) => reject = rej);
    const resource = createResource(promise);

    const rendered = renderToStringAsync(
      h(
        Suspense,
        {
          resource,
          fallback: h("i", null, "loading"),
          errorFallback: (error: unknown) =>
            h("p", { role: "alert" }, `Could not load: ${String(error)}`),
          children: (value) => h("p", null, value),
        },
      ),
    );
    reject(new Error("network error"));

    await expect(rendered).resolves.toContain(
      '<p role="alert">Could not load: Error: network error</p>',
    );
    await expect(rendered).resolves.not.toContain("loading");
  });

  it("renders its error fallback when a child throws during rendering", async () => {
    const resource = createResource(Promise.resolve("ready"));
    function Explode() {
      throw new Error("render failed");
    }

    const previousErrorBoundaries = options.errorBoundaries;
    options.errorBoundaries = true;
    try {
      const rendered = await renderToStringAsync(
        h(
          Suspense,
          {
            resource,
            fallback: h("i", null, "loading"),
            errorFallback: (error: unknown) =>
              h("p", { role: "alert" }, `Component error: ${String(error)}`),
            children: () => h("div", null, h(Explode)),
          },
        ),
      );
      expect(rendered).toContain(
        '<p role="alert">Component error: Error: render failed</p>',
      );
    } finally {
      options.errorBoundaries = previousErrorBoundaries;
    }
  });
});
