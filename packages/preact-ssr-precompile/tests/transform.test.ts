import { describe, expect, it } from "vitest";

import {
  isHumInteractiveElement,
  transformPreactSsrJsx,
} from "../src/index.ts";

describe("interactive-aware SSR JSX precompile", () => {
  it("preserves likely interactive elements while compiling static siblings", () => {
    const transformed = transformPreactSsrJsx(
      `export function Page({ value, action }) {
  return <main><article><h1>Static</h1></article>
    <button onClick={action}>{value}</button>
    <p>{value}</p>
  </main>;
}`,
      "page.tsx",
    );

    expect(transformed).toContain("jsxTemplate");
    expect(transformed).toContain("<article><h1>Static</h1></article>");
    expect(transformed).toContain("jsx(");
    expect(transformed).not.toContain("<button onClick");
    expect(transformed).not.toContain("<p>");
  });

  it("preserves dynamic attributes and spread props", () => {
    const transformed = transformPreactSsrJsx(
      `export const Page = ({ value, props }) => <main>
  <input value={value} />
  <section {...props}><b>static</b></section>
</main>;`,
      "page.tsx",
    );

    expect(transformed).toContain("jsxTemplate");
    expect(transformed).toContain("jsx(\"input\"");
    expect(transformed).toContain("jsx(\"section\"");
  });

  it("applies caller-defined element exclusion rules", () => {
    const matched: Array<{
      fileName: string;
      tagName: string;
      ancestorTypes: string[];
      mapCallbackParams: string[];
    }> = [];
    const visited: Array<{
      tagName: string;
      mapCallbackParams: string[];
      source: string;
    }> = [];
    const source = `export const Page = ({ count, action, props }) => <main>
  <button onClick={action}>Submit</button>
  <input value={count} />
  <section {...props}>Spread</section>
  <output>{count}</output>
  {["one", "two"].map((item) => <p key={item}>{item}</p>)}
</main>;`;
    const transformed = transformPreactSsrJsx(
      source,
      "src/page.tsx",
      {
        preserveInteractiveElements: false,
        preserveElements: [
          (node, context) => {
            if (node.openingElement.name.type !== "JSXIdentifier") return false;
            const tagName = node.openingElement.name.name;
            visited.push({
              tagName,
              mapCallbackParams: [...context.mapCallbackParams],
              source: context.source,
            });
            const isInteractive = isHumInteractiveElement(node, context);
            if (isInteractive) {
              matched.push({
                fileName: context.fileName,
                tagName,
                ancestorTypes: context.ancestors.map(({ type }) => type),
                mapCallbackParams: [...context.mapCallbackParams],
              });
            }
            return isInteractive;
          },
        ],
      },
    );

    expect(transformed).toContain("jsxTemplate");
    expect(transformed).toContain('jsx("button"');
    expect(transformed).toContain('jsx("input"');
    expect(transformed).toContain('jsx("section"');
    expect(transformed).toContain('jsx("output"');
    expect(transformed).not.toContain('jsx("p"');
    expect(matched.map(({ tagName }) => tagName)).toEqual([
      "button",
      "input",
      "section",
      "output",
    ]);
    expect(matched.every(({ fileName }) => fileName === "src/page.tsx")).toBe(
      true,
    );
    expect(matched[0].ancestorTypes).toContain("Program");
    expect(matched[3].ancestorTypes).toContain("JSXElement");
    expect(matched[3].mapCallbackParams).toEqual([]);
    expect(visited.find(({ tagName }) => tagName === "p")?.mapCallbackParams)
      .toEqual(["item"]);
    expect(visited.find(({ tagName }) => tagName === "p")?.source).toBe(source);
    expect(transformed).not.toContain('jsx("p"');
    expect(source).toContain('{["one", "two"].map');
  });

  it("keeps keyed list templates optimizable", () => {
    const transformed = transformPreactSsrJsx(
      `export default function Home() {
  return <main>{["first", "second"].map((item) =>
    <p key={item}>{item}</p>
  )}</main>;
}`,
      "page.tsx",
    );

    expect(transformed).toContain("jsxTemplate");
    expect(transformed).toContain('_jsxAttr("key", item)');
  });

  it("preserves document boundary vnodes for Hum's document renderer", () => {
    const transformed = transformPreactSsrJsx(
      `export default function App({ children }) {
  return <html><head><title>Docs</title></head><body>{children}</body></html>;
}`,
      "app.tsx",
    );

    expect(transformed).toContain('jsx("html"');
    expect(transformed).toContain('jsx("head"');
    expect(transformed).toContain('jsx("body"');
  });

  it("preserves configured element names", () => {
    const transformed = transformPreactSsrJsx(
      `export const Page = () => <main><article>runtime</article><aside>static</aside></main>;`,
      "page.tsx",
      { preserveElements: ["article"] },
    );

    expect(transformed).toContain('jsx("article"');
    expect(transformed).toContain("<aside>static</aside>");
  });

  it("can disable automatic interactive-element preservation explicitly", () => {
    const transformed = transformPreactSsrJsx(
      `export const Page = () => <button onClick={() => {}}>Press</button>;`,
      "page.tsx",
      { preserveInteractiveElements: false },
    );

    expect(transformed).toContain("jsxTemplate");
    expect(transformed).not.toContain("jsx(\"button\"");
  });

  it("leaves non-JSX and invalid source unchanged", () => {
    expect(transformPreactSsrJsx("export const value = 1;", "plain.ts")).toBeNull();
    expect(transformPreactSsrJsx("const = <div/>;", "broken.tsx")).toBeNull();
  });
});
