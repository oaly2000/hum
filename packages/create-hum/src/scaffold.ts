import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Templates shipped with the CLI, one directory each, next to its output. */
const TEMPLATES_DIR = fileURLToPath(new URL("../templates", import.meta.url));

/** Template a project is scaffolded from when none is named. */
export const DEFAULT_TEMPLATE = "basic";

/** Names of the templates that can be scaffolded, as they are on disk. */
export async function listTemplates(): Promise<string[]> {
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Directory holding the named template. The name is looked up in the directory
 * listing instead of being joined into a path, so a name such as `../basic` is
 * reported as unknown rather than resolving outside the templates.
 */
export async function templatePath(name: string): Promise<string> {
  const templates = await listTemplates();
  if (!templates.includes(name)) {
    throw new Error(
      `unknown template "${name}" (available: ${templates.join(", ")})`,
    );
  }
  return join(TEMPLATES_DIR, name);
}

/**
 * Template files whose name is only valid once they land in the new project
 * (a `_package.json` inside this package would confuse tooling).
 */
const RENAMES: Record<string, string> = {
  "_gitignore": ".gitignore",
  "_package.json": "package.json",
  "_README.md": "README.md",
};

/** Project name placeholder, written as `{{name}}` or `{{ name }}`. */
const NAME_PLACEHOLDER = /\{\{\s*name\s*\}\}/g;

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

export async function isEmptyDir(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  return (await readdir(dir)).length === 0;
}

/**
 * Copies every template file into `target`, renaming the files that cannot
 * live under their final name in this package and substituting the project
 * name for the placeholder. `NAME_PLACEHOLDER` matches nothing in the files
 * that do not use it, so every file can be treated the same way.
 */
export async function scaffold(
  target: string,
  name: string,
  templateDir: string = join(TEMPLATES_DIR, DEFAULT_TEMPLATE),
): Promise<void> {
  for (const file of await walk(templateDir)) {
    const rel = file
      .slice(templateDir.length)
      .replace(/\\/g, "/")
      .replace(/^\//, "");
    const parts = rel.split("/");
    const fileName = parts[parts.length - 1];
    parts[parts.length - 1] = RENAMES[fileName] ?? fileName;

    const dest = join(target, ...parts);
    await mkdir(join(dest, ".."), { recursive: true });

    const raw = await readFile(file, "utf8");
    await writeFile(dest, raw.replaceAll(NAME_PLACEHOLDER, name), "utf8");
  }
}
