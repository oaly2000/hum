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

import { build } from "vite";
import { describe, expect, it } from "vitest";

import { hum } from "../src/mod.js";

/**
 * Builds a throwaway project and inspects the output it produced. The project
 * carries a `public/` directory of its own, which is what ties the build's
 * public tree to the one the app serves.
 */
async function buildProject(outDir?: string): Promise<string> {
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
    'export default function Home() { return "home"; }\n',
  );
  await mkdir(join(root, "islands"), { recursive: true });
  await writeFile(
    join(root, "islands", "Counter.tsx"),
    "export default function Counter() { return null; }\n",
  );
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "public", "robots.txt"), "User-agent: *\n");
  await writeFile(join(root, "public", "favicon.svg"), "<svg/>\n");

  await build({
    root,
    configFile: false,
    plugins: [hum(outDir === undefined ? {} : { outDir })],
    logLevel: "silent",
    ...(outDir === undefined ? {} : { build: { outDir } }),
  });

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
    const root = await buildProject(outDir);

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
    const root = await buildProject(outDir);

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
    const root = await buildProject(outDir);

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
}, 60_000);
