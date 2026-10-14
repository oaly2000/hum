import { describe, expect, it } from "vitest";

import {
  BUILD_VIRTUAL_ID,
  RESOLVED_BUILD_VIRTUAL_ID,
  resolveHumOptions,
  ROUTES_VIRTUAL_ID,
} from "../src/shared.js";
import {
  buildModuleSource,
  humBuildInput,
} from "../src/plugins/build_input.js";

function context(prod = undefined) {
  return {
    options: resolveHumOptions("/tmp/project"),
    ...(prod === undefined ? {} : { prod }),
  };
}

describe("humBuildInput plugin", () => {
  it("resolves the virtual build id", () => {
    const plugin = humBuildInput(context());
    const resolveId = (plugin as { resolveId(id: string): unknown }).resolveId;

    expect(resolveId.call(null, BUILD_VIRTUAL_ID)).toBe(
      RESOLVED_BUILD_VIRTUAL_ID,
    );
    expect(resolveId.call(null, "./routes/index.tsx")).toBe(null);
  });

  it("loads the build module for its own id only", () => {
    const ctx = context();
    const plugin = humBuildInput(ctx);
    const load = (plugin as { load(id: string): unknown }).load;

    expect(load.call(null, "./routes/index.tsx")).toBe(null);
    expect(load.call(null, RESOLVED_BUILD_VIRTUAL_ID)).toBe(
      buildModuleSource(ctx),
    );
  });
});

describe("buildModuleSource", () => {
  it("registers the routes and islands the routes module resolved", () => {
    const source = buildModuleSource(context());

    expect(source).toContain('import { defineBuild } from "@humjs/core";');
    expect(source).toContain(`import { manifest } from "${ROUTES_VIRTUAL_ID}"`);
    expect(source).toContain("routes: manifest.routes");
    expect(source).toContain("islands: manifest.islands");
    // Development has no client build, so the runtime serves from source.
    expect(source).toContain("prod: null");
    expect(source).not.toContain("node:");
  });

  it("inlines the production assets the build recorded", () => {
    const prod = {
      buildId: "abc123",
      assetsBase: "/_hum",
      clientEntry: "assets/runtime.js",
      islands: { Counter: { file: "assets/Counter.js" } },
      entryAssets: ["assets/entry.css"],
    };
    const source = buildModuleSource(context(prod));

    expect(source).toContain('"buildId":"abc123"');
    expect(source).toContain('"assets/runtime.js"');
    expect(source).toContain('"assets/Counter.js"');
    expect(source).not.toContain("prod: null");
  });
});
