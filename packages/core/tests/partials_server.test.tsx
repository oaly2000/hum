import { h } from "preact";

import { describe, expect, it } from "vitest";

// An app evaluates the framework entry before the route module that imports
// signals, so the Hum modules are imported first here as well.
import { renderFragment } from "./helpers/ssr.js";
import { add } from "../src/shared/events.js";
import { Partial } from "../src/shared/partial.js";

import { signal } from "@preact/signals";

describe("page level facets in a partial region on the server", () => {
  function page(outside: unknown, inside: unknown) {
    return h(
      "div",
      null,
      h("p", { id: "outside" }, outside),
      h("button", { id: "outside-button", onClick: add(outside as never, 1) }, "+"),
      h(
        Partial,
        { name: "cart" },
        h("p", { id: "inside" }, inside),
        h("button", { id: "inside-button", onClick: add(inside as never, 1) }, "+"),
      ),
    );
  }

  it("records only the region of a partial response, signals and handlers", async () => {
    const outside = signal(1);
    const inside = signal(2);

    const { html } = await renderFragment(
      () => page(outside, inside),
      { pathname: "/?_hum_partial=true" },
    );

    // The shell is rendered for context, but nothing of it is bound: the
    // client already owns those nodes.
    expect(html).toContain('<p id="outside">1</p>');
    expect(html).not.toContain("hum:signal:1");
    expect(html.match(/data-hum-handler=/g)).toHaveLength(1);

    // Inside the region both kinds of facet are recorded, in render order.
    expect(html).toContain("<!--hum:signal:0-->2<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');
  });

  it("records both sides of a full response", async () => {
    const outside = signal(1);
    const inside = signal(2);

    const { html, entries } = await renderFragment(() =>
      page(outside, inside));

    expect(html).toContain("<!--hum:signal:0-->1<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:1}"');
    expect(html).toContain("<!--hum:signal:2-->2<!--/hum:signal-->");
    expect(html).toContain('data-hum-handler="{&quot;onClick&quot;:3}"');

    // Four entries: a signal and a handler for the shell, the same for the
    // region. Each pair holds one signal instance, shared with the text binding
    // and the handler that drives it.
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => Object.keys(entry)[0])).toEqual([
      "signal",
      "handler",
      "signal",
      "handler",
    ]);
    expect((entries[0] as { signal: unknown }).signal).toBe(outside);
    expect((entries[2] as { signal: unknown }).signal).toBe(inside);
  });
});
