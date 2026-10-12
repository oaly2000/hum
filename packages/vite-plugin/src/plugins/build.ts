import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProdManifest } from "@hum/core";
import { crawlProject } from "@hum/core/discovery";
import { build, type Plugin } from "vite";

import {
  CLIENT_RUNTIME_ENTRY,
  makeBuildId,
  SERVER_ENTRY,
  SERVER_ENTRY_NAME,
  type HumContext,
  type ResolvedHumOptions,
} from "../shared.js";
import { writeBuildEntries } from "./islands.js";

const MANIFEST_FILE = "manifest.json";

interface ClientManifestEntry {
  file: string;
  css?: string[];
}

/** Output directories, relative to the project root. */
function outDirs(options: ResolvedHumOptions) {
  return {
    client: `${options.outDir}/client`,
    server: `${options.outDir}/server`,
  };
}

/**
 * Turns Vite's client manifest into the manifest `ProdBuildCache` reads at
 * startup: one hashed asset per island, plus the client runtime entry.
 *
 * Asset paths are stored relative to the output directory, with the URL the
 * directory is served from kept separately. The runtime locates the output
 * directory next to the server bundle, so renaming or moving it on the deploy
 * machine cannot break the client asset URLs.
 */
async function writeProdManifest(ctx: HumContext): Promise<void> {
  const { options, project } = ctx;
  const clientOut = outDirs(options).client;

  const clientManifest = JSON.parse(
    await readFile(
      join(options.root, clientOut, ".vite", "manifest.json"),
      "utf8",
    ),
  ) as Record<string, ClientManifestEntry>;

  const runtime = clientManifest[CLIENT_RUNTIME_ENTRY];
  if (runtime === undefined) {
    throw new Error(
      "hum: the client runtime produced no chunk, cannot build the manifest.",
    );
  }

  const prefix = "client/";
  const islands: ProdManifest["islands"] = {};
  for (const spec of project.islands) {
    const entry = clientManifest[spec.file];
    if (entry === undefined) continue;
    islands[spec.name] = {
      file: prefix + entry.file,
      css: (entry.css ?? []).map((css) => prefix + css),
    };
  }

  const manifest: ProdManifest = {
    buildId: makeBuildId(),
    assetsBase: `/${options.outDir.replace(/\\/g, "/")}`,
    clientEntry: prefix + runtime.file,
    islands,
    entryAssets: (runtime.css ?? []).map((css) => prefix + css),
  };

  await writeFile(
    join(options.root, options.outDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

/**
 * Build plugin: makes a plain `vite build` produce a complete Hum build.
 *
 * The client environment gets the client runtime plus one chunk per island as
 * inputs; once it is written, the production manifest is derived from Vite's
 * own manifest and the SSR bundle is built in a second, independent pass.
 */
export function humBuild(ctx: HumContext): Plugin {
  let isSsr = false;
  let chained = false;

  return {
    name: "hum:build",
    apply: "build",

    async config(_config, env) {
      const options = ctx.options;
      const dirs = outDirs(options);

      const crawled = await crawlProject({
        root: options.root,
        routesDir: options.routesDir,
        islandsDir: options.islandsDir,
      });
      ctx.project.routes = crawled.routes;
      ctx.project.islands = crawled.islands;
      await writeBuildEntries(ctx);

      isSsr = env.isSsrBuild === true;

      if (isSsr) {
        return {
          build: {
            outDir: dirs.server,
            emptyOutDir: true,
            ssr: true,
            target: "node20",
            rollupOptions: { input: { [SERVER_ENTRY_NAME]: SERVER_ENTRY } },
          },
        };
      }

      const input: Record<string, string> = { runtime: CLIENT_RUNTIME_ENTRY };
      for (const spec of ctx.project.islands) input[spec.name] = spec.file;

      return {
        appType: "custom",
        build: {
          outDir: dirs.client,
          emptyOutDir: true,
          manifest: true,
          // The client runtime exports (`boot`/`revive`/`applyPartials`) are
          // imported by the server-inlined boot script, which lives outside the
          // bundle. Rolldown drops an entry export that nothing in the bundle
          // consumes, so `preserveEntrySignatures` keeps the entry's own
          // exports in the emitted chunk. In Vite 8 the input map and these
          // Rolldown options both live under `rolldownOptions`.
          rolldownOptions: {
            input,
            preserveEntrySignatures: "exports-only",
          },
        },
      };
    },

    async closeBundle() {
      // The SSR pass is chained from the client one; nothing to do for it and
      // never chain twice.
      if (isSsr || chained) return;
      chained = true;

      const options = ctx.options;
      const dirs = outDirs(options);

      await writeProdManifest(ctx);

      await build({
        root: options.root,
        // The server bundle needs no Hum plugins, which also keeps this pass
        // out of the plugin's own build hooks.
        configFile: false,
        logLevel: "warn",
        build: {
          outDir: dirs.server,
          emptyOutDir: true,
          ssr: true,
          target: "node20",
          rollupOptions: { input: { [SERVER_ENTRY_NAME]: SERVER_ENTRY } },
        },
        // SSR builds externalize dependencies by default, which makes the
        // deployed server depend on the project's node_modules. Bundle npm
        // dependencies into the server chunks; Node built-ins remain external.
        ssr: { noExternal: true },
      });
      await writeFile(
        join(options.root, dirs.server, "package.json"),
        JSON.stringify({ type: "module" }, null, 2) + "\n",
        "utf8",
      );
    },
  };
}
