import { h } from "preact";
import { describe, expect, it } from "vitest";

import { BuildCache } from "../src/build_cache.js";
import {
  DefaultApp,
  renderDocument,
  renderDocumentStream,
} from "../src/runtime/server/document.js";
import {
  RenderState,
  withRenderState,
} from "../src/runtime/server/preact_hooks.js";

function createState(pathname = "/"): RenderState {
  return new RenderState({
    url: new URL(pathname, "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });
}

/**
 * A document shell whose head carries a literal `$&`. `String.replace`
 * interprets those sequences in a replacement string, so the head fragment has
 * to be inserted verbatim for this to survive.
 */
function documentShell(): h.JSX.Element {
  return h(
    "html",
    null,
    h("head", null, h("title", null, "t")),
    h("body", null, h("p", null, "body")),
  );
}

/** Head node holding raw markup, which `renderHead` renders as-is. */
function fragileHead(): h.JSX.Element {
  return h("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: '"pattern":"a$&b"' },
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("document placeholder injection", () => {
  it("inserts the head verbatim in the buffered document", () => {
    const state = createState();
    state.headNodes.push(fragileHead());

    const html = withRenderState(state, () => renderDocument(documentShell()));

    expect(html).toContain('"pattern":"a$&b"');
    expect(html).not.toContain("hum:head-placeholder");
  });

  it("inserts the head verbatim in the streamed document", async () => {
    const state = createState();
    state.headNodes.push(fragileHead());

    const html = await withRenderState(state, () =>
      readStream(renderDocumentStream(documentShell())));

    expect(html).toContain('"pattern":"a$&b"');
    expect(html).not.toContain("hum:head-placeholder");
    expect(html).not.toContain("hum:scripts-placeholder");
  });

  it("falls back to the default document when no `_app` rendered the tags", () => {
    const html = withRenderState(createState(), () =>
      renderDocument(h(DefaultApp, null, h("p", null, "plain"))));

    expect(html).toContain("<p>plain</p>");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
