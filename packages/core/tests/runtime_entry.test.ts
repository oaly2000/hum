import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { h } from "preact";
import { describe, expect, it } from "vitest";

import type { ProdManifest } from "../src/build.js";
import { defineBuild, mountHum } from "../src/mod.js";
import type { HumManifest } from "../src/types.js";

/** A path that holds no project, so any disk read of it would fail. */
const EMPTY_ROOT = join(tmpdir(), "hum-no-such-project");

function Counter() {
  return h("button", { id: "counter" }, "count");
}

const manifest: HumManifest = {
  islands: [
    {
      name: "Counter",
      exportName: "default",
      file: "islands/Counter.tsx",
      load: async () => ({ default: Counter }),
    },
  ],
  routes: [
    {
      file: "routes/index.tsx",
      kind: "route",
      urlPath: "/",
      load: async () => ({
        default: () => h("main", { id: "home" }, h(Counter, null)),
      }),
    },
  ],
};

const prod: ProdManifest = {
  buildId: "abc123",
  assetsBase: "/_hum",
  clientEntry: "assets/runtime.js",
  islands: {
    Counter: {
      file: "assets/Counter.js",
      css: ["assets/Counter.css"],
    },
  },
  entryAssets: ["assets/entry.css"],
};

describe("a build that carries its production assets", () => {
  it("serves them without reading the output directory", async () => {
    defineBuild({ ...manifest, prod });
    const mounted = await mountHum(new Hono(), {
      // Nothing may be read from here: the build is the only source, which is
      // what lets a platform without a file system run.
      root: EMPTY_ROOT,
    });

    const html = await (await mounted.request("http://localhost/")).text();

    expect(html).toContain('from "/_hum/assets/runtime.js"');
    expect(html).toContain('"/_hum/assets/Counter.js"');
    expect(html).toContain('"/_hum/assets/entry.css"');
    // Running from source would address the island by its source file path.
    expect(html).not.toContain("/islands/Counter.tsx");
  });

  it("keeps the build it was mounted with", async () => {
    defineBuild({ ...manifest, prod });
    const first = await mountHum(new Hono(), { root: EMPTY_ROOT });

    // A second build is registered before another app is mounted; the first one
    // keeps serving the assets it was mounted with.
    defineBuild({ ...manifest, prod: null });
    const second = await mountHum(new Hono(), { root: EMPTY_ROOT, dev: true });

    expect(await (await first.request("http://localhost/")).text()).toContain(
      'from "/_hum/assets/runtime.js"',
    );
    expect(await (await second.request("http://localhost/")).text()).toContain(
      '"/islands/Counter.tsx"',
    );
  });
});

describe("a build without production assets", () => {
  it("runs from source", async () => {
    defineBuild({ ...manifest, prod: null });
    const mounted = await mountHum(new Hono(), {
      root: EMPTY_ROOT,
      dev: true,
    });

    const html = await (await mounted.request("http://localhost/")).text();
    expect(html).toContain('"/islands/Counter.tsx"');
  });

  it("is reported instead of silently falling back to dev", async () => {
    const errors: string[] = [];
    defineBuild({ ...manifest, prod: null });
    const mounted = await mountHum(new Hono(), {
      root: EMPTY_ROOT,
      logger: {
        info() {},
        warn() {},
        error: (...args: unknown[]) => void errors.push(args.join(" ")),
        debug() {},
      },
    });

    expect(errors.join("\n")).toContain("carries no production assets");

    // Hum still answers, in the dev configuration it inferred.
    const response = await mounted.request("http://localhost/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"/islands/Counter.tsx"');
  });
});

describe("mounting without a build", () => {
  it("reports what is missing instead of serving an empty app", async () => {
    // The registration lives on `globalThis` so a bundler's own copy of the
    // framework sees it; dropping it puts the runtime back where a project that
    // never imported its build module starts.
    delete (globalThis as unknown as Record<symbol, unknown>)[
      Symbol.for("hum.build")
    ];

    await expect(mountHum(new Hono(), { dev: true })).rejects.toThrow(
      /no build registered/,
    );
  });
});

describe("the runtime entry", () => {
  it("never touches the file system", async () => {
    // A platform without a file system has to be able to run Hum, so `node:fs`
    // may not appear anywhere in the runtime: the build arrives through
    // `defineBuild`, and even the URL an asset is served from comes from it.
    const src = fileURLToPath(new URL("../src", import.meta.url));
    const readers: string[] = [];

    for (const file of await sourceFiles(src)) {
      const source = await readFile(file, "utf8");
      if (/node:(fs|url)/.test(source)) {
        readers.push(relative(src, file).replace(/\\/g, "/"));
      }
    }

    expect(readers).toEqual([]);
  });
});

async function sourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
