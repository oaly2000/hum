import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { glob } from "tinyglobby";
import { describe, expect, it } from "vitest";

import { crawlProject } from "../src/discovery/fs_crawl.js";
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
  it("finds the same routes and islands as the filesystem crawler", async () => {
    const root = await fixture(FILES);
    try {
      const patterns = globPatterns();
      const [routeFiles, islandFiles, localIslandFiles] = await Promise.all([
        find(root, patterns.routes),
        find(root, patterns.islands),
        find(root, patterns.localIslands),
      ]);

      const crawled = await crawlProject({ root });
      const globbed = specsFromGlob({
        routeModules: globModules(routeFiles),
        islandModules: globModules(islandFiles),
        localIslandModules: globModules(localIslandFiles),
      });

      expect(globbed.routes.map((spec) => ({
        file: spec.file,
        kind: spec.kind,
        urlPath: spec.urlPath,
      }))).toEqual(crawled.routes.map((spec) => ({
        file: spec.file,
        kind: spec.kind,
        urlPath: spec.urlPath,
      })));

      expect(globbed.islands.map((spec) => ({
        name: spec.name,
        file: spec.file,
      }))).toEqual(crawled.islands.map((spec) => ({
        name: spec.name,
        file: spec.file,
      })));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("classifies route files and names islands", () => {
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
      islandModules: globModules(["islands/Counter.tsx"]),
      localIslandModules: globModules([
        "routes/blog/_islands/Editor.tsx",
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
    expect(manifest.islands.map((spec) => [spec.name, spec.file])).toEqual([
      ["Counter", "islands/Counter.tsx"],
      ["local_blog__islands_Editor", "routes/blog/_islands/Editor.tsx"],
    ]);
  });

  it("keeps the first island of a duplicated name and warns", () => {
    const warnings: string[] = [];
    const manifest = specsFromGlob({
      islandModules: globModules([
        "islands/a-b.tsx",
        "islands/a_b.tsx",
      ]),
      routeModules: {},
      localIslandModules: {},
      logger: {
        info() {},
        warn: (...args: unknown[]) => void warnings.push(args.join(" ")),
        error() {},
        debug() {},
      },
    });

    expect(manifest.islands.map((spec) => spec.name)).toEqual(["a_b"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"a_b"');
  });

  it("accepts glob keys with and without a leading slash", () => {
    const load = async () => ({});
    const manifest = specsFromGlob({
      routeModules: { "routes/index.tsx": load },
      islandModules: { "/islands/Counter.tsx": load },
      localIslandModules: {},
    });

    expect(manifest.routes.map((spec) => spec.file)).toEqual([
      "routes/index.tsx",
    ]);
    expect(manifest.islands.map((spec) => spec.file)).toEqual([
      "islands/Counter.tsx",
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

    expect(patterns.islands).toContain("/islands/**/*.tsx");
    // The islands directory has no reserved sub directory: a `_components`
    // file below it is an island, exactly like the crawler treats it.
    expect(patterns.islands.some((pattern) => pattern.includes("_components")))
      .toBe(false);

    expect(patterns.localIslands).toContain(
      "/routes/**/_islands/**/*.tsx",
    );
    expect(patterns.localIslands).toContain(
      "!/routes/**/_islands/**/_components/**",
    );
  });

  it("follows configured directories", () => {
    const patterns = globPatterns({
      routesDir: "src/routes",
      islandsDir: "/src/islands/",
    });

    expect(patterns.routes).toContain("/src/routes/**/*.tsx");
    expect(patterns.islands).toContain("/src/islands/**/*.tsx");
    expect(patterns.localIslands).toContain(
      "/src/routes/**/_islands/**/*.tsx",
    );
  });
});
