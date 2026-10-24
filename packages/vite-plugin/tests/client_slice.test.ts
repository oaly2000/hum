import { describe, expect, it } from "vitest";
import { clientSlice } from "../src/plugins/client_slice.js";
import { interactionDeclarations } from "../src/plugins/client_declarations.js";

const split = (code: string) => clientSlice(code, "routes/index.tsx", interactionDeclarations(code, "routes/index.tsx"));
const imports = `import { defineIsland } from "@humjs/core/shared";
import { defineFactory } from "@humjs/core/events";`;

describe("client declaration dependency slicing", () => {
  it("extracts both kinds, recursive helpers, aliases and selected import specifiers", () => {
    const code = `${imports}
import { client, server } from "./dependencies";
import { readFileSync } from "node:fs";
import type { Signal } from "@preact/signals";
const STEP = 2, SECRET = "server-only-secret";
function helper(n: number): number { return n ? helper(n - 1) : STEP; }
const reset = defineFactory((value: Signal<number>) => () => { value.value = helper(0); });
export { reset as resetCount };
export const Counter = defineIsland(() => <button onClick={client}>{helper(1)}</button>);
export const handlers = { GET: () => server(readFileSync(SECRET)) };
export default function Page() { return <Counter />; }`;
    const output = split(code);
    for (const value of ["STEP = 2", "function helper", 'defineFactory(', "defineIsland", "client", "reset as resetCount"]) expect(output).toContain(value);
    for (const value of ["readFileSync", "node:fs", "SECRET", "handlers", "function Page", "import type", "client, server"]) expect(output).not.toContain(value);
  });

  it("respects parameters, block scopes, destructuring, computed keys and JSX members", () => {
    const output = split(`${imports}
import { UI } from "./ui";
const key = "title";
const label = "hello";
const secret = dangerous();
export const Counter = defineIsland(({ secret = label }: { secret?: string }) => {
  { const label = "local"; console.log(label); }
  const props = { [key]: secret, label };
  return <UI.Button {...props} />;
});`);
    expect(output).toContain('key = "title"');
    expect(output).toContain('label = "hello"');
    expect(output).toContain('import { UI }');
    expect(output).not.toContain("dangerous");
  });

  it("preserves CSS side-effect imports and inline default declarations", () => {
    const output = split(`${imports}
import "./counter.css";
const label = "count";
export default defineIsland(() => <button>{label}</button>);`);
    expect(output).toContain('import "./counter.css"');
    expect(output).toContain("export default defineIsland");
    expect(output).toContain('label = "count"');
  });

  it.each([
    ['let step = 1;', '() => <b>{step}</b>', /must use const/],
    ['const step = compute();', '() => <b>{step}</b>', /effectful initializer/],
    ['import { readFile } from "node:fs";', '() => readFile("secret")', /server import/],
    ['', '() => process.env.SECRET', /server global/],
    ['const config = { step: 1 }; config.step = 2;', '() => <b>{config.step}</b>', /mutates client dependency/],
    ['import "./initialize-server";', '() => null', /side-effect imports/],
    ['const options = { step: 1 }; Object.assign(options, { step: 2 });', '() => options.step', /omitted initialization/],
    ['enum Mode { Ready }', '() => Mode.Ready', /runtime TypeScript dependency/],
    ['if (true) { var step = 1; }', '() => step', /control flow/],
    ['', '() => eval("secret")', /direct eval/],
  ])("rejects ambiguous or server-dependent slices", (setup, component, error) => {
    expect(() => split(`${imports}\n${setup}\nexport const Counter = defineIsland(${component});`)).toThrow(error);
  });

  it("rejects nested factories and accepts factory import aliases", () => {
    expect(() => split(`${imports}\nexport function Page() { return defineFactory(() => () => {}); }`)).toThrow(/module-level/);
    expect(split('import { defineFactory as factory } from "@humjs/core/events"; export const action = factory(() => () => {});'))
      .toContain('factory(');
  });
});

it("generates internal exports for private declarations without exporting the page", () => {
  const code = `${imports}
const action = defineFactory(() => () => {});
const Counter = defineIsland(() => <button onClick={action()}/>);
export default function Page() { return <Counter/>; }`;
  const definitions = interactionDeclarations(code, "routes/index.tsx");
  const output = split(code);
  for (const d of definitions) expect(output).toContain(`export { ${d.binding} as ${d.exportName} };`);
  expect(output).not.toContain("function Page");
  expect(interactionDeclarations(output, "routes/index.tsx").map(d => d.name)).toEqual(definitions.map(d => d.name));
});
