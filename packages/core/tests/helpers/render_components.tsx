import { type ComponentChildren, h } from "preact";
import { type Signal, signal } from "@preact/signals";
import { tagIsland } from "../../src/shared/island_tag.js";
import type { RouteProps } from "../../src/types.js";

export const START: Signal<number> = signal(3);
export function Counter(
  props: { count: Signal<number>; children?: ComponentChildren },
) {
  return h(
    "button",
    { id: "counter", type: "button" },
    `count: ${props.count.value}`,
    props.children,
  );
}

export function NestedIsland() {
  return h("span", { id: "nested-island" }, "nested");
}

export function App(props: { children?: ComponentChildren }) {
  return h(
    "html",
    { lang: "en" },
    // Head tags come from the `head` exports of the render chain, so the shell
    // only carries what is structural.
    h("head", null, h("meta", { charset: "utf-8" })),
    h("body", null, props.children),
  );
}

export function Layout(props: { children?: ComponentChildren }) {
  return h(
    "div",
    { id: "layout" },
    h("nav", null, h("a", { href: "/" }, "home")),
    props.children,
  );
}

export function Home(props: RouteProps) {
  return h(
    "main",
    { id: "home" },
    h(Counter, { count: START }, h("b", null, "slot content")),
    h("p", null, `path ${props.url.pathname}`),
  );
}

// The bundler's transform stamps every island module this way; the manifest
// tests make the same write so the renderer recognizes `Counter` as one.
tagIsland(Counter, {
  name: "Counter",
  file: "islands/Counter.tsx",
  exportName: "default",
});
tagIsland(NestedIsland, {
  name: "NestedIsland",
  file: "islands/NestedIsland.tsx",
  exportName: "default",
});
