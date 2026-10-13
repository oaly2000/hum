import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { h } from "preact";
import { describe, expect, it } from "vitest";

import type { ProdManifest } from "../src/build_cache.js";
import { mountHum } from "../src/mod.js";
import type { HumManifest } from "../src/types.js";

/** A path that holds no project, so any disk read of it fails. */
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
  clientEntry: "client/assets/runtime.js",
  islands: {
    Counter: {
      file: "client/assets/Counter.js",
      css: ["client/assets/Counter.css"],
    },
  },
  entryAssets: ["client/assets/entry.css"],
};

describe("an injected production manifest", () => {
  it("serves the built assets without reading the output directory", async () => {
    const mounted = await mountHum(new Hono(), {
      manifest,
      prodManifest: prod,
      // Nothing may be read from here: the injected manifest is the only
      // source, which is what lets a platform without a file system run.
      root: EMPTY_ROOT,
    });

    const html = await (await mounted.request("http://localhost/")).text();

    expect(html).toContain('from "/_hum/client/assets/runtime.js"');
    expect(html).toContain('"/_hum/client/assets/Counter.js"');
    expect(html).toContain('"/_hum/client/assets/entry.css"');
    // Dev would address the island by the path of its source file.
    expect(html).not.toContain("/islands/Counter.tsx");
  });

  it("treats an injected null as no production build", async () => {
    const mounted = await mountHum(new Hono(), {
      manifest,
      prodManifest: null,
      root: EMPTY_ROOT,
    });

    const html = await (await mounted.request("http://localhost/")).text();
    expect(html).toContain('"/islands/Counter.tsx"');
  });
});

describe("a build manifest that is not there", () => {
  it("is reported instead of silently falling back to dev", async () => {
    const errors: string[] = [];
    const mounted = await mountHum(new Hono(), {
      manifest,
      root: EMPTY_ROOT,
      logger: {
        info() {},
        warn() {},
        error: (...args: unknown[]) => void errors.push(args.join(" ")),
        debug() {},
      },
    });

    expect(errors.join("\n")).toContain("no build manifest found");

    // Hum still answers, in the dev configuration it inferred.
    const response = await mounted.request("http://localhost/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"/islands/Counter.tsx"');
  });
});

describe("the runtime entry", () => {
  it("never imports the file system statically", async () => {
    // A platform without a file system has to be able to import Hum, so
    // `node:fs` may not be a static import of anything the runtime pulls in.
    // `readProdManifest` imports it on demand for exactly that reason, and the
    // route and island manifests arrive through configuration.
    const src = fileURLToPath(new URL("../src", import.meta.url));
    const staticImport = /^[ \t]*import[\s\S]*?from[ \t]*"(node:fs[^"]*|node:url)"/m;
    const importers: string[] = [];

    for (const file of await sourceFiles(src)) {
      const source = await readFile(file, "utf8");
      if (staticImport.test(source)) {
        importers.push(relative(src, file).replace(/\\/g, "/"));
      }
    }

    expect(importers).toEqual([]);
  });

  it("keeps the on-demand file system read in one place", async () => {
    const src = fileURLToPath(new URL("../src", import.meta.url));
    const readers: string[] = [];

    for (const file of await sourceFiles(src)) {
      const source = await readFile(file, "utf8");
      if (/node:fs/.test(source)) {
        readers.push(relative(src, file).replace(/\\/g, "/"));
      }
    }

    expect(readers).toEqual(["build_cache.ts"]);
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
