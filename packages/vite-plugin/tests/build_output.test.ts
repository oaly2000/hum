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

import { build, type InlineConfig, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

import { hum, type HumOptions } from "../src/mod.js";

type EntryKind = "app" | "start";

const RUNTIME_RESOURCE_FILES = {
  "node_modules/hum-runtime-resource/package.json": JSON.stringify({
    name: "hum-runtime-resource",
    type: "module",
    exports: "./index.js",
  }),
  "node_modules/hum-runtime-resource/index.js": `import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
export function packageMessage() {
  return readFileSync(require.resolve("./message.txt"), "utf8").trim();
}
`,
  "node_modules/hum-runtime-resource/message.txt": "package resource survives\n",
};

function serverSource(kind: EntryKind): string {
  return `${kind === "start" ? 'import { serve } from "@hono/node-server";' : ""}
import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
const app = new Hono();
await mountHum(app, config);
export const customExport = "preserved";
export const sideEffects: string[] = [];
sideEffects.push("entry evaluated");
export function start() { throw new Error("start is an ordinary export"); }
${kind === "app" ? "export default app;" : ""}
${kind === "start" ? 'serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), overrideGlobalObjects: false });' : ""}
`;
}

interface BuildOptions {
  outDir?: string | ((root: string) => string);
  /** Give the project a `server.ts` exporting this. */
  entry?: EntryKind;
  plugins?: Plugin[];
  routes?: Record<string, string>;
  files?: Record<string, string>;
  standalone?: boolean;
  configure?: (root: string) => InlineConfig;
}

/**
 * Builds a throwaway project and inspects the output it produced. The project
 * carries a `public/` directory of its own, which is what ties the build's
 * public tree to the one the app serves.
 */
async function buildProject(options: BuildOptions = {}): Promise<string> {
  const { entry, plugins = [] } = options;
  // Inside the workspace, so the framework resolves for the built app while
  // everything else about the project is disposable.
  const root = await mkdtemp(
    join(resolve(process.cwd(), "packages", "vite-plugin"), "build-test-"),
  );
  const outDir = typeof options.outDir === "function" ? options.outDir(root) : options.outDir;
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
  for (const [file, source] of Object.entries(options.files ?? {})) {
    const path = join(root, file);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, source);
  }

  const humOptions: HumOptions = {};
  if (outDir !== undefined) humOptions.outDir = outDir;
  if (options.standalone !== undefined) humOptions.standalone = options.standalone;

  try {
    await build({
      ...options.configure?.(root),
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

/** Inspect generated metadata regardless of the selected server layout. */
async function serverSources(directory: string): Promise<string> {
  const sources: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "public") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sources.push(await serverSources(path));
    else if (entry.name.endsWith(".js")) sources.push(await readFile(path, "utf8"));
  }
  return sources.join("\n");
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

  it.each([".hum", "public", "routes"])("rejects output overlapping the %s source directory", async (outDir) => {
    await expect(buildProject({ outDir })).rejects.toThrow(
      "hum: outDir must not overlap the source directory",
    );
  });

  it("rejects output equal to a source entry", async () => {
    await expect(buildProject({ entry: "app", outDir: "server.ts" })).rejects.toThrow(
      "hum: outDir must not contain the source entry",
    );
  });

  it.skipIf(process.platform !== "win32")("rejects the project root with different path casing", async () => {
    await expect(buildProject({ outDir: (root) => root.toUpperCase() })).rejects.toThrow(
      "hum: outDir must not contain the project root",
    );
  });

  it("addresses the client assets through /_hum, never through the outDir", async () => {
    const outDir = "dist";
    const root = await buildProject({ outDir });

    try {
      const entry = await serverSources(join(root, outDir));
      // The URL is in the build; the directory name is not, so deploying the
      // same build as `wwwroot` changes nothing for the client.
      expect(entry).toMatch(/"?assetsBase"?\s*:\s*"\/_hum"/);
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
      expect(entry).toContain("overrideGlobalObjects: false");
      expect(entry).toContain("process.env.PORT");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("preserves application exports and entry side effects (standalone: %s)", async (standalone) => {
    const root = await buildProject({ entry: "app", standalone });

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
      ) as {
        default: { fetch: typeof fetch };
        customExport: string;
        sideEffects: string[];
        start: () => never;
      };
      expect(built.customExport).toBe("preserved");
      expect(built.sideEffects).toEqual(["entry evaluated"]);
      expect(built.start).toThrow("start is an ordinary export");
      const response = await built.default.fetch(
        new Request("http://localhost/"),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("home");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps application modules and package resources usable through Node", async () => {
    const buildSideEffect = `hum-test-prerender-${crypto.randomUUID()}`;
    const root = await buildProject({
      files: {
        ...RUNTIME_RESOURCE_FILES,
        "server.ts": `export { default } from "./app";
export const customExport = "preserved";
export const sideEffects: string[] = [];
sideEffects.push("entry evaluated");
`,
        "app.ts": `import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { packageMessage } from "hum-runtime-resource";
const app = new Hono();
app.get("/api/resource", (c) => c.text(packageMessage()));
await mountHum(app, config);
export default app;
`,
        "islands/Counter.tsx": `export default function Counter() { return <button>count</button>; }`,
      },
      routes: {
        "index.tsx": `import { define, page } from "@humjs/core";
import { packageMessage } from "hum-runtime-resource";
import Counter from "../islands/Counter";
globalThis[Symbol.for(${JSON.stringify(buildSideEffect)})] = true;
export const config = define.config({ render: { mode: "ssg" } });
export const handlers = { GET: () => page({ message: packageMessage() }) };
export default ({ data }) => <main><p>{data.message}</p><Counter /></main>;
`,
      },
    });
    try {
      expect(Reflect.get(globalThis, Symbol.for(buildSideEffect))).toBeUndefined();
      const output = join(root, "dist");
      for (const file of ["server.js", "app.js", "routes/index.js", "islands/Counter.js"]) {
        expect(await exists(join(output, file)), file).toBe(true);
      }
      expect(await exists(join(output, "_generated"))).toBe(true);
      expect(await exists(join(output, "_generated", "prerender.js"))).toBe(false);
      const source = await readFile(join(output, "app.js"), "utf8");
      expect(source).toContain('"hum-runtime-resource"');
      expect(source).toContain('"hono"');
      expect(source).not.toContain("createRequire");

      // Execute the generated tree after removing application sources. Node
      // resolves the external package and its own resource from node_modules.
      for (const file of ["server.ts", "app.ts", "routes", "islands"]) {
        await rm(join(root, file), { recursive: true, force: true });
      }
      const built = await import(pathToFileURL(join(output, "server.js")).href);
      expect(built.customExport).toBe("preserved");
      expect(built.sideEffects).toEqual(["entry evaluated"]);
      const api = await built.default.request("/api/resource");
      expect(api.status).toBe(200);
      expect(await api.text()).toBe("package resource survives");
      const page = await built.default.request("/");
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain("package resource survives");
      expect(html).toContain("hum:island");
      expect(built.default.hum.build.pages["/"].body).toBe(html);
    } finally {
      Reflect.deleteProperty(globalThis, Symbol.for(buildSideEffect));
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("keeps external dependencies configured by earlier environment hooks (standalone: %s)", async (standalone) => {
    const resourcePage = `import { packageMessage } from "hum-runtime-resource";
export default () => <p>{packageMessage()}</p>;`;
    const root = await buildProject({
      entry: "app",
      standalone,
      files: RUNTIME_RESOURCE_FILES,
      plugins: [{
        name: "fixture-environment-externals",
        configEnvironment(name, config) {
          if (name === "ssr") {
            config.resolve = {
              ...config.resolve,
              external: ["hum-runtime-resource"],
              noExternal: true,
            };
          }
        },
      }],
      routes: {
        "index.tsx": resourcePage,
        "static.tsx": `export const config = { render: { mode: "ssg" } };\n${resourcePage}`,
      },
    });
    try {
      expect(await serverSources(join(root, "dist"))).toContain('"hum-runtime-resource"');
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      for (const path of ["/", "/static"]) {
        const response = await app.request(path);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("package resource survives");
      }
      expect(app.hum.build.pages["/static"].body).toContain("package resource survives");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies user JavaScript transforms once to standalone source modules", async () => {
    const root = await buildProject({
      entry: "app",
      standalone: true,
      files: { "message.js": 'export const message = "once";' },
      plugins: [{
        name: "fixture-transform-once",
        transform(code, id) {
          if (id.replace(/\\/g, "/").endsWith("/message.js")) {
            return code.replaceAll("twice", "three-times").replaceAll("once", "twice");
          }
        },
      }],
      routes: {
        "index.tsx": `import { message } from "../message.js";
export default () => <p>{message}</p>;`,
      },
    });
    try {
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      const response = await app.request("/");
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(">twice</p>");
      expect(html).not.toContain("three-times");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([false, true])("preserves Vite resolution, loading, aliases and defines (standalone: %s)", async (standalone) => {
    const root = await buildProject({
      entry: "app",
      standalone,
      configure: (root) => ({
        resolve: { alias: { "#fixture-message": join(root, "message.ts") } },
        define: { __FIXTURE_BUILD__: JSON.stringify("defined") },
        environments: {
          ssr: { define: { __FIXTURE_SSR__: JSON.stringify("server-defined") } },
        },
      }),
      files: { "message.ts": 'export const message = "aliased";' },
      plugins: [{
        name: "fixture-virtual-module",
        applyToEnvironment(environment) {
          return environment.name === "ssr";
        },
        resolveId(id) {
          if (id === "virtual:fixture-message") return "\0fixture-message";
        },
        load(id) {
          if (id === "\0fixture-message") return 'export const value = "loaded";';
        },
      }],
      routes: {
        "index.tsx": `import { define } from "@humjs/core";
import { value } from "virtual:fixture-message";
import { message } from "#fixture-message";
export const config = define.config({ render: { mode: "ssg" } });
export default () => <p>{value}:{message}:{__FIXTURE_BUILD__}:{__FIXTURE_SSR__}</p>;
`,
      },
    });
    try {
      const { default: app } = await import(pathToFileURL(join(root, "dist", "server.js")).href);
      const response = await app.request("/");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("loaded:aliased:defined:server-defined");
      expect(app.hum.build.pages["/"].body).toContain("loaded:aliased:defined:server-defined");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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

  it("forwards user Vite transforms into the production server build", async () => {
    const plainRoot = await buildProject({ entry: "app" });
    const precompiledRoot = await buildProject({
      entry: "app",
      plugins: [preactSsrPrecompile()],
    });

    try {
      // Mount each app while its build is registered. Separate deployed apps
      // share the external framework in this test process.
      const plain = await import(
        pathToFileURL(join(plainRoot, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch } };
      const plainResponse = await plain.default.fetch(new Request("http://localhost/"));
      expect(plainResponse.status).toBe(200);
      const plainHtml = await plainResponse.text();

      const precompiled = await import(
        pathToFileURL(join(precompiledRoot, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch } };
      const precompiledResponse = await precompiled.default.fetch(new Request("http://localhost/"));
      expect(precompiledResponse.status).toBe(200);
      const precompiledHtml = await precompiledResponse.text();
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

  it.each([false, true])("carries SSG and ISG output after relocation (standalone: %s)", async (standalone) => {
    const root = await buildProject({
      entry: "app",
      standalone,
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
