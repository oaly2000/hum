import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const exampleRoot = join(repoRoot, "examples", "basic");
const buildRoot = join(exampleRoot, "_hum");
const deployRoot = await mkdtemp(join(tmpdir(), "hum-standalone-"));
const scaffoldRoot = join(deployRoot, "scaffold");
const runtimeRoot = join(deployRoot, "runtime");
const port = await findAvailablePort();
let server;
let serverOutput = "";

try {
  const scaffold = spawnSync(
    process.execPath,
    [
      join(repoRoot, "packages", "create-hum", "dist", "index.js"),
      scaffoldRoot,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(
    scaffold.status,
    0,
    `create-hum should scaffold a project:\n${scaffold.stderr}`,
  );
  const scaffoldServer = await readFile(
    join(scaffoldRoot, "server.ts"),
    "utf8",
  );
  assert.match(scaffoldServer, /export default app/);
  assert.match(scaffoldServer, /app\.get\("\/api\/health"/);
  assert.equal(
    (await readFile(join(scaffoldRoot, "package.json"), "utf8")).includes(
      "{{name}}",
    ),
    false,
  );

  await stat(join(buildRoot, "server", "server.js"));
  await cp(buildRoot, join(runtimeRoot, "_hum"), { recursive: true });

  assert.equal(
    await exists(join(runtimeRoot, "node_modules")),
    false,
    "standalone deployment must not contain node_modules",
  );
  assert.equal(
    await exists(join(runtimeRoot, "package.json")),
    false,
    "standalone deployment must not depend on the source package.json",
  );

  const entry = await readFile(
    join(runtimeRoot, "_hum", "server", "server.js"),
    "utf8",
  );
  assert.equal(
    entry.includes(exampleRoot.replace(/\\/g, "/")),
    false,
    "server entry must not embed the build machine's project root",
  );
  for (const file of await listFiles(join(runtimeRoot, "_hum", "server"))) {
    if (!file.endsWith(".js")) continue;
    const contents = await readFile(file, "utf8");
    assert.equal(
      contents.includes(exampleRoot.replace(/\\/g, "/")),
      false,
      `server chunk must not embed the build machine's project root: ${file}`,
    );
  }

  server = spawn(
    process.execPath,
    [join(runtimeRoot, "_hum", "server", "server.js")],
    {
      cwd: runtimeRoot,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk) => serverOutput += chunk);
  server.stderr.on("data", (chunk) => serverOutput += chunk);

  const origin = `http://127.0.0.1:${port}`;
  const api = await waitForResponse(`${origin}/api/health`, server);
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { status: "ok" });
  assert.equal(api.headers.get("x-powered-by"), "Hum + Hono");

  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /hum:island/);

  const page = await fetch(`${origin}/docs/handlers`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /hljs-keyword/);
  assert.match(html, /Route handlers/);

  for (
    const [path, heading] of [
      ["/docs/routing", "Routing and rendering"],
      ["/docs/hono", "Hono and Hum middleware"],
    ]
  ) {
    const guide = await fetch(`${origin}${path}`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), new RegExp(heading));
  }

  const cssPath = html.match(/href="([^"]+\.css)"/)?.[1];
  assert.ok(cssPath, "rendered page should reference the built CSS asset");
  const css = await fetch(new URL(cssPath, origin));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);

  const missing = await fetch(`${origin}/this-route-does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /404/);

  console.log(
    "Scaffold and standalone deployment passed: moved _hum/ runs without node_modules or source package.json.",
  );
} catch (error) {
  if (serverOutput.length > 0) {
    console.error("Standalone server output:\n" + serverOutput);
  }
  throw error;
} finally {
  if (server !== undefined && server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3000),
    ]);
  }
  await rm(deployRoot, { recursive: true, force: true });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else files.push(path);
  }
  return files;
}

async function findAvailablePort() {
  const { createServer } = await import("node:net");
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not determine an available TCP port.");
  }
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

async function waitForResponse(url, child) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Standalone server exited with code ${child.exitCode}.\n${serverOutput}`,
      );
    }
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Standalone server did not start in time: ${lastError}`);
}
