import { describe, expect, it } from "vitest";

import { interactionDeclarations, factoryId, islandDeclarations, islandId } from "../src/plugins/client_declarations.js";

describe("explicit island declarations", () => {
  const source = `import { defineIsland as island } from "@humjs/core/client";
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
    const declarations = islandDeclarations(`import * as Hum from "@humjs/core/client";
const Counter = Hum.defineIsland(() => null);
export default Counter;`, "components/Counter.ts");
    expect(declarations).toMatchObject([
      { name: islandId("components/Counter.ts", "Counter"), exportName: "default" },
    ]);
  });

  it("does not confuse unrelated helpers or reexports with declarations", () => {
    expect(islandDeclarations('import { defineIsland } from "other"; export const Counter = defineIsland(() => null);', "counter.ts")).toEqual([]);
    expect(islandDeclarations('export { Counter } from "./controls";', "index.ts")).toEqual([]);
    expect(islandDeclarations(`import { defineIsland } from "@humjs/core/client";
function unrelated(defineIsland: (value: unknown) => unknown) { return defineIsland(1); }
function other() { const defineIsland = () => null; return defineIsland(); }`, "index.ts")).toEqual([]);
  });

  it.each([
    ['import { defineIsland } from "@humjs/core/client"; export function Page() { return defineIsland(() => null); }', /module-level/],
    ['import { defineIsland } from "@humjs/core/client"; export const Counter = defineIsland(() => null, "manual");', /generated automatically/],
    ['import { defineIsland } from "@humjs/core/client"; export const Counter = memo(defineIsland(() => null));', /module-level/],
  ])("rejects declarations that cannot be registered statically", (code, error) => {
    expect(() => islandDeclarations(code, "counter.tsx")).toThrow(error);
  });
});

describe("automatic client identities", () => {
  const file = "routes/index.tsx";
  const imports = 'import { defineIsland, defineFactory as factory } from "@humjs/core/client";';
  it("supports private declarations and preserves identity across export changes", () => {
    const code = imports + 'const Counter = defineIsland(() => null); const bump = factory(() => () => {});';
    const privateDefs = interactionDeclarations(code, file);
    expect(privateDefs.map(d => d.name)).toEqual([islandId(file, "Counter"), factoryId(file, "bump")]);
    expect(privateDefs.map(d => d.exportName)).toEqual(privateDefs.map(d => `__hum_${d.name}`));
    expect(interactionDeclarations(code + 'export {Counter, bump};', file).map(d => d.name)).toEqual(privateDefs.map(d => d.name));
    expect(factoryId(file, "bump")).not.toBe(factoryId("routes/other.tsx", "bump"));
    expect(factoryId(file, "bump")).not.toBe(islandId(file, "bump"));
    expect(factoryId("routes\\index.tsx", "bump")).toBe(factoryId(file, "bump"));
  });
  it("supports namespace factories and default declarations", () => {
    expect(interactionDeclarations('import * as Hum from "@humjs/core/client"; export default Hum.defineFactory(() => () => {});', file))
      .toMatchObject([{kind: "factory", name: factoryId(file, "default"), exportName: "default"}]);
  });
  it("distinguishes both declarations from the same namespace", () => {
    const code = `import * as Hum from "@humjs/core/client";
const Counter = Hum.defineIsland(() => null);
const action = Hum.defineFactory(() => () => {});
const region = Hum.Partial({ name: "content" });`;
    expect(interactionDeclarations(code, file)).toMatchObject([
      { kind: "island", name: islandId(file, "Counter") },
      { kind: "factory", name: factoryId(file, "action") },
    ]);
  });
  it("ignores removed declaration entries and type-only helpers", () => {
    for (const entry of ["@humjs/core/shared", "@humjs/core/events"]) {
      expect(interactionDeclarations(`import { defineFactory } from "${entry}"; const action = defineFactory(() => () => {});`, file)).toEqual([]);
    }
    expect(interactionDeclarations('import { type defineFactory } from "@humjs/core/client"; const action = defineFactory(() => () => {});', file)).toEqual([]);
  });
  it("checks nested factories reached through a client namespace", () => {
    expect(() => interactionDeclarations('import * as Hum from "@humjs/core/client"; function Page() { return Hum.defineFactory(() => () => {}); }', file)).toThrow(/module-level/);
    expect(interactionDeclarations('import * as Hum from "@humjs/core/client"; function Page(Hum: any) { return Hum.defineFactory(() => () => {}); }', file)).toEqual([]);
  });
  it("rejects manual factory IDs", () => {
    expect(() => interactionDeclarations(imports + 'const bump = factory("manual", () => () => {});', file)).toThrow(/generated automatically/);
  });
});
