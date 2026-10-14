import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const docsRoot = join(repoRoot, "packages", "docs");
const buildRoot = join(docsRoot, "_hum");
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
  assert.deepEqual(
    (await listFiles(join(buildRoot, "server")))
      .filter((file) => file.endsWith(".js"))
      .map((file) => file.slice(file.lastIndexOf(sep) + 1)),
    ["server.js"],
    "the production server output must be a single JavaScript file",
  );
  // Rewrite the output directory name while copy-deploying: it is served under
  // the URL recorded in the build manifest, so the name on disk must not matter.
  const outDir = "wwwroot";
  await cp(buildRoot, join(runtimeRoot, outDir), { recursive: true });

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
    join(runtimeRoot, outDir, "server", "server.js"),
    "utf8",
  );
  assert.equal(
    entry.includes(docsRoot.replace(/\\/g, "/")),
    false,
    "server entry must not embed the build machine's project root",
  );
  for (const file of await listFiles(join(runtimeRoot, outDir, "server"))) {
    if (!file.endsWith(".js")) continue;
    const contents = await readFile(file, "utf8");
    assert.equal(
      contents.includes(docsRoot.replace(/\\/g, "/")),
      false,
      `server bundle must not embed the build machine's project root: ${file}`,
    );
  }

  server = spawn(
    process.execPath,
    [join(runtimeRoot, outDir, "server", "server.js")],
    {
      cwd: runtimeRoot,
      // Hum does not serve its own output, so the deployment tells the app
      // where the renamed directory ended up; its own static middleware
      // answers the client asset requests from there.
      env: {
        ...process.env,
        PORT: String(port),
        HUM_OUT_DIR: join(runtimeRoot, outDir),
      },
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

  // Every client asset the rendered page points at must be reachable even
  // though the output directory was renamed on disk: the app's own static
  // middleware serves them from the directory it was told about.
  const clientAssets = [
    ...new Set(
      [...homeHtml.matchAll(/\/_hum\/[A-Za-z0-9._/-]+/g)].map((m) => m[0]),
    ),
  ];
  assert.ok(
    clientAssets.length > 0,
    "the rendered page should reference the client runtime and island chunks",
  );
  for (const asset of clientAssets) {
    const response = await fetch(new URL(asset, origin));
    assert.equal(response.status, 200, `client asset should be served: ${asset}`);
  }

  // The runtime carries its build inside the server bundle — there is no
  // manifest file for the deployed app to read.
  assert.equal(
    await exists(join(runtimeRoot, outDir, "manifest.json")),
    false,
    "the deployment must not carry a build manifest file",
  );

  // Islands are lazy chunks the app addresses through the build rather than
  // through its markup, so every asset the client build emitted — including the
  // stylesheets recorded for an island — has to be served too.
  const clientRoot = join(runtimeRoot, outDir, "client");
  const assetsBase = "/_hum";
  const islandAssets = (await listFiles(clientRoot))
    .map((file) => relative(clientRoot, file).split(sep).join("/"))
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"));
  assert.ok(
    islandAssets.length > 0,
    "the client build should have emitted assets",
  );
  for (const asset of islandAssets) {
    const url = `${assetsBase}/client/${asset}`;
    const response = await fetch(`${origin}${url}`);
    assert.equal(response.status, 200, `client asset should be served: ${url}`);
  }

  // Only the client half of the output directory is public: the server bundle
  // must never be reachable over HTTP.
  for (const path of ["/_hum/server/server.js"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, `${path} must not be served`);
  }

  const missing = await fetch(`${origin}/this-route-does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /404/);

  console.log(
    "Scaffold and standalone deployment passed: a renamed output directory " +
      "runs without node_modules or source package.json, serves its client " +
      "assets, and keeps the server bundle private.",
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
