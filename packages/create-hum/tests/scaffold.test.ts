import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scaffold } from "../src/scaffold.js";

const roots: string[] = [];

async function scaffoldInto(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "hum-scaffold-"));
  roots.push(target);
  await scaffold(target, name);
  return target;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("scaffold", () => {
  it("substitutes the project name in every template file", async () => {
    const target = await scaffoldInto("my-app");

    const files = await walk(target);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(await readFile(file, "utf8"), file).not.toContain("{{");
    }

    const index = await readFile(
      join(target, "routes", "index.tsx"),
      "utf8",
    );
    expect(index).toContain("<title>my-app</title>");
    expect(index).toContain('class="text-3xl font-bold">my-app</h1>');

    const app = await readFile(join(target, "routes", "_app.tsx"), "utf8");
    expect(app).toContain("<title>my-app</title>");

    const pkg = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("my-app");
  });

  it("renames the files that cannot keep their template name", async () => {
    const target = await scaffoldInto("renamed");

    const files = (await walk(target))
      .map((file) => file.slice(target.length + 1).replace(/\\/g, "/"))
      .sort();

    expect(files).toContain(".gitignore");
    expect(files).toContain("README.md");
    expect(files).toContain("package.json");
    expect(files).not.toContain("_gitignore");
    expect(files).not.toContain("_package.json");
    expect(files).not.toContain("_README.md");
  });

  it("replaces the spaced placeholder form as well", async () => {
    const templateDir = await mkdtemp(join(tmpdir(), "hum-template-"));
    roots.push(templateDir);
    await mkdir(join(templateDir, "routes"), { recursive: true });
    await writeFile(
      join(templateDir, "routes", "_app.tsx"),
      'export const head = define.head(<title>{{ name }}</title>);\n',
      "utf8",
    );

    const target = await mkdtemp(join(tmpdir(), "hum-scaffold-"));
    roots.push(target);
    await scaffold(target, "spaced", templateDir);

    const app = await readFile(join(target, "routes", "_app.tsx"), "utf8");
    expect(app).toBe(
      'export const head = define.head(<title>spaced</title>);\n',
    );
  });
});
