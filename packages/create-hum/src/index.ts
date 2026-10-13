#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { isEmptyDir, scaffold } from "./scaffold.js";

const USAGE = `create-hum <project-directory>

Scaffolds a new Hum project into <project-directory>.

  pnpm dlx create-hum my-app
  npm create hum@latest my-app
`;

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
await scaffold(target, name);

console.log(`\nCreated "${name}" in ${target}\n`);
console.log("Next steps:");
console.log(`  cd ${arg}`);
console.log("  npm install");
console.log("  npm run dev\n");
