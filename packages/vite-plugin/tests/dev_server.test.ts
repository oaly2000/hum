import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, relative, resolve } from "node:path";

import { createServer } from "vite";
import { describe, expect, it } from "vitest";

import { hum } from "../src/mod.js";

describe("Hum Vite dev server", () => {
  it("keeps running and discovers a route created after startup", async () => {
    const root = resolve(process.cwd(), "examples", "basic");
    const routesRoot = await mkdtemp(join(root, "routes", "watch-test-"));
    const routesDir = relative(root, routesRoot).replace(/\\/g, "/");
    await writeFile(
      join(routesRoot, "index.tsx"),
      'export default function Home() { return "home"; }\n',
    );

    const server = await createServer({
      configFile: false,
      root,
      plugins: hum({ routesDir }),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;
      const home = await fetch(origin);
      expect(home.status, await home.text()).toBe(200);
      const api = await fetch(`${origin}/api/health`);
      expect(api.status).toBe(200);
      expect(api.headers.get("x-powered-by")).toBe("Hum + Hono");

      await writeFile(
        join(routesRoot, "new-page.tsx"),
        'export default function NewPage() { return "new route"; }\n',
      );

      const routeUrl = "/new-page";
      const deadline = Date.now() + 5_000;
      let route: Response | undefined;
      while (Date.now() < deadline) {
        route = await fetch(`${origin}${routeUrl}`);
        if (route.status === 200) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const routeHtml = await route?.text();
      expect(route?.status, routeHtml).toBe(200);
      expect(routeHtml).toContain("new route");
      expect((await fetch(origin)).status).toBe(200);
    } finally {
      await server.close();
      await rm(routesRoot, { recursive: true, force: true });
    }
  }, 15_000);
});
