import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build, createServer } from "vite";
import { describe, expect, it } from "vitest";

import { hum } from "../src/mod.js";

const ISLAND = `import { useState } from "preact/hooks";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

const PAGE = `import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <div>
      <p>home</p>
      <Counter />
    </div>
  );
}
`;

/**
 * Writes a project with one island. Inside this package, so the fixture
 * resolves Preact, Hono and the framework's JSX settings the way a real project
 * does — which matters here: whether an island is recognized is the whole
 * question.
 */
async function project(): Promise<string> {
  const root = await mkdtemp(
    join(resolve(process.cwd(), "packages", "vite-plugin"), "island-fixture-"),
  );
  await mkdir(join(root, "routes"), { recursive: true });
  await mkdir(join(root, "islands"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "hum-island-fixture", type: "module" }) + "\n",
  );
  // A project's own JSX settings, independent of the directory the fixture
  // happens to live in: Hum's islands are Preact components, and a fixture that
  // compiled them for React would test something else entirely.
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "preact",
        skipLibCheck: true,
      },
    }) + "\n",
  );
  await writeFile(join(root, "islands", "Counter.tsx"), ISLAND);
  await writeFile(join(root, "routes", "index.tsx"), PAGE);
  await writeFile(
    join(root, "routes", "_app.tsx"),
    `import type { ComponentChildren } from "preact";

export default function App(props: { children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
`,
  );
  // An entry that exports the app and nothing that serves it: the build is
  // imported by a runtime, as the production half of this test does.
  await writeFile(
    join(root, "server.ts"),
    `import { Hono } from "hono";

const app = new Hono();

export default app;
`,
  );
  return root;
}

/**
 * An island is recognized because the bundler stamped its component, so both
 * passes have to leave the same stamp behind: a dev server that finds the
 * island and a production build that serves it inert is exactly the failure
 * this covers.
 */
describe("islands reach the client from either pass", () => {
  it("wraps the island in markers in the dev server", async () => {
    const root = await project();
    const server = await createServer({
      configFile: false,
      root,
      plugins: [hum()],
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const { port } = server.httpServer?.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const html = await response.text();

      expect(response.status, html).toBe(200);
      expect(html).toContain("<!--hum:island:Counter:0:-->");
      expect(html).toContain("<!--/hum:island-->");
      // In dev the island is served from its source path, so the boot script
      // pulls the module Vite transforms on demand.
      expect(html).toContain('import hum_island_0 from "/islands/Counter.tsx"');
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }, 30_000);

  it("wraps the island in markers in the production build", async () => {
    const root = await project();

    try {
      await build({
        root,
        configFile: false,
        plugins: [hum()],
        logLevel: "silent",
      });

      const built = await import(
        pathToFileURL(join(root, "dist", "server.js")).href
      ) as { default: { fetch: typeof fetch } };
      const response = await built.default.fetch(
        new Request("http://localhost/"),
      );
      const html = await response.text();

      expect(response.status, html).toBe(200);
      expect(html).toContain("<!--hum:island:Counter:0:-->");
      expect(html).toContain("<!--/hum:island-->");
      // The same island, addressed through the assets the build published.
      expect(html).toContain("hum_island_0 from");
      expect(html).toContain("/_hum/assets/");
      expect(html).not.toContain("/islands/Counter.tsx");
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }, 60_000);
});
