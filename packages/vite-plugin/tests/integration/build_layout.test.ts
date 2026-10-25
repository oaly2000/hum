import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildProject, exists, serverSources } from "../helpers/build.js";

describe("the default production artifact", () => {
  let root: string;
  beforeAll(async () => {
    root = await buildProject({ configure: () => ({
      build: { sourcemap: true },
      environments: { ssr: { build: { sourcemap: false } } },
    }) });
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("publishes every client asset under <outDir>/public/_hum", async () => {
    const outDir = "dist";

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
    const files = await readdir(join(root, outDir, "public", "_hum", "assets"));
    expect(files.some(file => /^islands-/.test(file))).toBe(false);
    expect(files.some(file => file.endsWith(".js.map"))).toBe(true);
    for (const map of files.filter(file => file.endsWith(".js.map"))) {
      expect(files).toContain(map.slice(0, -4));
    }
  });

  it("defaults the output directory to dist", async () => {
    expect(await exists(join(root, "dist", "server.js"))).toBe(true);
    expect(await exists(join(root, "dist", "public", "_hum"))).toBe(true);
    expect(await exists(join(root, "dist", ".hum-client"))).toBe(false);
    expect(await exists(join(root, "_hum"))).toBe(false);
  });

  it("addresses the client assets through /_hum, never through the outDir", async () => {
    const outDir = "dist";

    const entry = await serverSources(join(root, outDir));
    // The URL is in the build; the directory name is not, so deploying the
    // same build as `wwwroot` changes nothing for the client.
    expect(entry).toMatch(/"?assetsBase"?\s*:\s*"\/_hum"/);
    expect(entry).not.toContain(`/_hum/${outDir}`);
    expect(entry).not.toContain('"/dist/');
  });

  it("starts a Node listener by default", async () => {
    const entry = await readFile(join(root, "dist", "server.js"), "utf8");
    // The default build serves itself: the entry owns the HTTP listener.
    expect(entry).toContain("overrideGlobalObjects: false");
    expect(entry).toContain("process.env.PORT");
  });
});

describe("custom and invalid output directories", () => {
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
});
