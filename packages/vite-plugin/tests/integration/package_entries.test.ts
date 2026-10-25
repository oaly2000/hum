import { rm } from "node:fs/promises";
import { join } from "node:path";

import * as core from "@humjs/core";
import * as buildEntry from "@humjs/core/build";
import * as clientEntry from "@humjs/core/client";
import * as routingEntry from "@humjs/core/routing";
import { build } from "vite";
import { describe, expect, it } from "vitest";

import { createProject } from "../helpers/project.js";

describe("core package entry boundaries", () => {
  it("bundles all application client APIs without loading either runtime", async () => {
    const root = await createProject({
      "entry.ts": `export * from "@humjs/core/client";`,
    });
    try {
      const result = await build({
        root,
        configFile: false,
        logLevel: "silent",
        build: {
          write: false,
          minify: false,
          lib: { entry: join(root, "entry.ts"), formats: ["es"] },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const chunks = outputs.flatMap(output => "output" in output ? output.output : [])
        .filter(chunk => chunk.type === "chunk");
      const modules = chunks.flatMap(chunk => Object.keys(chunk.modules))
        .map(id => id.replace(/\\/g, "/"));
      expect(modules.some(id => /\/core\/dist\/shared\//.test(id))).toBe(true);
      expect(modules.filter(id => /\/core\/dist\/(server|runtime|build|pages)\//.test(id))).toEqual([]);
      const exports = chunks.flatMap(chunk => chunk.exports);
      for (const name of ["defineIsland", "Partial", "asset", "IS_BROWSER", "defineFactory", "add", "setValue", "toggle", "setFromProp"]) {
        expect(exports).toContain(name);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports all application client APIs together and keeps internal helpers private", () => {
    expect(Object.keys(clientEntry).sort()).toEqual([
      "IS_BROWSER", "Partial", "add", "asset", "defineFactory", "defineIsland",
      "setFromProp", "setValue", "toggle",
    ]);
    for (const name of ["defineBuild", "planPages", "prerenderPages", "ASSETS_BASE", "RUNTIME_URL"] as const) {
      expect(buildEntry).toHaveProperty(name);
      expect(core).not.toHaveProperty(name);
    }
    for (const name of ["BuildCache", "defaultLogger", "resolveConfig"]) {
      expect(core).not.toHaveProperty(name);
    }
    for (const name of ["ISLAND_TAG", "ISLAND_TAG_KEY", "islandTagOf", "tagIsland"]) {
      expect(routingEntry).not.toHaveProperty(name);
    }
  });

  it.each(["shared", "events"])("removes the former /%s package entry", (entry) => {
    expect(() => import.meta.resolve(`@humjs/core/${entry}`)).toThrow(/not defined/);
  });
});
