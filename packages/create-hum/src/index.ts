#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = fileURLToPath(
  new URL("../templates/basic", import.meta.url),
);

/**
 * Template files whose name is only valid once they land in the new project
 * (a `_package.json` inside this package would confuse tooling).
 */
const RENAMES: Record<string, string> = {
  "_gitignore": ".gitignore",
  "_package.json": "package.json",
  "_README.md": "README.md",
};

const USAGE = `create-hum <project-directory>

Scaffolds a new Hum project into <project-directory>.

  pnpm dlx create-hum my-app
  npm create hum@latest my-app
`;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function copyTemplate(target: string, name: string): Promise<void> {
  for (const file of await walk(TEMPLATE_DIR)) {
    const rel = file
      .slice(TEMPLATE_DIR.length)
      .replace(/\\/g, "/")
      .replace(/^\//, "");
    const parts = rel.split("/");
    const fileName = parts[parts.length - 1];
    parts[parts.length - 1] = RENAMES[fileName] ?? fileName;

    const dest = join(target, ...parts);
    await mkdir(join(dest, ".."), { recursive: true });

    // `replaceAll` is a no-op for the files that do not use the placeholder,
    // so every file can be treated the same way.
    const raw = await readFile(file, "utf8");
    await writeFile(dest, raw.replaceAll("{{name}}", name), "utf8");
  }
}

async function isEmptyDir(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  return (await readdir(dir)).length === 0;
}

const arg = process.argv[2];

if (arg === undefined || arg === "--help" || arg === "-h") {
  console.log(USAGE);
  process.exit(arg === undefined ? 1 : 0);
}

const target = resolve(process.cwd(), arg);

if (!await isEmptyDir(target)) {
  console.error(`create-hum: "${arg}" already exists and is not empty.`);
  process.exit(1);
}

const name = basename(target);
await mkdir(target, { recursive: true });
await copyTemplate(target, name);

console.log(`\nCreated "${name}" in ${target}\n`);
console.log("Next steps:");
console.log(`  cd ${arg}`);
console.log("  npm install");
console.log("  npm run dev\n");
