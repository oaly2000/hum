import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProdManifest } from "@humjs/core";
import { islandNameOfFile } from "@humjs/core/routing";
import { build, type Plugin } from "vite";

import {
  CLIENT_RUNTIME_ENTRY,
  ISLANDS_ENTRY,
  makeBuildId,
  SERVER_ENTRY,
  SERVER_ENTRY_NAME,
  type HumContext,
  type ResolvedHumOptions,
} from "../shared.js";
import { writeBuildEntries } from "./islands.js";
import { humRoutes } from "./routes.js";

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
 * Turns Vite's client manifest into the manifest `BuildCache` reads at
 * startup: one hashed asset per island, plus the client runtime entry.
 *
 * The islands come from the manifest itself rather than from a directory scan,
 * so every island chunk the bundler emitted is registered, and an island can
 * neither be missed nor reported with a chunk that does not exist. Asset paths
 * are stored relative to the output directory, with the URL the directory is
 * served from kept separately. The runtime locates the output directory next to
 * the server bundle, so renaming or moving it on the deploy machine cannot
 * break the client asset URLs.
 */
async function writeProdManifest(ctx: HumContext): Promise<ProdManifest> {
  const options = ctx.options;
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
  for (const [file, entry] of Object.entries(clientManifest)) {
    const name = islandNameOfFile(file, options);
    if (name === null) continue;
    islands[name] = {
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

  return manifest;
}

/**
 * Build plugin: makes a plain `vite build` produce a complete Hum build.
 *
 * Both environments discover their own files: the routes come from the
 * `virtual:hum/routes` glob, and the islands entry makes the client build emit
 * one chunk per island. Once the client half is written, the production
 * manifest is derived from Vite's own manifest and the SSR bundle is built in a
 * second, independent pass.
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
          // exports — and, for the islands entry, the lazy imports its glob
          // result holds — in the emitted chunks. In Vite 8 the input map and
          // these Rolldown options both live under `rolldownOptions`.
          rolldownOptions: {
            input: { runtime: CLIENT_RUNTIME_ENTRY, islands: ISLANDS_ENTRY },
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

      const prodManifest = await writeProdManifest(ctx);
      if (options.verbose) {
        // The routes are resolved by the bundler now, so only the islands are
        // known here.
        this.info(
          `hum: ${Object.keys(prodManifest.islands).length} island chunk(s)`,
        );
      }

      await build({
        root: options.root,
        // This pass provides its own plugin list instead of reusing the config
        // file, which keeps it out of the plugin's other build hooks. The routes
        // plugin is the exception: the generated server entry imports the
        // manifest from its virtual module.
        configFile: false,
        plugins: [humRoutes(ctx)],
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
