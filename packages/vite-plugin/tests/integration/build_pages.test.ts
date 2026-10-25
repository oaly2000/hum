import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

import { hum } from "../../src/mod.js";
import { buildProject, exists } from "../helpers/build.js";

describe("production page generation", () => {
  it("reloads route sources and rendering policies when rebuilding the same project", async () => {
    const root = await buildProject({
      entry: "app",
      routes: {
        "index.tsx": `export const config = { render: { mode: "ssg" } };
export default () => <p>first generated page</p>;`,
      },
    });
    const pagesFile = join(root, "dist", "_generated", "hum-pages.js");
    const rebuild = () => build({
      root,
      configFile: false,
      plugins: [hum()],
      logLevel: "silent",
    });
    try {
      expect(await readFile(pagesFile, "utf8")).toContain("first generated page");
      await writeFile(join(root, "routes", "index.tsx"), `
export const config = { render: { mode: "ssg" } };
export default () => <p>updated generated page</p>;
`);
      await rebuild();
      const updated = await readFile(pagesFile, "utf8");
      expect(updated).toContain("updated generated page");
      expect(updated).not.toContain("first generated page");

      await writeFile(join(root, "routes", "index.tsx"), `
export const config = { render: { mode: "ssr" } };
export default () => <p>updated SSR page</p>;
`);
      await rebuild();
      expect(await readFile(pagesFile, "utf8")).toContain("export default {}");
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      const response = await app.request("/");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("updated SSR page");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("carries SSG and ISG output after relocation (standalone: %s)", async (standalone) => {
    const root = await buildProject({
      entry: "app",
      standalone,
      routes: {
        "posts/[slug].tsx": `import { define, page } from "@humjs/core";
import { Partial } from "@humjs/core/client";
import Counter from "../../islands/Counter";
export const config = define.config({ render: { mode: "ssg", slugs: ["hello"] } });
export const handlers = { GET: () => page({ stamp: crypto.randomUUID() }) };
export default ({ params, data }) => <Partial name="post"><p>{params.slug}:{data.stamp}</p><Counter /></Partial>;
`,
        "incremental/[id].tsx": `import { define } from "@humjs/core";
export const config = define.config({ render: { mode: "isg", revalidate: 60, slugs: ["one"] } });
export default ({ params }) => <p>incremental:{params.id}</p>;
`,
      },
    });
    const moved = join(root, "renamed-output");
    try {
      const { rename } = await import("node:fs/promises");
      await rename(join(root, "dist"), moved);
      // The deployed bundle must not load route sources or an on-disk manifest.
      await rm(join(root, "routes"), { recursive: true });
      const { default: app } = await import(pathToFileURL(join(moved, "server.js")).href);
      const generated = app.hum.build.pages["/posts/hello"];
      expect(generated.body).toContain("hum:island");
      const full = await app.request("/posts/hello");
      expect(await full.text()).toBe(generated.body);
      const partial = await app.request("/posts/hello?_hum_partial=true");
      expect(await partial.text()).toBe(generated.partialBody);
      expect(generated.partialBody).toContain('__HUM_STATE__');
      expect((await app.request("/posts/unknown")).status).toBe(404);
      expect(app.hum.build.pages["/incremental/one"].body).toContain("incremental:one");
      expect(await (await app.request("/incremental/new")).text()).toContain("incremental:new");
      expect(await exists(join(root, ".hum", "prerender"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails the production build when a dynamic SSG page has no slugs", async () => {
    await expect(buildProject({
      entry: "app",
      routes: {
        "posts/[slug].tsx": `export const config = { render: { mode: "ssg" } };
export default () => <p>missing table</p>;`,
      },
    })).rejects.toThrow("dynamic SSG routes require slugs");
  });
});
