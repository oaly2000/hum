import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

it.each(["basic", "cloudflare"])("runs the built CLI to scaffold the %s template", async (template) => {
  const parent = await mkdtemp(join(tmpdir(), "hum-cli-"));
  const target = join(parent, "cli-app");
  try {
    await run(process.execPath, [cli, target, "--template", template]);
    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("cli-app");
    const entry = template === "basic" ? "app.ts" : "wrangler.jsonc";
    expect((await stat(join(target, entry))).isFile()).toBe(true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
