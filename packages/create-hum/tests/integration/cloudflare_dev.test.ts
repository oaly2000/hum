import { rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";

import { createServer } from "vite";
import { describe, expect, it } from "vitest";

import { scaffold, templatePath } from "../../src/scaffold.js";

/**
 * Fetches until the answer carries `marker`, so a test does not decide how long
 * the worker takes to come back with the change it just made.
 */
async function fetchUntil(
  origin: string,
  path: string,
  marker: string,
): Promise<Response> {
  const deadline = Date.now() + 30_000;
  let response = await fetch(`${origin}${path}`);
  while (
    Date.now() < deadline &&
    !(await response.clone().text()).includes(marker)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    response = await fetch(`${origin}${path}`);
  }
  return response;
}

/**
 * The Cloudflare template's development server, end to end.
 *
 * The project is scaffolded inside the documentation site so that it resolves
 * its dependencies the way an installed project would — Hono, Preact and the
 * framework from that package, `@cloudflare/vite-plugin` and `wrangler` from
 * the workspace root — instead of the published versions this machine has no
 * copy of.
 */
describe("the Cloudflare template in development", () => {
  it("renders pages in workerd and emits island boot metadata", async () => {
    const target = join(
      resolve(process.cwd(), "packages", "docs"),
      "cfv-template-check",
    );
    await rm(target, { recursive: true, force: true }).catch(() => {});
    await scaffold(
      target,
      "cfv-template-check",
      await templatePath("cloudflare"),
    );

    // Answers truthfully only about the runtime it renders in: the Cache API is
    // a Worker global and Node has none.
    await writeFile(
      join(target, "routes", "runtime.tsx"),
      `export default function Runtime() {
  return <p>{typeof caches === "undefined" ? "node" : "workerd"}</p>;
}
`,
    );

    const server = await createServer({
      root: target,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const { port } = server.httpServer?.address() as AddressInfo;
      const origin = `http://127.0.0.1:${port}`;

      const home = await fetch(`${origin}/`);
      const html = await home.text();
      const runtime = await fetch(`${origin}/runtime`);
      const runtimeHtml = await runtime.text();

      expect(home.status, html).toBe(200);
      expect(html).toContain("hum:island");
      expect(html).toContain("boot(");
      // The page came from workerd, not from Hum's dev middleware: that
      // middleware inlines the styles of the client entry, and nothing here
      // went through it.
      expect(html).not.toContain("data-vite-dev-id");

      expect(runtime.status, runtimeHtml).toBe(200);
      expect(runtimeHtml).toContain("workerd");

      // The application entry owns its Hono instance. Invalidating its build
      // dependency recreates the app when the route table changes.
      await writeFile(
        join(target, "routes", "index.tsx"),
        'export default function Home() { return <p>edited-home</p>; }\n',
      );
      const edited = await fetchUntil(origin, "/", "edited-home");
      expect(edited.status, await edited.text()).toBe(200);

      await writeFile(
        join(target, "routes", "added.tsx"),
        'export default function Added() { return <p>added-page</p>; }\n',
      );
      const added = await fetchUntil(origin, "/added", "added-page");
      expect(added.status, await added.text()).toBe(200);
    } finally {
      await server.close();
      await rm(target, { recursive: true, force: true }).catch(() => {});
    }
  }, 120_000);
});
