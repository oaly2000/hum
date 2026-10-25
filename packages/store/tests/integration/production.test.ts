import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import type { ChildProcess } from "node:child_process";

const root = resolve("packages/store");
const exec = promisify(execFile);
let directory: string;
let child: ChildProcess;
let origin: string;
let output = "";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  ).flat();
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "hum-store-test-"));
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((done) => socket.close(() => done()));
  origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    STORE_ORIGIN: origin,
    PORT: String(port),
    STORE_DATABASE: join(directory, "store.sqlite"),
    BETTER_AUTH_SECRET: "integration-only-secret-0123456789-abcdef",
    CREEM_API_KEY: "creem_test_integration_fixture",
    CREEM_WEBHOOK_SECRET: "integration-webhook-secret",
    CREEM_TEMPLATE_PRODUCT_ID: "prod_fixture",
    CREEM_COMPONENTS_PRODUCT_ID: "prod_fixture2",
    CREEM_GUIDE_PRODUCT_ID: "prod_fixture3",
  };
  // Run Vite as an integration test against built workspace dependencies.
  await exec(
    process.execPath,
    [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
    { cwd: root, env, maxBuffer: 2_000_000 },
  );
  await exec(process.execPath, ["tools/copy-resources.mjs"], {
    cwd: root,
    env,
  });
  child = spawn(process.execPath, ["dist/server.js"], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr!.on("data", (chunk) => {
    output += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      /* Wait for the listener. */
    }
    if (child.exitCode !== null) throw new Error(`Store exited: ${output}`);
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Store did not start: ${output}`);
}, 60_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise((done) => child.once("exit", done));
    child.kill();
    await stopped;
  }
  if (directory) {
    // Verify the recursive cleanup target is the temporary fixture we created.
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + "\\") &&
      !resolve(directory).startsWith(resolve(tmpdir()) + "/")
    )
      throw new Error("Invalid fixture cleanup path");
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

describe("built store", () => {
  it("serves complete generated HTML and production CSS", async () => {
    const response = await fetch(origin);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Small tools.");
    expect(html).toContain("Launch Kit");
    expect(html).not.toContain("@vite/client");
    const href = html.match(/href="([^\"]+\.css)"/)?.[1];
    expect(href).toBeTruthy();
    expect((await fetch(new URL(href!, origin))).status).toBe(200);
    const pages = await readFile(
      join(root, "dist/_generated/hum-pages.js"),
      "utf8",
    );
    expect(pages).toContain("Small tools.");
  });

  it("supports ordinary GET filters and server-rendered quantity input", async () => {
    const filtered = await (
      await fetch(`${origin}/products?category=Guides`)
    ).text();
    expect(filtered).toContain("The Slower Web");
    expect(filtered).not.toContain("Launch Kit");
    const detail = await (await fetch(`${origin}/products/launch-kit`)).text();
    expect(detail).toContain('name="units"');
    expect(detail).toContain('value="1"');
    expect(detail).toContain("$29.00");
    expect(detail).toContain('action="/api/checkout"');
    expect(detail).toContain("<title>Launch Kit — Hum Supply</title>");
    expect(detail.match(/<meta name="description"/g)).toHaveLength(1);
    expect(detail).toContain(
      'name="keywords" content="Launch Kit, Templates, digital goods"',
    );
  });

  it("keeps account pages private and server resources unreachable", async () => {
    const account = await fetch(`${origin}/account`, { redirect: "manual" });
    expect(account.status).toBe(303);
    expect(account.headers.get("cache-control")).toContain("no-store");
    const login = await fetch(`${origin}/login`);
    expect(login.headers.get("cache-control")).toContain("no-store");
    for (const path of [
      "/resources/launch-kit.md",
      "/services/store.js",
      "/.env.local",
      "/server.js",
    ]) {
      expect((await fetch(`${origin}${path}`)).status).toBe(404);
    }
  });

  it("does not publish credentials or server payment/auth code to the browser", async () => {
    for (const file of await files(join(root, "dist/public"))) {
      if (!/\.(js|css|json)$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      for (const marker of [
        "creem_test_integration_fixture",
        "BETTER_AUTH_SECRET",
        "node:sqlite",
        "constructWebhookEventEntity",
        "better-auth",
      ])
        expect(source, file).not.toContain(marker);
    }
  });
});
