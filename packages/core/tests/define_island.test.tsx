import { Component, h, type ComponentType } from "preact";
import { useState } from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import { defineIsland } from "../src/shared.js";
import { islandTagOf, type IslandTag } from "../src/routing/island_tag.js";

// The public helper has one argument; only the compiler supplies metadata.
const compiled = defineIsland as <P>(component: ComponentType<P>, tag: IslandTag) => ComponentType<P>;

describe("defineIsland", () => {
  it("gives declarations distinct identities without mutating their shared view", () => {
    function View({ value }: { value: number }) {
      const [count] = useState(value);
      return h("button", null, count);
    }
    const first = { name: "first", file: "controls.tsx", exportName: "First" };
    const second = { name: "second", file: "controls.tsx", exportName: "Second" };
    const First = compiled(View, first);
    const Second = compiled(View, second);
    expect(First).not.toBe(Second);
    expect(islandTagOf(First)).toEqual(first);
    expect(islandTagOf(Second)).toEqual(second);
    expect(islandTagOf(View)).toBeUndefined();
    expect(renderToString(h(First, { value: 3 }))).toBe("<button>3</button>");
    expect(renderToString(h(Second, { value: 8 }))).toBe("<button>8</button>");
  });

  it("renders class components through Preact", () => {
    class View extends Component<{ label: string }> {
      override render() { return h("span", null, this.props.label); }
    }
    const Island = compiled(View, { name: "class", file: "class.tsx", exportName: "default" });
    expect(renderToString(h(Island, { label: "hello" }))).toBe("<span>hello</span>");
  });

  it("reports missing compilation rather than silently rendering an inert island", () => {
    expect(() => defineIsland(() => null)).toThrow("needs the Hum Vite plugin");
  });
});
