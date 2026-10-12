import { h } from "preact";
import { Suspense } from "preact/compat";
import { renderToStringAsync } from "preact-render-to-string";
import { renderToReadableStream } from "preact-render-to-string/stream";
import { describe, expect, it } from "vitest";

import { BuildCache } from "../src/build_cache.js";
import {
  getRenderState,
  RenderState,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";

function createState(pathname: string): RenderState {
  return new RenderState({
    url: new URL(pathname, "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });
}

describe("request-scoped render state", () => {
  it("isolates concurrent async render contexts", async () => {
    const first = createState("/first");
    const second = createState("/second");

    const [firstPath, secondPath] = await Promise.all([
      withRenderState(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getRenderState()?.pathname;
      }),
      withRenderState(second, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getRenderState()?.pathname;
      }),
    ]);

    expect(firstPath).toBe("/first");
    expect(secondPath).toBe("/second");
    expect(getRenderState()).toBeNull();
  });

  it("resolves Suspense boundaries in async string rendering", async () => {
    let finish: () => void = () => {};
    let ready = false;
    const pending = new Promise<void>((resolve) =>
      finish = () => {
        ready = true;
        resolve();
      }
    );

    function AsyncContent() {
      if (!ready) throw pending;
      return h("strong", null, "resolved content");
    }

    const rendered = renderToStringAsync(
      h(
        Suspense,
        { fallback: h("i", null, "loading") },
        h(AsyncContent),
      ),
    );
    finish();

    await expect(rendered).resolves.toContain(
      "<strong>resolved content</strong>",
    );
    await expect(rendered).resolves.not.toContain("loading");
  });

  it("streams Suspense fallback and resumes within the same request context", async () => {
    let finish: () => void = () => {};
    let ready = false;
    let resumedPath: string | undefined;
    const pending = new Promise<void>((resolve) =>
      finish = () => {
        ready = true;
        resolve();
      }
    );
    const state = createState("/stream");

    function AsyncContent() {
      if (!ready) throw pending;
      resumedPath = getRenderState()?.pathname;
      return h("strong", null, "resolved content");
    }

    const stream = withRenderState(state, () =>
      renderToReadableStream(
        h(
          "main",
          null,
          h("span", null, "shell"),
          h(
            Suspense,
            { fallback: h("i", null, "loading") },
            h(AsyncContent),
          ),
        ),
      ));
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain("<i>loading</i>");

    finish();
    await stream.allReady;

    let remainder = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      remainder += decoder.decode(value);
    }
    expect(remainder).toContain("<strong>resolved content</strong>");
    expect(resumedPath).toBe("/stream");
    expect(getRenderState()).toBeNull();
  });
});
