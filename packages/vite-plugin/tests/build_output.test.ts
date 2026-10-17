import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

import { hum, type HumOptions } from "../src/mod.js";

type EntryKind = "app" | "start";

function serverSource(kind: EntryKind): string {
  return `${kind === "start" ? 'import { serve } from "@hono/node-server";' : ""}
import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
const app = new Hono();
await mountHum(app, config);
export const customExport = "preserved";
export function start() { throw new Error("start is an ordinary export"); }
${kind === "app" ? "export default app;" : ""}
${kind === "start" ? 'serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), overrideGlobalObjects: false });' : ""}
`;
}

interface BuildOptions {
  outDir?: string;
  /** Give the project a `server.ts` exporting this. */
  entry?: EntryKind;
  plugins?: Plugin[];
  routes?: Record<string, string>;
}

/**
 * Builds a throwaway project and inspects the output it produced. The project
 * carries a `public/` directory of its own, which is what ties the build's
 * public tree to the one the app serves.
 */
async function buildProject(options: BuildOptions = {}): Promise<string> {
  const { outDir, entry, plugins = [] } = options;
  // Inside the workspace, so the framework resolves for the built app while
  // everything else about the project is disposable.
  const root = await mkdtemp(
    join(resolve(process.cwd(), "packages", "vite-plugin"), "build-test-"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "hum-build-fixture", type: "module" }) + "\n",
  );
  await mkdir(join(root, "routes"), { recursive: true });
  await writeFile(
    join(root, "routes", "index.tsx"),
    `export default function Home() {
  return <main className="home">{["first", "second"].map((item) =>
    <p key={item}>{item}</p>
  )}</main>;
}
`,
  );
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "preact",
        module: "ESNext",
        moduleResolution: "bundler",
      },
    }) + "\n",
  );
  await mkdir(join(root, "islands"), { recursive: true });
  await writeFile(
    join(root, "islands", "Counter.tsx"),
    "export default function Counter() { return null; }\n",
  );
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "public", "robots.txt"), "User-agent: *\n");
  await writeFile(join(root, "public", "favicon.svg"), "<svg/>\n");
  for (const [file, source] of Object.entries(options.routes ?? {})) {
    const path = join(root, "routes", file);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, source);
  }
  if (entry !== undefined) {
    await writeFile(join(root, "server.ts"), serverSource(entry), "utf8");
  }

  const humOptions: HumOptions = {};
  if (outDir !== undefined) humOptions.outDir = outDir;

  try {
    await build({
      root,
      configFile: false,
      plugins: [...plugins, ...hum(humOptions)],
      logLevel: "silent",
      ...(outDir === undefined ? {} : { build: { outDir } }),
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return root;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("the production build layout", () => {
  it("publishes every client asset under <outDir>/public/_hum", async () => {
    const outDir = "dist";
    const root = await buildProject({ outDir });

    try {
      // The output directory holds the server entry, its package.json and the
      // public tree — nothing named after what the assets are addressed by.
      expect(await exists(join(root, outDir, "server.js"))).toBe(true);
      expect(await exists(join(root, outDir, "package.json"))).toBe(true);
      expect(await exists(join(root, outDir, "public", "_hum"))).toBe(true);
      expect(await exists(join(root, outDir, "client"))).toBe(false);
      expect(await exists(join(root, outDir, "server"))).toBe(false);
      // The intermediate client output is build bookkeeping: its contents are
      // in the public tree, and it must not survive in the output directory.
      expect(await exists(join(root, outDir, ".hum-client"))).toBe(false);

      // The client manifest is build bookkeeping and is not part of the public
      // tree: it is read once, while building, and inlined into the server
      // bundle, so nothing can reach it at runtime.
      expect(await exists(join(root, outDir, "public", "_hum", ".vite"))).toBe(
        false,
      );

      const assets = (await readdir(join(root, outDir, "public", "_hum")))
        .sort();
      expect(assets).toEqual(["assets"]);
      expect(await exists(join(root, outDir, "robots.txt"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps user public files next to the client assets", async () => {
    const outDir = "wwwroot";
    const root = await buildProject({ outDir });

    try {
      expect(await readFile(join(root, outDir, "public", "robots.txt"), "utf8"))
        .toContain("User-agent");
      expect(await exists(join(root, outDir, "public", "favicon.svg"))).toBe(true);
      expect(await exists(join(root, outDir, "public", "_hum", "robots.txt")))
        .toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults the output directory to dist", async () => {
    const root = await buildProject();

    try {
      expect(await exists(join(root, "dist", "server.js"))).toBe(true);
      expect(await exists(join(root, "dist", "public", "_hum"))).toBe(true);
      expect(await exists(join(root, "dist", ".hum-client"))).toBe(false);
      expect(await exists(join(root, "_hum"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("addresses the client assets through /_hum, never through the outDir", async () => {
    const outDir = "dist";
    const root = await buildProject({ outDir });

    try {
      const entry = await readFile(join(root, outDir, "server.js"), "utf8");
      // The URL is in the build; the directory name is not, so deploying the
      // same build as `wwwroot` changes nothing for the client.
      expect(entry).toContain('"assetsBase": "/_hum"');
      expect(entry).not.toContain(`/_hum/${outDir}`);
      expect(entry).not.toContain('"/dist/');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("starts a Node listener by default", async () => {
    const root = await buildProject();

    try {
      const entry = await readFile(join(root, "dist", "server.js"), "utf8");
      // The default build serves itself: the entry owns the HTTP listener.
      // Nothing here may be asserted by absence: the bundled framework is part
      // of the file, so the Worker's own markers are checked on their build.
      expect(entry).toContain("overrideGlobalObjects: false");
      expect(entry).toContain("process.env.PORT");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports the app when nothing in the project serves itself", async () => {
    const root = await buildProject({ entry: "app" });

    try {
      const entry = await readFile(join(root, "dist", "server.js"), "utf8");
      // Nothing binds a port and nothing reaches for the Node adapter: the
      // build is handed to whatever calls its fetch, and the project said so by
      // exporting the application without starting a listener.
      expect(entry).not.toContain("overrideGlobalObjects");
      expect(entry).not.toContain("process.env.PORT");
      expect(entry).not.toContain("@hono/node-server");

      // A Hono instance *is* its fetch handler, so a runtime that calls `fetch`
      // — a Worker, an edge runtime, a test — can import the bundle as it is.
      const built = await import(
        pathToFileURL(join(root, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch }; customExport: string };
      expect(built.customExport).toBe("preserved");
      const response = await built.default.fetch(
        new Request("http://localhost/"),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("home");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forwards user Vite transforms into the production server build", async () => {
    const plainRoot = await buildProject({ entry: "app" });
    const precompiledRoot = await buildProject({
      entry: "app",
      plugins: [preactSsrPrecompile()],
    });

    try {
      const [plain, precompiled] = await Promise.all([
        import(pathToFileURL(join(plainRoot, "dist", "server.js")).href),
        import(pathToFileURL(join(precompiledRoot, "dist", "server.js")).href),
      ]) as [{ default: { fetch: typeof fetch } }, {
        default: { fetch: typeof fetch };
      }];
      const [plainResponse, precompiledResponse] = await Promise.all([
        plain.default.fetch(new Request("http://localhost/")),
        precompiled.default.fetch(new Request("http://localhost/")),
      ]);
      expect(plainResponse.status).toBe(200);
      expect(precompiledResponse.status).toBe(200);
      const [plainHtml, precompiledHtml] = await Promise.all([
        plainResponse.text(),
        precompiledResponse.text(),
      ]);
      const main = (html: string) =>
        html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
      expect(plainHtml).not.toContain("data-hum-key");
      expect(precompiledHtml).toContain('data-hum-key="first"');
      expect(precompiledHtml).toContain('data-hum-key="second"');
      expect(main(precompiledHtml).replace(/ data-hum-key="[^"]*"/g, ""))
        .toBe(main(plainHtml));
    } finally {
      await Promise.all([
        rm(plainRoot, { recursive: true, force: true }),
        rm(precompiledRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("runs the entry's top-level Node listener", async () => {
    const root = await buildProject({ entry: "start" });

    try {
      const entry = await readFile(join(root, "dist", "server.js"), "utf8");
      // The project's own entry owns the listener, so its adapter and its
      // port are in the bundle and nothing else put them there.
      expect(entry).toContain("overrideGlobalObjects");
      expect(entry).toContain("process.env.PORT");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("carries SSG and ISG output in a relocatable server bundle", async () => {
    const root = await buildProject({
      entry: "app",
      routes: {
        "posts/[slug].tsx": `import { define, page } from "@humjs/core";
import { Partial } from "@humjs/core/shared";
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
}, 60_000);
