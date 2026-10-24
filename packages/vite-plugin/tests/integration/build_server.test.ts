import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { buildProject, exists } from "../helpers/build.js";

import { RUNTIME_RESOURCE_FILES } from "../helpers/runtime_resource.js";

describe("production server entries", () => {
  it.each([false, true])("preserves application exports and entry side effects (standalone: %s)", async (standalone) => {
    const root = await buildProject({ entry: "app", standalone });

    try {
      const entry = await readFile(join(root, "dist", "server.js"), "utf8");
      // Nothing binds a port and nothing reaches for the Node adapter: the
      // build is handed to whatever calls its fetch, and the project said so by
      // exporting the application without starting a listener.
      expect(entry).not.toContain("overrideGlobalObjects");
      expect(entry).not.toContain("process.env.PORT");
      expect(entry).not.toContain("@hono/node-server");

      // A Hono instance *is* its fetch handler, so a runtime that calls `fetch`
      // — a Worker, an edge runtime, a test — can import the bundle as it is.
      const built = await import(
        pathToFileURL(join(root, "dist", "server.js")).href
      ) as {
        default: { fetch: typeof fetch };
        customExport: string;
        sideEffects: string[];
        start: () => never;
      };
      expect(built.customExport).toBe("preserved");
      expect(built.sideEffects).toEqual(["entry evaluated"]);
      expect(built.start).toThrow("start is an ordinary export");
      const response = await built.default.fetch(
        new Request("http://localhost/"),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("home");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps application modules and package resources usable through Node", async () => {
    const buildSideEffect = `hum-test-prerender-${crypto.randomUUID()}`;
    const root = await buildProject({
      files: {
        ...RUNTIME_RESOURCE_FILES,
        "server.ts": `export { default } from "./app";
export const customExport = "preserved";
export const sideEffects: string[] = [];
sideEffects.push("entry evaluated");
`,
        "app.ts": `import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { packageMessage } from "hum-runtime-resource";
const app = new Hono();
app.get("/api/resource", (c) => c.text(packageMessage()));
await mountHum(app, config);
export default app;
`,
        "islands/Counter.tsx": `import { defineIsland } from "@humjs/core/shared"; export default defineIsland(function Counter() { return <button>count</button>; });`,
      },
      routes: {
        "index.tsx": `import { define, page } from "@humjs/core";
import { packageMessage } from "hum-runtime-resource";
import Counter from "../islands/Counter";
globalThis[Symbol.for(${JSON.stringify(buildSideEffect)})] = true;
export const config = define.config({ render: { mode: "ssg" } });
export const handlers = { GET: () => page({ message: packageMessage() }) };
export default ({ data }) => <main><p>{data.message}</p><Counter /></main>;
`,
      },
    });
    try {
      expect(Reflect.get(globalThis, Symbol.for(buildSideEffect))).toBeUndefined();
      const output = join(root, "dist");
      for (const file of ["server.js", "app.js", "routes/index.js", "islands/Counter.js"]) {
        expect(await exists(join(output, file)), file).toBe(true);
      }
      expect(await exists(join(output, "_generated"))).toBe(true);
      expect(await exists(join(output, "_generated", "prerender.js"))).toBe(false);
      const source = await readFile(join(output, "app.js"), "utf8");
      expect(source).toContain('"hum-runtime-resource"');
      expect(source).toContain('"hono"');
      expect(source).not.toContain("createRequire");

      // Execute the generated tree after removing application sources. Node
      // resolves the external package and its own resource from node_modules.
      for (const file of ["server.ts", "app.ts", "routes", "islands"]) {
        await rm(join(root, file), { recursive: true, force: true });
      }
      const built = await import(pathToFileURL(join(output, "server.js")).href);
      expect(built.customExport).toBe("preserved");
      expect(built.sideEffects).toEqual(["entry evaluated"]);
      const api = await built.default.request("/api/resource");
      expect(api.status).toBe(200);
      expect(await api.text()).toBe("package resource survives");
      const page = await built.default.request("/");
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain("package resource survives");
      expect(html).toContain("hum:island");
      expect(built.default.hum.build.pages["/"].body).toBe(html);
    } finally {
      Reflect.deleteProperty(globalThis, Symbol.for(buildSideEffect));
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs the entry's top-level Node listener", async () => {
    const root = await buildProject({ entry: "start" });

    try {
      const entry = await readFile(join(root, "dist", "server.js"), "utf8");
      // The project's own entry owns the listener, so its adapter and its
      // port are in the bundle and nothing else put them there.
      expect(entry).toContain("overrideGlobalObjects");
      expect(entry).toContain("process.env.PORT");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
