import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLIENT_RUNTIME_ENTRY,
  RESOLVED_USER_ENTRY_VIRTUAL_ID,
  resolveHumOptions,
  SERVER_ENTRY,
  USER_ENTRY_VIRTUAL_ID,
} from "../src/shared.js";
import { humClientEntry } from "../src/plugins/client_entry.js";
import { writeBuildEntries } from "../src/plugins/islands.js";

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "hum-vite-"));
}

describe("hum client entry option", () => {
  it("defaults to client/main.ts", () => {
    const opts = resolveHumOptions("/tmp/project");
    expect(opts.clientEntry).toBe("client/main.ts");
  });

  it("lets the user override the entry path", () => {
    const opts = resolveHumOptions("/tmp/project", {
      clientEntry: "client/index.ts",
    });
    expect(opts.clientEntry).toBe("client/index.ts");
  });
});

describe("humClientEntry plugin", () => {
  it("resolves the virtual user entry id", () => {
    const ctx = {
      options: resolveHumOptions("/tmp/project"),
      project: { routes: [], islands: [] },
    };
    const plugin = humClientEntry(ctx);
    const resolved = (plugin as { resolveId(id: string): unknown }).resolveId(
      USER_ENTRY_VIRTUAL_ID,
    );
    expect(resolved).toBe(RESOLVED_USER_ENTRY_VIRTUAL_ID);
  });

  it("includes the user entry when the file exists and re-exports the runtime", () => {
    const root = tempProject();
    mkdirSync(join(root, "client"), { recursive: true });
    writeFileSync(join(root, "client", "main.ts"), "import './style.css';\n");
    const ctx = {
      options: resolveHumOptions(root),
      project: { routes: [], islands: [] },
    };
    const plugin = humClientEntry(ctx);
    const code = (plugin as { load(id: string): unknown }).load(
      RESOLVED_USER_ENTRY_VIRTUAL_ID,
    ) as string;
    expect(code).toContain("main.ts");
    expect(code).toContain('export * from "@hum/core/runtime"');
    rmSync(root, { recursive: true, force: true });
  });

  it("falls back to a pure runtime re-export when no user entry exists", () => {
    const root = tempProject();
    const ctx = {
      options: resolveHumOptions(root),
      project: { routes: [], islands: [] },
    };
    const plugin = humClientEntry(ctx);
    const code = (plugin as { load(id: string): unknown }).load(
      RESOLVED_USER_ENTRY_VIRTUAL_ID,
    ) as string;
    expect(code).not.toContain("main.ts");
    expect(code).toContain('export * from "@hum/core/runtime"');
    rmSync(root, { recursive: true, force: true });
  });
});

describe("writeBuildEntries", () => {
  it("imports the user client entry into the generated runtime entry", async () => {
    const root = tempProject();
    mkdirSync(join(root, "client"), { recursive: true });
    writeFileSync(join(root, "client", "main.ts"), "export {};\n");
    const ctx = {
      options: resolveHumOptions(root),
      project: { routes: [], islands: [] },
    };
    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, CLIENT_RUNTIME_ENTRY), "utf8");
    // The user entry's global styles are pulled in first...
    expect(entry).toContain("main.ts");
    // ...and the runtime exports are imported and re-exported so they survive
    // the production tree-shaking that otherwise drops unused entry exports
    // (the boot script that consumes them lives outside the bundle).
    expect(entry).toContain("import { boot, revive, applyPartials");
    expect(entry).toContain("export { boot, revive, applyPartials");
    expect(entry).toContain("globalThis.__humRuntime");
    rmSync(root, { recursive: true, force: true });
  });

  it("mounts Hum onto the exported Hono app", async () => {
    const root = tempProject();
    writeFileSync(
      join(root, "server.ts"),
      "export default function start() {}\n",
    );
    const ctx = {
      options: resolveHumOptions(root),
      project: { routes: [], islands: [] },
    };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, SERVER_ENTRY), "utf8");

    expect(entry).toContain(
      'await import("' +
        join(root, "server.ts").replace(/\\/g, "/") + '")',
    );
    expect(entry).toContain("await mountHum(app, humConfig);");
    expect(entry).toContain("serve(app);");
    expect(entry).not.toContain("startServer");
    rmSync(root, { recursive: true, force: true });
  });

  it("starts Hum directly when no custom server entry exists", async () => {
    const root = tempProject();
    const ctx = {
      options: resolveHumOptions(root, { outDir: "dist/hum" }),
      project: { routes: [], islands: [] },
    };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, SERVER_ENTRY), "utf8");

    // The output directory is located next to the server bundle so a renamed
    // or moved deployment keeps working; the depth comes from the configured
    // `outDir`, the actual name from the deployed directory.
    expect(entry).toContain(
      'const buildDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
    );
    expect(entry).toContain('const root = resolve(buildDir, "..", "..");');
    expect(entry).toContain(
      'const outDir = relative(root, buildDir).split(sep).join("/");',
    );
    expect(entry).toContain("  root,\n  routesDir:");
    expect(entry).toContain("  outDir,\n  dev: false,");
    expect(entry).not.toContain(root.replace(/\\/g, "/"));
    expect(entry).toContain("serve(humApp);");
    expect(entry).not.toContain("startServer");
    rmSync(root, { recursive: true, force: true });
  });
});
