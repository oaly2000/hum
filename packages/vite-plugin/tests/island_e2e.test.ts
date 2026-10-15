import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
      expect(html).toContain(
        '"Counter":()=>import("/islands/Counter.tsx").then((module)=>module["default"])',
      );
      expect(html).not.toMatch(
        /rel="modulepreload" href="[^"]*Counter/,
      );
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
      expect(html).toMatch(
        /"Counter":\(\)=>import\("\/_hum\/assets\/Counter-[^"]+\.js"\)/,
      );
      expect(html).not.toMatch(
        /rel="modulepreload" href="[^"]*Counter-/,
      );
      expect(html).not.toContain("/islands/Counter.tsx");
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }, 60_000);

  it("reloads the client when a lazy island module changes", async () => {
    const root = await project();
    const islandFile = join(root, "islands", "Counter.tsx");
    const original = await readFile(islandFile, "utf8");
    const server = await createServer({
      configFile: false,
      root,
      plugins: [hum()],
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });
    let socket: WebSocket | undefined;

    try {
      await server.listen();
      const { port } = server.httpServer?.address() as AddressInfo;
      const origin = `http://127.0.0.1:${port}`;
      const response = await fetch(origin);
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(html).toContain(
        '"Counter":()=>import("/islands/Counter.tsx").then((module)=>module["default"])',
      );

      const moduleResponse = await fetch(`${origin}/islands/Counter.tsx`);
      expect(moduleResponse.status).toBe(200);

      const client = await (await fetch(`${origin}/@vite/client`)).text();
      const token = client.match(/const wsToken = "([^"]+)"/)?.[1];
      expect(token).toBeDefined();
      socket = new WebSocket(
        `ws://127.0.0.1:${port}/?token=${token}`,
        "vite-hmr",
      );
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timed out connecting to Vite HMR.")),
          5_000,
        );
        socket!.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        socket!.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("Could not connect to Vite HMR."));
        }, { once: true });
      });

      const fullReload = new Promise<{ type: string; path?: string }>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Vite did not signal a full reload.")),
            10_000,
          );
          socket!.addEventListener("message", ({ data }) => {
            const message = JSON.parse(String(data)) as {
              type?: string;
              path?: string;
            };
            if (message.type === "full-reload") {
              clearTimeout(timer);
              resolve({ type: message.type, path: message.path });
            }
          });
        },
      );

      await writeFile(
        islandFile,
        original.replace(
          "<button onClick",
          '<button data-hmr="updated" onClick',
        ),
      );
      await expect(fullReload).resolves.toEqual({
        type: "full-reload",
        path: "*",
      });
      const deadline = Date.now() + 5_000;
      let updatedCode = "";
      while (Date.now() < deadline) {
        const updatedModule = await fetch(
          `${origin}/islands/Counter.tsx?t=${Date.now()}`,
        );
        updatedCode = await updatedModule.text();
        if (updatedCode.includes('"data-hmr": "updated"')) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(updatedCode).toContain('"data-hmr": "updated"');
    } finally {
      socket?.close();
      await server.close();
      await writeFile(islandFile, original);
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }, 30_000);
});
