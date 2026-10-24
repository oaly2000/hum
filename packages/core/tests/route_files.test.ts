import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { glob } from "tinyglobby";
import { describe, expect, it } from "vitest";

import {
  globPatterns,
  type GlobModules,
  specsFromGlob,
} from "../src/routing/route_files.js";

const FILES = [
  "routes/_layout.tsx",
  "routes/index.tsx",
  "routes/about.ts",
  "routes/-draft.tsx",
  "routes/.hidden.tsx",
  "routes/plain.txt",
  "routes/blog/index.tsx",
  "routes/blog/[id].tsx",
  "routes/blog/_components/Card.tsx",
  "routes/blog/_islands/Editor.tsx",
  "routes/admin/_islands/Chart.tsx",
  "routes/_components/Shared.tsx",
  "islands/Counter.tsx",
  "islands/_components/Control.tsx",
];

async function fixture(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hum-glob-"));
  for (const file of files) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "export default function Component() {}\n");
  }
  return root;
}

/** The `import.meta.glob` result of a set of found files. */
function globModules(files: string[]): GlobModules {
  const modules: GlobModules = {};
  for (const file of files) {
    modules[`/${file}`] = async () => ({ default: () => null });
  }
  return modules;
}

/**
 * Finds the files of a fixture the way the bundler does, using the same
 * patterns the `virtual:hum/routes` module passes to `import.meta.glob`.
 * Glob patterns are rooted at the project; `tinyglobby` globs relative to
 * `cwd`, so the leading slash (and the one behind a `!`) is dropped.
 */
async function find(root: string, patterns: string[]): Promise<string[]> {
  const relative = patterns.map((pattern) =>
    pattern.startsWith("!") ? "!" + pattern.slice(2) : pattern.slice(1)
  );
  return await glob(relative, { cwd: root, onlyFiles: true });
}

describe("specsFromGlob", () => {
  it("discovers only routes and never infers islands from directories", async () => {
    const root = await fixture(FILES);
    try {
      const patterns = globPatterns();
      const routeFiles = await find(root, patterns.routes);
      const manifest = specsFromGlob({ routeModules: globModules(routeFiles) });

      // `FILES` is deliberately full of near misses: a dot file, a `-name`
      // file, a non-module extension, and the reserved `_components`
      // directories. What is left is the whole expectation, unsorted order
      // included, so a pattern change has to be spelled out here.
      expect(manifest.routes.map((spec) => ({
        file: spec.file,
        kind: spec.kind,
        urlPath: spec.urlPath,
      }))).toEqual([
        { file: "routes/_layout.tsx", kind: "layout", urlPath: "/" },
        { file: "routes/about.ts", kind: "route", urlPath: "/about" },
        { file: "routes/blog/[id].tsx", kind: "route", urlPath: "/blog/[id]" },
        { file: "routes/blog/index.tsx", kind: "route", urlPath: "/blog" },
        { file: "routes/index.tsx", kind: "route", urlPath: "/" },
      ]);

      expect(manifest.islands).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("classifies route files", () => {
    const manifest = specsFromGlob({
      routeModules: globModules([
        "routes/index.tsx",
        "routes/blog/[id].tsx",
        "routes/_app.tsx",
        "routes/_layout.tsx",
        "routes/_middleware.ts",
        "routes/_404.tsx",
        "routes/_error.tsx",
      ]),
    });

    expect(manifest.routes.map((spec) => [spec.file, spec.kind])).toEqual([
      ["routes/_404.tsx", "notFound"],
      ["routes/_app.tsx", "app"],
      ["routes/_error.tsx", "error"],
      ["routes/_layout.tsx", "layout"],
      ["routes/_middleware.ts", "middleware"],
      ["routes/blog/[id].tsx", "route"],
      ["routes/index.tsx", "route"],
    ]);
    expect(manifest.routes.find((spec) => spec.kind === "route")!.urlPath)
      .toBe("/blog/[id]");
    expect(manifest.islands).toEqual([]);
  });

  it("registers only explicit declarations and rejects duplicate IDs", () => {
    const island = { name: "i_generated", file: "components/View.tsx", exportName: "View", load: async () => ({}) };
    expect(specsFromGlob({ routeModules: {}, declaredIslands: [island] }).islands).toEqual([island]);
    expect(() => specsFromGlob({ routeModules: {}, declaredIslands: [island, island] }))
      .toThrow('duplicate island identity "i_generated"');
  });

  it("accepts glob keys with and without a leading slash", () => {
    const load = async () => ({});
    const manifest = specsFromGlob({
      routeModules: { "routes/index.tsx": load, "/routes/about.ts": load },
    });

    expect(manifest.routes.map((spec) => spec.file)).toEqual([
      "routes/about.ts",
      "routes/index.tsx",
    ]);
  });
});

describe("globPatterns", () => {
  it("covers every module extension and skips the special directories", () => {
    const patterns = globPatterns();

    expect(patterns.routes).toContain("/routes/**/*.tsx");
    expect(patterns.routes).toContain("/routes/**/*.js");
    expect(patterns.routes).toContain("!/routes/**/_components/**");
    expect(patterns.routes).toContain("!/routes/**/_islands/**");
    expect(patterns.routes).toContain("!/routes/**/*.d.ts");
    expect(patterns.routes).toContain("!/routes/**/node_modules/**");

  });

  it("follows configured directories", () => {
    const patterns = globPatterns({
      routesDir: "src/routes",
    });

    expect(patterns.routes).toContain("/src/routes/**/*.tsx");
  });
});
