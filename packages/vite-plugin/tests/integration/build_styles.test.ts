import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { buildProject, exists } from "../helpers/build.js";

describe("automatically linked stylesheet imports", () => {
  it.each([false, true])("publishes processed CSS and referenced assets for SSG and partial responses (standalone: %s)", async (standalone) => {
    const prefix = standalone ? "/docs" : "";
    const root = await buildProject({
      entry: "app", standalone, basePath: prefix || "/",
      configure: () => ({
        build: { assetsInlineLimit: 0 },
        // Distinct SSR processing must not publish a second stylesheet copy.
        environments: { ssr: { build: { cssMinify: false } } },
        css: { postcss: { plugins: [{
          postcssPlugin: "test-head-styles",
          Declaration(decl: { prop: string; value: string }) {
            if (decl.prop === "color" && decl.value === "red") decl.value = "blue";
          },
        }] } },
      }),
      routes: {
        "index.tsx": `
import { Partial } from "@humjs/core/shared";
import "../page.css";
import icon from "../icon.svg";
import download from "../download.css?url";
export const config = {render: {mode: "ssg"}};
export default () => <Partial name="content"><p class="page">PAGE_ONLY_SENTINEL</p><img src={icon}/><a href={download}>Download CSS</a></Partial>;`,
        "_layout.tsx": `import "../layout.css"; export default ({children}) => <main>{children}</main>;`,
        "other.tsx": `import "../other.css"; export default () => <p>other</p>;`,
      },
      files: {
        "page.css": '@import "./base.css"; .page { color: red; background: url("./pattern.svg"); }',
        "base.css": ".base { display: flex; }",
        "layout.css": ".layout { margin: 0; }",
        "other.css": ".other { padding: 1px; }",
        "pattern.svg": '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>',
        "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>',
        "download.css": '.download { color: green; }',
        "client/main.ts": 'throw new Error("REMOVED_CLIENT_ENTRY_EXECUTED");',
      },
    });
    try {
      const app = (await import(pathToFileURL(join(root, "dist/server.js")).href)).default;
      const html = await (await app.request("/")).text();
      expect(html).toContain("PAGE_ONLY_SENTINEL");
      const links = [...html.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]!);
      expect(links).toHaveLength(2);
      expect(links.every(url => url.startsWith(prefix + "/_hum/assets/"))).toBe(true);
      expect(links.some(url => url.includes("other-"))).toBe(false);
      const cssUrl = links.find(url => url.includes("page-"))!;
      const css = await readFile(join(root, "dist/public", cssUrl.slice(prefix.length)), "utf8");
      expect(css).toContain("color:#00f");
      expect(css).toContain(".base");
      expect(css).not.toContain('@import "./base.css"');
      const image = css.match(/url\(["']?([^\)"']+\.svg)["']?\)/)![1]!;
      expect(image).toContain(prefix + "/_hum/assets/pattern-");
      expect(await exists(join(root, "dist/public", image.slice(prefix.length)))).toBe(true);
      const partial = await (await app.request("/?_hum_partial=true")).text();
      for (const url of links) expect(partial).toContain(url);
      expect(app.hum.build.pages["/"].body).toContain(cssUrl);
      const staticHtml = await (await app.request("/other")).text();
      expect(staticHtml).toMatch(/rel="stylesheet" href="[^" ]*other-[^"]+\.css"/);
      expect(staticHtml).not.toContain('<script type="module"');
      const download = html.match(/href="([^"]+)">Download CSS/)![1]!;
      expect(await readFile(join(root, "dist/public", download.slice(prefix.length)), "utf8")).toContain(".download");
      const icon = html.match(/<img src="([^"]+)"/)![1]!;
      expect(await exists(join(root, "dist/public", icon.slice(prefix.length)))).toBe(true);
      const linkedCss = [html, staticHtml].flatMap(body =>
        [...body.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]!.slice(prefix.length + "/_hum/".length)),
      );
      const published = await readdir(join(root, "dist/public/_hum"), { recursive: true });
      expect(published.filter(file => file.endsWith(".css")).map(file => file.replace(/\\/g, "/")).sort())
        .toEqual([...new Set([...linkedCss, download.slice(prefix.length + "/_hum/".length)])].sort());
      const clientFiles = await readdir(join(root, "dist/public/_hum/assets"));
      for (const file of clientFiles.filter(file => file.endsWith(".js"))) {
        const js = await readFile(join(root, "dist/public/_hum/assets", file), "utf8");
        expect(js).not.toContain("PAGE_ONLY_SENTINEL");
        expect(js).not.toContain("REMOVED_CLIENT_ENTRY_EXECUTED");
      }
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  }, 60_000);
});

