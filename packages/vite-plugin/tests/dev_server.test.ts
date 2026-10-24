import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, relative, resolve } from "node:path";

import { createServer } from "vite";
import { describe, expect, it, vi } from "vitest";
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

import { hum } from "../src/mod.js";

describe("Hum Vite dev server", () => {
  it("shares middleware resources with route views across the SSR module runner", async () => {
    const root = resolve(process.cwd(), "packages", "docs");
    const routesRoot = await mkdtemp(
      join(root, "routes", "resource-manager-test-"),
    );
    const routesDir = relative(root, routesRoot).replace(/\\/g, "/");
    const componentsRoot = join(routesRoot, "_components");
    await mkdir(componentsRoot, { recursive: true });
    await writeFile(
      join(componentsRoot, "resource-key.ts"),
      `import { createResourceKey } from "@humjs/core";
export const messageKey = createResourceKey<string>("dev-test.message");
`,
    );
    await writeFile(
      join(routesRoot, "_middleware.ts"),
      `import { registerResource } from "@humjs/core";
import { messageKey } from "./_components/resource-key";

export default async function middleware(c, next) {
  registerResource(messageKey, async () => c.req.header("x-message") ?? "missing");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await next();
}
`,
    );
    await writeFile(
      join(routesRoot, "_layout.tsx"),
      `import { getResource } from "@humjs/core";
import { messageKey } from "./_components/resource-key";

export default function Layout({ children }) {
  return <section>{getResource(messageKey).read()}{children}</section>;
}
`,
    );
    await writeFile(
      join(routesRoot, "index.tsx"),
      'export default function Home() { return <p>runner view</p>; }\n',
    );

    const server = await createServer({
      configFile: false,
      root,
      plugins: hum({ routesDir, serverEntry: "no-server.ts" }),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}`, {
        headers: { "x-message": "from middleware" },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        "<section>from middleware<p>runner view</p></section>",
      );
    } finally {
      await server.close();
      await rm(routesRoot, { recursive: true, force: true });
    }
  });

  it("runs configured transforms in the development SSR pipeline", async () => {
    const root = resolve(process.cwd(), "packages", "docs");
    const routesRoot = await mkdtemp(
      join(root, "routes", "precompile-test-"),
    );
    const routesDir = relative(root, routesRoot).replace(/\\/g, "/");
    await writeFile(
      join(routesRoot, "index.tsx"),
      `export default function Home() {
  return <main className="precompiled"><p>SSR template</p></main>;
}
`,
    );

    const server = await createServer({
      configFile: false,
      root,
      plugins: [preactSsrPrecompile(), ...hum({ routesDir, serverEntry: "no-server.ts" })],
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const transformed = await server.transformRequest(
        join(routesRoot, "index.tsx"),
        { ssr: true },
      );
      expect(transformed?.code).toContain("jsxTemplate");

      const address = server.httpServer?.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(
        '<main class="precompiled"><p>SSR template</p></main>',
      );
    } finally {
      await server.close();
      await rm(routesRoot, { recursive: true, force: true });
    }
  });

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
      `import { createResource, define, page, type Resource } from "@humjs/core";
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

    const appFile = join(routesRoot, "_app-entry.ts");
    const dependencyFile = join(routesRoot, "_message.ts");
    await writeFile(dependencyFile, 'export const message = "initial";\n');
    await writeFile(appFile, `import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
import { message } from "./_message";
const app = new Hono();
app.use("*", async (c, next) => { c.header("x-powered-by", "Hum + Hono"); await next(); });
app.onError((err, c) => c.text("api-error", 503));
app.get("/api/health", c => c.text(message));
app.get("/api/error", () => { throw new Error("api failure"); });
await mountHum(app, config);
export default app;
`);

    const server = await createServer({
      configFile: false,
      root,
      plugins: hum({ routesDir, devEntry: relative(root, appFile) }),
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

      // The runtime URL serves the framework without evaluating an app entry.
      const runtime = await fetch(`${origin}/_hum/runtime.js`);
      const runtimeCode = await runtime.text();
      expect(runtime.status, runtimeCode).toBe(200);
      expect(runtimeCode).not.toContain("client/main.ts");
      expect(runtimeCode).toContain("boot");

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
      await rm(join(routesRoot, "new-page.tsx"));
      await expect.poll(async () => (await fetch(`${origin}/new-page`)).status).toBe(404);
      await writeFile(dependencyFile, 'export const message = "updated";\n');
      await expect.poll(async () => (await fetch(`${origin}/api/health`)).text()).toBe("updated");
      const apiError = await fetch(`${origin}/api/error`);
      expect(apiError.status).toBe(503);
      expect(await apiError.text()).toBe("api-error");
      expect((await fetch(origin)).status).toBe(200);
    } finally {
      await server.close();
      await rm(routesRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("keeps serving after a render fails", async () => {
    const root = resolve(process.cwd(), "packages", "docs");
    const routesRoot = await mkdtemp(join(root, "routes", "error-test-"));
    const routesDir = relative(root, routesRoot).replace(/\\/g, "/");
    await writeFile(
      join(routesRoot, "index.tsx"),
      'export default function Home() { return "home"; }\n',
    );
    // A reactive cycle: the effect writes the signal it reads, which is the
    // error `@preact/signals` reports once the graph loops too far.
    await writeFile(
      join(routesRoot, "boom.tsx"),
      `import { effect, signal } from "@preact/signals";

export default function Boom() {
  const count = signal(0);
  effect(() => {
    count.value = count.value + 1;
  });
  return <p>{count.value}</p>;
}
`,
    );

    const server = await createServer({
      configFile: false,
      root,
      plugins: hum({ routesDir, serverEntry: "no-server.ts" }),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;

      const before = await fetch(`${origin}/`);
      expect(before.status).toBe(200);
      // The HMR client comes from the rendered document, so it is there once
      // and the dev server never splices it into the response a second time.
      const beforeHtml = await before.text();
      expect(beforeHtml.match(/@vite\/client/g)?.length).toBe(1);

      const boom = await fetch(`${origin}/boom`);
      expect(boom.status).toBe(500);

      // Nothing the failed render built may survive it: a runtime that keeps
      // its modules alive across requests — a Worker, unlike this Node dev
      // server — has to stay usable too, so a broken page must not take the
      // rest of the app down with it.
      expect((await fetch(`${origin}/`)).status).toBe(200);
      expect((await fetch(`${origin}/`)).status).toBe(200);
    } finally {
      await server.close();
      await rm(routesRoot, { recursive: true, force: true });
    }
  }, 20_000);
});


it("automatically links ordinary CSS imports and updates styles during development", async () => {
  const root = await mkdtemp(join(resolve("packages/vite-plugin"), "styles-dev-"));
  await mkdir(join(root, "routes"));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {jsx: "react-jsx", jsxImportSource: "preact"}}));
  await writeFile(join(root, "routes/index.tsx"), `import "../page.css";
export default () => <p class="page">styles</p>;`);
  const stylesheet = join(root, "page.css");
  await writeFile(stylesheet, ".page { color: red; }");
  const server = await createServer({root, configFile: false, plugins: hum(), logLevel: "silent",
    server: {host: "127.0.0.1", port: 0, strictPort: true}});
  try {
    await server.listen();
    const {port} = server.httpServer?.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    const html = await (await fetch(origin)).text();
    const url = html.match(/rel="stylesheet" href="([^"]+)"/)![1]!;
    expect(url).toContain("page.css");
    const cssResponse = await fetch(origin + url, {headers: {Accept: "text/css"}});
    expect(cssResponse.headers.get("content-type")).toContain("text/css");
    expect(await cssResponse.text()).toContain("color: red");
    const send = vi.spyOn(server.ws, "send");
    await writeFile(stylesheet, ".page { color: blue; }");
    await vi.waitFor(() => expect(send.mock.calls.some(([message]) =>
      typeof message === "object" && message.type === "update" &&
      message.updates.some(update => update.type === "css-update"))).toBe(true));
    expect(await (await fetch(origin + url, {headers: {Accept: "text/css"}})).text()).toContain("color: blue");
    send.mockRestore();
  } finally {
    await server.close();
    await rm(root, {recursive: true, force: true});
  }
}, 20_000);


it("serves route CSS Modules as scoped stylesheets and refreshes dependencies", async () => {
  const root = await mkdtemp(join(resolve(process.cwd(), "packages/vite-plugin"), "dev-css-test-"));
  await mkdir(join(root, "routes"));
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({compilerOptions:{jsx:"react-jsx",jsxImportSource:"preact"}}));
  await writeFile(join(root, "routes/index.tsx"), 'import styles from "../page.module.css"; import {Card} from "../Card"; export default () => <main class={styles.card}><Card/></main>;');
  await writeFile(join(root, "Card.tsx"), 'import styles from "./shared.module.css"; export const Card = () => <p class={styles.base}>shared</p>;');
  await writeFile(join(root, "page.module.css"), '.card { composes: base from "./shared.module.css"; color: red; }');
  await writeFile(join(root, "shared.module.css"), '.base { padding: 2px; }');
  await writeFile(join(root, "other.module.css"), '.other { color: blue; }');
  const server = await createServer({ root, configFile:false, plugins:hum({serverEntry:"missing.ts"}), logLevel:"silent", server:{host:"127.0.0.1",port:0} });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
    const response = await fetch(origin);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('/page.module.css?direct');
    expect(html).toContain('/shared.module.css?direct');
    expect(html).not.toContain('/other.module.css?direct');
    const css = await (await fetch(origin + '/page.module.css?direct')).text();
    for (const name of html.match(/<main class="([^"]+)"/)![1]!.split(" ")) expect(css).toContain(`.${name}`);
    const send = vi.spyOn(server.ws, "send");
    await writeFile(join(root, "page.module.css"), '.card { composes: base from "./shared.module.css"; color: green; }');
    await vi.waitFor(() => expect(send.mock.calls.some(([message]) =>
      typeof message === "object" && message.type === "full-reload")).toBe(true));
    await vi.waitFor(async () => {
      const next = await (await fetch(origin)).text();
      const nextCss = await (await fetch(origin + '/page.module.css?direct')).text();
      expect(nextCss).toContain('green');
      for (const name of next.match(/<main class="([^"]+)"/)![1]!.split(" ")) expect(nextCss).toContain(`.${name}`);
    });
    send.mockRestore();
    const updated = vi.fn();
    server.watcher.on("change", updated);
    await writeFile(join(root, "Card.tsx"), 'import styles from "./other.module.css"; export const Card = () => <p class={styles.other}>changed</p>;');
    await vi.waitFor(() => expect(updated).toHaveBeenCalled(), {timeout:5000});
    await vi.waitFor(async () => {
      const next = await (await fetch(origin)).text();
      expect(next).toContain('/other.module.css?direct');
      expect(next).toContain('changed');
    }, {timeout:5000});
  } finally {
    await server.close();
    await rm(root, {recursive:true, force:true});
  }
}, 30_000);
