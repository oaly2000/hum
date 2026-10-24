import { describe, expect, it } from "vitest";

import { islandDeclarations, islandId } from "../src/plugins/island_declarations.js";

describe("explicit island declarations", () => {
  const source = `import { defineIsland as island } from "@humjs/core/shared";
export const Counter = island(({ start = 0 }: { start?: number }) => <button>{start}</button>);
const Toggle = island(() => null);
export { Toggle as ThemeToggle, Toggle as Alternate };
export default island(() => null);
`;

  it("identifies named/default declarations and chooses one export for aliases", () => {
    const declarations = islandDeclarations(source, "components/controls.tsx");
    expect(declarations.map(({ name, exportName }) => ({ name, exportName }))).toEqual([
      { name: islandId("components/controls.tsx", "Counter"), exportName: "Counter" },
      { name: islandId("components/controls.tsx", "Toggle"), exportName: "Alternate" },
      { name: islandId("components/controls.tsx", "default"), exportName: "default" },
    ]);
  });

  it("keeps IDs across edits, line changes, export aliases and path separators", () => {
    const ids = (code: string) => islandDeclarations(code, "components/controls.tsx").map((entry) => entry.name);
    expect(ids("// comment\n\n" + source.replace("<button>{start}</button>", "<output>{start + 1}</output>"))).toEqual(ids(source));
    expect(ids(source.replace("ThemeToggle", "RenamedToggle"))).toEqual(ids(source));
    expect(islandId("components\\controls.tsx", "Counter")).toBe(islandId("components/controls.tsx", "Counter"));
    expect(islandId("other/controls.tsx", "Counter")).not.toBe(islandId("components/controls.tsx", "Counter"));
    expect(islandId("components/controls.tsx", "Toggle")).not.toBe(islandId("components/controls.tsx", "Counter"));
  });

  it("supports namespace imports and a separately exported default", () => {
    const declarations = islandDeclarations(`import * as Hum from "@humjs/core/shared";
const Counter = Hum.defineIsland(() => null);
export default Counter;`, "components/Counter.ts");
    expect(declarations).toMatchObject([
      { name: islandId("components/Counter.ts", "Counter"), exportName: "default" },
    ]);
  });

  it("does not confuse unrelated helpers or reexports with declarations", () => {
    expect(islandDeclarations('import { defineIsland } from "other"; export const Counter = defineIsland(() => null);', "counter.ts")).toEqual([]);
    expect(islandDeclarations('export { Counter } from "./controls";', "index.ts")).toEqual([]);
    expect(islandDeclarations(`import { defineIsland } from "@humjs/core/shared";
function unrelated(defineIsland: (value: unknown) => unknown) { return defineIsland(1); }
function other() { const defineIsland = () => null; return defineIsland(); }`, "index.ts")).toEqual([]);
  });

  it.each([
    ['import { defineIsland } from "@humjs/core/shared"; const Counter = defineIsland(() => null);', /must be exported/],
    ['import { defineIsland } from "@humjs/core/shared"; export function Page() { return defineIsland(() => null); }', /module-level/],
    ['import { defineIsland } from "@humjs/core/shared"; export const Counter = defineIsland(() => null, "manual");', /generated automatically/],
    ['import { defineIsland } from "@humjs/core/shared"; export const Counter = memo(defineIsland(() => null));', /module-level/],
  ])("rejects declarations that cannot be registered statically", (code, error) => {
    expect(() => islandDeclarations(code, "counter.tsx")).toThrow(error);
  });
});