describe("CSS Modules", () => {
  it.each([false, true])("links static route dependencies before prerender (standalone=%s)", async (standalone) => {
    const root = await buildProject({
      entry: "app", standalone, basePath: "/docs",
      configure: () => ({
        build: {assetsInlineLimit: 0},
        ...(standalone ? {css: {modules: {generateScopedName: "[name]__[local]__[hash:base64:5]"}}} : {}),
      }),
      routes: {
        "index.tsx": `import styles from "../page.module.css";
import { Card } from "../Card";
import { Partial } from "@humjs/core/shared";
export const config = {render: {mode: "ssg"}};
export default () => <Partial name="content"><main class={styles.card}><Card/>CSS_PAGE_SENTINEL</main></Partial>;`,
        "_layout.tsx": `import styles from "../layout.module.css"; export default ({children}) => <section class={styles.layout}>{children}</section>;`,
        "other.tsx": `import styles from "../other.module.css"; export default () => <p class={styles.other}>other</p>;`,
        "_app.tsx": `import styles from "../app.module.css"; export default ({children}) => <html><head/><body class={styles.app}>{children}</body></html>;`,
        "_error.tsx": `import styles from "../error.module.css"; export default () => <p class={styles.error}>failed</p>;`,
        "_404.tsx": `import styles from "../missing.module.css"; export default () => <p class={styles.missing}>missing</p>;`,
        "fail.tsx": `export const handlers={GET(){throw new Error("expected")}};`,
        "stream.tsx": `import styles from "../other.module.css"; export const config={streaming:true}; export default () => <p class={styles.other}>stream</p>;`,
        "bare.tsx": `export const config={skipInheritedLayouts:true,skipAppWrapper:true}; export default () => <p>bare</p>;`,
      },
      files: {
        "app.module.css": '.app { margin: 0; }',
        "error.module.css": '.error { color: orange; }',
        "missing.module.css": '.missing { color: gray; }',
        "page.module.css": '.card { composes: base from "./shared.module.css"; color: red; background: url("./image.svg"); }',
        "Card.tsx": 'import styles from "./shared.module.css"; export const Card = () => <div class={styles.base}>shared</div>;',
        "shared.module.css": '.base { border-width: 1px; }',
        "layout.module.css": '.layout { padding: 3px; }',
        "other.module.css": '.other { color: blue; }',
        "image.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
      },
    });
    try {
      const app = (await import(pathToFileURL(join(root, "dist/server.js")).href)).default;
      const html = await (await app.request("/")).text();
      expect(html).toContain("CSS_PAGE_SENTINEL");
      const urls = [...html.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]!);
      expect(urls.length).toBeGreaterThanOrEqual(3);
      expect(urls.every(url => url.startsWith("/docs/_hum/"))).toBe(true);
      const css = (await Promise.all(urls.map(url => readFile(join(root, "dist/public", url.slice(5)), "utf8")))).join("\n");
      for (const match of html.matchAll(/class="([^"]+)"/g)) {
        for (const name of match[1]!.split(" ")) expect(css).toContain(`.${name}`);
      }
      expect(css).not.toContain("color:#00f");
      const image = css.match(/url\(["']?([^\)"']+\.svg)["']?\)/)![1]!;
      expect(image).toContain('/docs/_hum/assets/image-');
      expect(await exists(join(root, "dist/public", image.slice(5)))).toBe(true);

      const partial = await (await app.request("/?_hum_partial=true")).text();
      for (const url of urls) expect(partial).toContain(url);
      expect(app.hum.build.pages["/"].body).toContain(urls[0]);
      const bare = await (await app.request("/bare")).text();
      expect(bare).not.toContain('rel="stylesheet"');
      const other = await (await app.request("/other")).text();
      expect(other).not.toContain('<script type="module"');
      expect(other).not.toContain(urls.find(url => url.includes("page"))!);
      for (const [path, sheet] of [["/fail", "error-"], ["/unknown", "missing-"], ["/stream", "other-"]]) {
        const response = await (await app.request(path)).text();
        expect(response).toContain(`/_hum/assets/${sheet}`);
        expect(response).toContain('/_hum/assets/app-');
      }
      const files = await readdir(join(root, "dist/public/_hum/assets"));
      for (const file of files.filter(file => file.endsWith(".js"))) {
        expect(await readFile(join(root, "dist/public/_hum/assets", file), "utf8")).not.toContain("CSS_PAGE_SENTINEL");
      }
    } finally { await rm(root, {recursive: true, force: true}); }
  }, 60_000);
});

it("includes shared static chunk CSS in every island asset descriptor", async () => {
  const root = await buildProject({
    entry: "app",
    routes: {"index.tsx": 'import One from "../islands/One"; import Two from "../islands/Two"; export default () => <main><One/><Two/></main>;'},
    files: {
      "islands/One.tsx": 'import { defineIsland } from "@humjs/core/shared"; import { Shared } from "../Shared"; export default defineIsland(() => <Shared/>);',
      "islands/Two.tsx": 'import { defineIsland } from "@humjs/core/shared"; import { Shared } from "../Shared"; export default defineIsland(() => <Shared/>);',
      "Shared.tsx": 'import styles from "./shared.module.css"; export const Shared = () => <button class={styles.shared}>shared island</button>;',
      "shared.module.css": '.shared { border: 2px solid red; }',
    },
  });
  try {
    const app = (await import(pathToFileURL(join(root, "dist/server.js")).href)).default;
    const html = await (await app.request("/")).text();
    const name = html.match(/<button class="([^"]+)"/)![1]!;
    const islands = Object.values(app.hum.build.prod.islands).filter(entry => (entry as {css?: string[]}).css?.length);
    expect(islands).toHaveLength(2);
    for (const entry of islands) {
      const css = (entry as {css: string[]}).css;
      expect(css.length).toBeGreaterThan(0);
      const contents = (await Promise.all(css.map(file => readFile(join(root, "dist/public/_hum", file), "utf8")))).join("\n");
      expect(contents).toContain(`.${name}`);
    }
  } finally { await rm(root, {recursive:true, force:true}); }
}, 30_000);
