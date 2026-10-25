// @vitest-environment happy-dom
import { Fragment, h } from "preact";
import { signal, type Signal } from "@preact/signals";

import { describe, expect, it, vi } from "vitest";

import { parse } from "../src/jsonify/parse.js";
import { boot } from "../src/runtime/boot.js";
import { CUSTOM_PARSER } from "../src/runtime/payload.js";
import { domToVNode, Marker, SignalText } from "../src/runtime/dom.js";
import { type Payload } from "../src/protocol/payload.js";
import { add, setFromProp, setValue } from "../src/shared/events.js";
import type { AnyVNode } from "../src/shared/preact.js";
import { renderFragment as renderServer } from "./helpers/ssr.js";
import { flush, setupClientCleanup } from "./helpers/client.js";

/** Puts a server rendered document in place and hydrates it. */
function hydrate(html: string, payload: string): void {
  document.body.innerHTML = html;
  boot({}, payload);
}

setupClientCleanup();

describe("page level facets on the client", () => {
  it("drives a signal child and a signal prop from one handler", async () => {
    const value = signal(1);
    const { html, payload } = await renderServer(() =>
      h(
        "div",
        null,
        h("p", { id: "text" }, value),
        h("input", {
          id: "input",
          type: "number",
          value,
          onInput: setFromProp(value, "value"),
        }),
        h("button", { id: "bump", onClick: add(value, 1) }, "+"),
        h("button", { id: "set", onClick: setValue(value, 42) }, "42"),
      )
    );

    hydrate(html, payload);

    const text = document.querySelector("#text")!;
    const input = document.querySelector("#input") as HTMLInputElement;

    // Nothing is adopted until the scheduled pass runs.
    expect(input.getAttribute("data-hum-signal")).not.toBeNull();
    await flush();

    // The facet attributes are consumed while the element is adopted.
    expect(input.getAttribute("data-hum-signal")).toBeNull();
    expect(text.textContent).toBe("1");
    expect(input.value).toBe("1");

    // Typing flows : DOM -> handler -> signal -> the text binding.
    input.value = "9";
    input.dispatchEvent(new Event("input"));
    await flush();
    expect(text.textContent).toBe("9");

    // A handler without a DOM target flows: signal -> prop -> DOM property.
    document.querySelector<HTMLButtonElement>("#set")!
      .dispatchEvent(new Event("click"));
    await flush();
    expect(input.value).toBe("42");
    expect(text.textContent).toBe("42");

    // A handler reading the signal keeps it in sync as well.
    document.querySelector<HTMLButtonElement>("#bump")!
      .dispatchEvent(new Event("click"));
    await flush();
    expect(text.textContent).toBe("43");
    expect(input.value).toBe("43");
  });

  it("shares a state reference between a page binding and an island", async () => {
    function Counter(props: { count: Signal<number> }) {
      return h("output", { id: "island-count" }, props.count.value);
    }
    const count = signal(1);
    const { html, payload } = await renderServer(
      () =>
        h(
          "main",
          null,
          h("p", { id: "page-count" }, count),
          h("button", { id: "increment", onClick: add(count, 1) }, "+"),
          h(Counter, { count }),
        ),
      { islands: [[Counter, "Counter"]] },
    );

    const observer = Object.getOwnPropertyDescriptor(
      globalThis,
      "IntersectionObserver",
    );
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: undefined,
    });
    try {
      document.body.innerHTML = html;
      boot({ Counter }, payload);
      await flush();

      document.querySelector<HTMLButtonElement>("#increment")!
        .dispatchEvent(new Event("click"));
      await flush();

      expect(document.querySelector("#page-count")!.textContent).toBe("2");
      expect(document.querySelector("#island-count")!.textContent).toBe("2");
    } finally {
      if (observer === undefined) {
        delete (globalThis as { IntersectionObserver?: unknown })
          .IntersectionObserver;
      } else {
        Object.defineProperty(globalThis, "IntersectionObserver", observer);
      }
    }
  });

  it("reuses the server rendered DOM instead of recreating it", async () => {
    const count = signal(2);
    const { html, payload } = await renderServer(() =>
      h("div", null, h("p", null, count, " static"), h("span", null, "static"))
    );

    document.body.innerHTML = html;
    const paragraph = document.querySelector("p")!;
    // The trailing text node sits outside the signal markers, so it survives
    // hydration as the identity anchor of the surrounding markup.
    const textNode = paragraph.lastChild!;
    const span = document.querySelector("span")!;

    boot({}, payload);

    expect(document.querySelector("p")).toBe(paragraph);
    expect(paragraph.lastChild).toBe(textNode);
    expect(document.querySelector("span")).toBe(span);
    expect(paragraph.textContent).toBe("2 static");
  });

  it("adopts an element that contains an island, and keeps the island", async () => {
    let renders = 0;
    function Inner(props: { count: Signal<number> }) {
      renders++;
      return h("span", { id: "inner" }, props.count.value);
    }
    const theme = signal("hero");
    const count = signal(1);
    const { html, payload } = await renderServer(
      () =>
        h(
          "div",
          { id: "shell", class: theme, onClick: add(count, 1) },
          h("p", { id: "count" }, count),
          h(Inner, { count: signal(1) }),
        ),
      { islands: [[Inner, "Inner"]] },
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = html;
    renders = 0;
    boot({ Inner }, payload);
    await flush();
    warn.mockRestore();

    // The host is adopted, so nothing is reported and nothing is left behind.
    expect(warn).not.toHaveBeenCalled();
    const shell = document.querySelector("#shell")!;
    expect(shell.getAttribute("data-hum-signal")).toBeNull();
    expect(shell.getAttribute("data-hum-handler")).toBeNull();

    // Its bindings are live: the signal drives the text, the handler the signal.
    expect(document.querySelector("#count")!.textContent).toBe("1");
    shell.dispatchEvent(new Event("click"));
    await flush();
    expect(document.querySelector("#count")!.textContent).toBe("2");

    // The island it contains is hydrated exactly once, by the host's render.
    expect(renders).toBe(1);
    expect(document.querySelector("#inner")!.textContent).toBe("1");
  });
});

describe("facets while adopting DOM", () => {
  it("wraps a signal marker in an isolated reactive text leaf", async () => {
    const count = signal(7);
    const value = signal("a");
    const { html, payload } = await renderServer(() =>
      h(
        "main",
        null,
        h("p", { id: "text" }, count),
        h("input", { id: "input", value, placeholder: "type" }),
      )
    );

    document.body.innerHTML = html;
    const entries = parse<Payload>(payload, CUSTOM_PARSER);
    const root: AnyVNode = h(Fragment, null);
    domToVNode(entries, [root], [Marker.Slot], document.body.firstChild!, null);

    const main = (root.props.children as AnyVNode[])[0];
    expect(main.type).toBe("main");

    const [paragraph, input] = main.props.children as AnyVNode[];
    const leaf = (paragraph.props.children as AnyVNode[])[0];
    expect(leaf.type).toBe(SignalText);
    expect((leaf.props as { signal: Signal<number> }).signal.value).toBe(7);

    // The bound prop comes back as a signal, and the marker attribute is gone.
    const props = input.props as Record<string, unknown>;
    expect(typeof (props.value as Signal<string>).peek).toBe("function");
    expect((props.value as Signal<string>).value).toBe("a");
    expect(props.placeholder).toBe("type");
    expect(props["data-hum-signal"]).toBeUndefined();
  });
});
