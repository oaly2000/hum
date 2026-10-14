import { rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";

import { createServer } from "vite";
import { describe, expect, it } from "vitest";

import { scaffold, templatePath } from "../src/scaffold.js";

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
  it("renders pages in workerd, with the islands hydrated from there", async () => {
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
    } finally {
      await server.close();
      await rm(target, { recursive: true, force: true }).catch(() => {});
    }
  }, 120_000);
});
