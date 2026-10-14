import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLIENT_RUNTIME_ENTRY,
  ISLANDS_ENTRY,
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
    expect(code).toContain('export * from "@humjs/core/runtime"');
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
    expect(code).toContain('export * from "@humjs/core/runtime"');
    rmSync(root, { recursive: true, force: true });
  });
});

describe("writeBuildEntries", () => {
  it("writes the islands entry as the glob that emits one chunk per island", async () => {
    const root = tempProject();
    const ctx = { options: resolveHumOptions(root) };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, ISLANDS_ENTRY), "utf8");

    expect(entry).toContain("export const islandModules = import.meta.glob(");
    expect(entry).toContain('"/islands/**/*.tsx"');
    expect(entry).toContain('"/routes/**/_islands/**/*.tsx"');
    expect(entry).toContain('"!/routes/**/_islands/**/_components/**"');
    // A `_components` file below the islands directory is an island, exactly
    // like the crawler treats it.
    expect(entry).not.toContain('"!/islands/**/_components/**"');
    rmSync(root, { recursive: true, force: true });
  });

  it("imports the user client entry into the generated runtime entry", async () => {
    const root = tempProject();
    mkdirSync(join(root, "client"), { recursive: true });
    writeFileSync(join(root, "client", "main.ts"), "export {};\n");
    const ctx = { options: resolveHumOptions(root) };

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

  it("mounts Hum onto the entry's app and exports it", async () => {
    const root = tempProject();
    writeFileSync(
      join(root, "server.ts"),
      "export default function start() {}\n",
    );
    const ctx = { options: resolveHumOptions(root) };

    await writeBuildEntries(ctx);
    const entry = await readFile(join(root, SERVER_ENTRY), "utf8");

    // The entry's exports are the API: the app answers `fetch`, and its own
    // `start(app)` — if it has one — is what makes the build serve itself.
    expect(entry).toContain(
      'import * as entry from "' +
        join(root, "server.ts").replace(/\\/g, "/") + '"',
    );
    expect(entry).toContain("const app = entry.default;");
    expect(entry).toContain("await mountHum(app, humConfig);");
    expect(entry).toContain("export default app;");
    expect(entry).toContain('if (typeof entry.start === "function")');
    // Nothing binds a port unless the project said so, so the Node adapter is
    // not the framework's to import.
    expect(entry).not.toContain("@hono/node-server");
    expect(entry).not.toContain("process.env.PORT");
    // The build is the entry's input: importing the generated module registers
    // the routes, the islands and the client assets with the runtime, so
    // mounting needs no configuration of its own.
    expect(entry).toContain('import "virtual:hum/build";');
    expect(entry).not.toContain("startServer");
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
