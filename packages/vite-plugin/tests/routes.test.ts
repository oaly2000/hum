import { describe, expect, it } from "vitest";

import {
  RESOLVED_ROUTES_VIRTUAL_ID,
  resolveHumOptions,
  ROUTES_VIRTUAL_ID,
} from "../src/shared.js";
import { humRoutes, routesModuleSource } from "../src/plugins/routes.js";

describe("humRoutes plugin", () => {
  it("resolves the virtual routes id", () => {
    const ctx = {
      options: resolveHumOptions("/tmp/project"),
      project: { routes: [], islands: [] },
    };
    const plugin = humRoutes(ctx);
    const resolveId = (plugin as { resolveId(id: string): unknown }).resolveId;

    expect(resolveId.call(null, ROUTES_VIRTUAL_ID)).toBe(
      RESOLVED_ROUTES_VIRTUAL_ID,
    );
    expect(resolveId.call(null, "./routes/index.tsx")).toBe(null);
  });

  it("loads the manifest module for its own id only", () => {
    const ctx = {
      options: resolveHumOptions("/tmp/project"),
      project: { routes: [], islands: [] },
    };
    const plugin = humRoutes(ctx);
    const load = (plugin as { load(id: string): unknown }).load;

    expect(load.call(null, "./routes/index.tsx")).toBe(null);
    expect(load.call(null, RESOLVED_ROUTES_VIRTUAL_ID)).toBe(
      routesModuleSource(ctx.options),
    );
  });
});

describe("routesModuleSource", () => {
  it("enumerates the routes and islands with import.meta.glob", () => {
    const source = routesModuleSource(resolveHumOptions("/tmp/project"));

    expect(source).toContain("import.meta.glob(");
    expect(source).toContain('"/routes/**/*.tsx"');
    expect(source).toContain('"!/routes/**/_components/**"');
    expect(source).toContain("specsFromGlob");
    expect(source).toContain('routesDir: "routes"');
    expect(source).toContain("manifest");
    expect(source).toContain("hum-client-metadata");
    expect(source).not.toContain("const localIslandModules");
    expect(source).not.toContain("islandsDir");
  });

  it("follows a custom routes directory", () => {
    const source = routesModuleSource(
      resolveHumOptions("/tmp/project", {
        routesDir: "src/routes",
      }),
    );

    expect(source).toContain('"/src/routes/**/*.tsx"');
    expect(source).toContain('routesDir: "src/routes"');
  });

  it("stays free of Node built-ins, so it can run anywhere", () => {
    const source = routesModuleSource(resolveHumOptions("/tmp/project"));

    expect(source).not.toContain("node:");
  });
});
