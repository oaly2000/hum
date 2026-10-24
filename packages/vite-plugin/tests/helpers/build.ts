import { rm, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { build, type InlineConfig, type Plugin } from "vite";
import { hum, type HumOptions } from "../../src/mod.js";
import { createProject } from "./project.js";

type EntryKind = "app" | "start";

function serverSource(kind: EntryKind): string {
  return `${kind === "start" ? 'import { serve } from "@hono/node-server";' : ""}
import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";
const app = new Hono();
await mountHum(app, config);
export const customExport = "preserved";
export const sideEffects: string[] = [];
sideEffects.push("entry evaluated");
export function start() { throw new Error("start is an ordinary export"); }
${kind === "app" ? "export default app;" : ""}
${kind === "start" ? 'serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), overrideGlobalObjects: false });' : ""}
`;
}

export interface BuildOptions {
  basePath?: string;
  outDir?: string | ((root: string) => string);
  /** Give the project a `server.ts` exporting this. */
  entry?: EntryKind;
  plugins?: Plugin[];
  routes?: Record<string, string>;
  files?: Record<string, string>;
  standalone?: boolean;
  configure?: (root: string) => InlineConfig;
}


/** Build an isolated project; callers own successful fixtures until cleanup. */
export async function buildProject(options: BuildOptions = {}): Promise<string> {
  const { entry, plugins = [] } = options;
  const root = await createProject({
    "routes/index.tsx": `export default function Home() {
  return <main className="home">{["first", "second"].map((item) =>
    <p key={item}>{item}</p>
  )}</main>;
}`,
    "islands/Counter.tsx": 'import { defineIsland } from "@humjs/core/shared"; export default defineIsland(function Counter() { return null; });',
    "public/robots.txt": "User-agent: *\n",
    "public/favicon.svg": "<svg/>\n",
    ...Object.fromEntries(Object.entries(options.routes ?? {}).map(([file, contents]) => [`routes/${file}`, contents])),
    ...(entry === undefined ? {} : { "server.ts": serverSource(entry) }),
    ...options.files,
  }, "build-test-");
  try {
    const outDir = typeof options.outDir === "function" ? options.outDir(root) : options.outDir;
    const humOptions: HumOptions = {};
    if (options.basePath !== undefined) humOptions.basePath = options.basePath;
    if (outDir !== undefined) humOptions.outDir = outDir;
    if (options.standalone !== undefined) humOptions.standalone = options.standalone;
    await build({
      ...options.configure?.(root),
      root,
      configFile: false,
      plugins: [...plugins, ...hum(humOptions)],
      logLevel: "silent",
      ...(outDir === undefined ? {} : { build: { outDir } }),
    });
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** Inspect generated metadata regardless of the selected server layout. */
export async function serverSources(directory: string): Promise<string> {
  const sources: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "public") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sources.push(await serverSources(path));
    else if (entry.name.endsWith(".js")) sources.push(await readFile(path, "utf8"));
  }
  return sources.join("\n");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
