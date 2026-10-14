#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { parseArgs } from "./cli.js";
import {
  DEFAULT_TEMPLATE,
  isEmptyDir,
  listTemplates,
  scaffold,
  templatePath,
} from "./scaffold.js";

/** One line description per template, used by the usage text and `--list`. */
const TEMPLATE_SUMMARY: Record<string, string> = {
  basic: "Hono server on Node",
  cloudflare: "Cloudflare Worker with a static asset binding",
};

/** What to run after scaffolding, per template. */
const NEXT_STEPS: Record<string, string[]> = {
  basic: ["npm run dev"],
  cloudflare: ["npm run dev", "npm run build", "npm run deploy"],
};

/** Usage text, with the templates that are actually shipped. */
async function usage(): Promise<string> {
  const templates = (await listTemplates()).map((name) => {
    const summary = TEMPLATE_SUMMARY[name];
    return summary === undefined ? `  ${name}` : `  ${name.padEnd(12)}${summary}`;
  });

  return `create-hum <project-directory> [--template <name>]

Scaffolds a new Hum project into <project-directory>, from the "${DEFAULT_TEMPLATE}"
template unless another one is named.

  pnpm dlx create-hum my-app
  npm create hum@latest my-app
  pnpm dlx create-hum my-worker --template cloudflare
  pnpm dlx create-hum --list

Templates:
${templates.join("\n")}`;
}

try {
  const command = parseArgs(process.argv.slice(2));

  if (command.kind !== "scaffold") {
    console.log(await usage());
    // Nothing was asked for is a usage error; `--help` and `--list` are not.
    process.exit(command.kind === "none" ? 1 : 0);
  }

  const target = resolve(process.cwd(), command.target);
  const template = await templatePath(command.template);

  if (!await isEmptyDir(target)) {
    console.error(
      `create-hum: "${command.target}" already exists and is not empty.`,
    );
    process.exit(1);
  }

  const name = basename(target);
  await mkdir(target, { recursive: true });
  await scaffold(target, name, template);

  console.log(
    `\nCreated "${name}" in ${target} with the ${command.template} template\n`,
  );
  console.log("Next steps:");
  console.log(`  cd ${command.target}`);
  console.log("  npm install");
  for (const step of NEXT_STEPS[command.template] ?? ["npm run dev"]) {
    console.log(`  ${step}`);
  }
  console.log();
} catch (err) {
  console.error(
    `create-hum: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
