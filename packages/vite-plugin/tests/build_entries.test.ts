import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLIENT_RUNTIME_ENTRY,
  ISLANDS_ENTRY,
  resolveHumOptions,
  SERVER_ENTRY,
} from "../src/shared.js";
import { writeBuildEntries } from "../src/plugins/islands.js";

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "hum-vite-"));
}

describe("hum server entry option", () => {
  it("defaults to server.ts", () => {
    const opts = resolveHumOptions("/tmp/project");
    expect(opts.serverEntry).toBe("server.ts");
    expect(opts.devEntry).toBe("server.ts");
  });

  it("lets the user select a runtime-specific entry", () => {
    const opts = resolveHumOptions("/tmp/project", {
      serverEntry: "server.cloudflare.ts",
    });
    expect(opts.serverEntry).toBe("server.cloudflare.ts");
    expect(opts.devEntry).toBe("server.cloudflare.ts");
  });
  it("loads a separate app module in development", () => {
    const opts = resolveHumOptions("/tmp/project", { devEntry: "app.ts" });
    expect(opts.serverEntry).toBe("server.ts");
    expect(opts.devEntry).toBe("app.ts");
  });

});

describe("writeBuildEntries", () => {
  it("writes the islands entry as the metadata glob that emits chunks for declared modules", async () => {
    const root = tempProject();
    const ctx = { options: resolveHumOptions(root) };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, ISLANDS_ENTRY), "utf8");

    expect(entry).toContain("export const islandModules = import.meta.glob(");
    expect(entry).toContain('"/**/*.{ts,tsx,js,jsx}"');
    expect(entry).toContain("hum-client-metadata");
    expect(entry).not.toContain('"/islands/**/*.tsx"');
    rmSync(root, { recursive: true, force: true });
  });

  it("generates the framework runtime without importing a former user entry", async () => {
    const root = tempProject();
    mkdirSync(join(root, "client"), { recursive: true });
    writeFileSync(join(root, "client", "main.ts"), "export {};\n");
    const ctx = { options: resolveHumOptions(root) };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, CLIENT_RUNTIME_ENTRY), "utf8");
    expect(entry).not.toContain("main.ts");
    // ...and the runtime exports are imported and re-exported so they survive
    // the production tree-shaking that otherwise drops unused entry exports
    // (the boot script that consumes them lives outside the bundle).
    expect(entry).toContain("import { boot, revive, applyPartials");
    expect(entry).toContain("export { boot, revive, applyPartials");
    expect(entry).toContain("globalThis.__humRuntime");
    rmSync(root, { recursive: true, force: true });
  });

  it("leaves a supplied production entry to the bundler", async () => {
    const root = tempProject();
    writeFileSync(join(root, "server.ts"), "console.log('user entry');\n");
    await writeBuildEntries({ options: resolveHumOptions(root) });
    await expect(access(join(root, SERVER_ENTRY))).rejects.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it("starts Hum directly when no custom server entry exists", async () => {
    const root = tempProject();
    const ctx = { options: resolveHumOptions(root, { outDir: "dist/hum" }) };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, SERVER_ENTRY), "utf8");

    // Routes, islands and client assets all travel inside the build module, so
    // the entry locates nothing on disk: it stays free of the paths of the
    // machine that produced it, and a renamed or moved deployment keeps
    // working.
    expect(entry).toContain('import "virtual:hum/build";');
    expect(entry).toContain("  routesDir:");
    expect(entry).toContain("  dev: false,");
    expect(entry).not.toContain(root.replace(/\\/g, "/"));
    expect(entry).not.toContain("node:path");
    expect(entry).not.toContain("node:url");
    expect(entry).toContain("const app = await createApp(humConfig);");
    expect(entry).toContain('import { serve } from "@hono/node-server";');
    // There is no entry to hand the app to, so this build serves itself and is
    // not something a platform imports.
    expect(entry).not.toContain("export default app;");
    expect(entry).not.toContain("startServer");
    rmSync(root, { recursive: true, force: true });
  });
});
