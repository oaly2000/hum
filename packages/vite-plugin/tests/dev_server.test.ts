import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, relative, resolve } from "node:path";

import { createServer } from "vite";
import { describe, expect, it } from "vitest";

import { hum } from "../src/mod.js";

describe("Hum Vite dev server", () => {
  it("keeps running and discovers a route created after startup", async () => {
    const root = resolve(process.cwd(), "packages", "docs");
    const routesRoot = await mkdtemp(join(root, "routes", "watch-test-"));
    const routesDir = relative(root, routesRoot).replace(/\\/g, "/");
    await writeFile(
      join(routesRoot, "index.tsx"),
      'export default function Home() { return "home"; }\n',
    );
    await writeFile(
      join(routesRoot, "streaming.tsx"),
      `import { createResource, define, page, type Resource } from "@hum/core";
import { Suspense } from "preact/compat";

type PageData = { value: Resource<string> };
const loadValue = () => new Promise<string>((resolve) =>
  setTimeout(() => resolve("late-value"), 1000)
);

export const config = define.config({ streaming: true });
export const handlers = define.handlers({
  GET: () => page({ value: createResource(loadValue()) }),
});

function DelayedValue({ value }: PageData) {
  return <p>{value.read()}</p>;
}

export default define.page<PageData>(({ data }) => (
  <Suspense fallback={<p>waiting-value</p>}>
    {data && <DelayedValue value={data.value} />}
  </Suspense>
));
`,
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

      const streaming = await fetch(`${origin}/streaming`);
      expect(streaming.status).toBe(200);
      const reader = streaming.body!.getReader();
      const decoder = new TextDecoder();
      const first = await reader.read();
      expect(first.done).toBe(false);
      const initialHtml = decoder.decode(first.value, { stream: true });
      expect(initialHtml).toContain("waiting-value");
      expect(initialHtml).not.toContain("late-value");

      let streamedHtml = initialHtml;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        streamedHtml += decoder.decode(value, { stream: true });
      }
      streamedHtml += decoder.decode();
      expect(streamedHtml).toContain("late-value");

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
