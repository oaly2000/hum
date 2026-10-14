import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import type { ProdManifest } from "@humjs/core";
import { islandNameOfFile } from "@humjs/core/routing";
import { build, type Plugin } from "vite";

import {
  ASSETS_BASE,
  CLIENT_RUNTIME_ENTRY,
  ISLANDS_ENTRY,
  makeBuildId,
  SERVER_ENTRY,
  SERVER_ENTRY_NAME,
  type HumContext,
  type ResolvedHumOptions,
} from "../shared.js";
import { humBuildInput } from "./build_input.js";
import { writeBuildEntries } from "./islands.js";
import { humRoutes } from "./routes.js";

interface ClientManifestEntry {
  file: string;
  css?: string[];
}

/** Public directory of the project whose contents the client build copies. */
const PROJECT_PUBLIC = "public";

/** Directory inside the build Hum's own client assets are published under. */
const HUM_ASSETS_DIR = "_hum";

/** Paths of a production build, relative to the project root. */
function buildPaths(options: ResolvedHumOptions) {
  return {
    /**
     * Client build output; copied into `<outDir>/public/_hum` and removed once
     * the build is assembled.
     */
    client: `${options.outDir}/.hum-client`,
    /** Public tree of the build, next to the server bundle. */
    publicDir: `${options.outDir}/public`,
    /** The client assets of the build, addressed through `/_hum`. */
    assets: `${options.outDir}/public/${HUM_ASSETS_DIR}`,
    /** Manifest that tells Node the output directory is ESM. */
    packageJson: `${options.outDir}/package.json`,
    projectPublic: resolve(options.root, PROJECT_PUBLIC),
  };
}

/**
 * Turns Vite's client manifest into the production assets the runtime serves
 * from: one hashed asset per island, plus the client runtime entry.
 *
 * The islands come from the manifest itself rather than from a directory scan,
 * so every island chunk the bundler emitted is registered, and an island can
 * neither be missed nor reported with a chunk that does not exist. Asset paths
 * are relative to `assetsBase` — the URL the assets are published under — which
 * is what keeps the client asset URLs independent of the output directory's
 * name: `dist`, `wwwroot`, whatever the app was deployed as.
 *
 * The result is inlined into the server bundle through `virtual:hum/build`
 * instead of being written to a file, which is what keeps the runtime — and the
 * deployed app — free of any file system lookup.
 */
async function prodManifest(ctx: HumContext): Promise<ProdManifest> {
  const options = ctx.options;
  const clientOut = join(options.root, buildPaths(options).client);

  const clientManifest = JSON.parse(
    await readFile(
      join(clientOut, ".vite", "manifest.json"),
      "utf8",
    ),
  ) as Record<string, ClientManifestEntry>;

  const runtime = clientManifest[CLIENT_RUNTIME_ENTRY];
  if (runtime === undefined) {
    throw new Error(
      "hum: the client runtime produced no chunk, cannot build the manifest.",
    );
  }

  const islands: ProdManifest["islands"] = {};
  for (const [file, entry] of Object.entries(clientManifest)) {
    const name = islandNameOfFile(file, options);
    if (name === null) continue;
    // The manifest reports paths relative to the client output directory, which
    // is itself the `_hum` directory of the published assets.
    islands[name] = { file: entry.file, css: entry.css };
  }

  return {
    buildId: makeBuildId(),
    assetsBase: ASSETS_BASE,
    clientEntry: runtime.file,
    islands,
    entryAssets: runtime.css,
  };
}

/**
 * Assembles the build: the client pass wrote `<outDir>/.hum-client`, which is
 * not where the assets are published from, so its output is copied to
 * `<outDir>/public/_hum` — the directory `/_hum` addresses — and the project's
 * own `public/` directory is copied into `<outDir>/public` next to it. The
 * intermediate client directory is then removed: it is build bookkeeping, its
 * contents now live in the public tree, and leaving it behind would make the
 * output directory look like it still had a client half. Only the client output
 * is written into the build's public tree, so the server bundle never becomes
 * reachable over HTTP through it.
 */
async function assembleBuild(ctx: HumContext): Promise<ProdManifest> {
  const paths = buildPaths(ctx.options);
  const root = ctx.options.root;

  const prod = await prodManifest(ctx);
  await cp(join(root, paths.client), resolve(root, paths.assets), {
    recursive: true,
    // The client manifest is build bookkeeping, not a client asset: the runtime
    // carries its build inside the server bundle, so nothing reads it at
    // runtime and it has no business being public. Node resolves a `cp` filter
    // against the source path only while its parent survives, so the directory
    // is named rather than pattern matched.
    filter: (source) => !source.includes(`${sep}.vite`),
  });

  if (existsSync(paths.projectPublic)) {
    await cp(paths.projectPublic, resolve(root, paths.publicDir), {
      recursive: true,
      // Layout is the only thing that decides what is public, so a stale asset
      // of a previous build must not survive in the build's public tree.
      force: true,
    });
  }

  // The intermediate client output has served its purpose: its contents are in
  // the public tree now, and the deployed build should only carry what it
  // publishes.
  await rm(resolve(root, paths.client), { recursive: true, force: true });

  return prod;
}

/**
 * Build plugin: makes a plain `vite build` produce a complete Hum build.
 *
 * Both environments discover their own files: the routes come from the
 * `virtual:hum/routes` glob, and the islands entry makes the client build emit
 * one chunk per island. Once the client half is written, the production assets
 * are derived from Vite's own manifest and carried into the SSR pass — the
 * second, independent build — where `virtual:hum/build` inlines them into the
 * server bundle.
 */
export function humBuild(ctx: HumContext): Plugin {
  let isSsr = false;
  let chained = false;

  return {
    name: "hum:build",
    apply: "build",

    async config(_config, env) {
      const options = ctx.options;
      const paths = buildPaths(options);

      await writeBuildEntries(ctx);

      isSsr = env.isSsrBuild === true;

      if (isSsr) {
        return {
          build: {
            outDir: options.outDir,
            // The client pass assembled the build's public tree in this
            // directory, so this pass may only replace its own entry.
            emptyOutDir: false,
            ssr: true,
            target: "node20",
            rollupOptions: {
              input: { [SERVER_ENTRY_NAME]: SERVER_ENTRY },
              // Routes are discovered through dynamic imports; disabling
              // splitting keeps the deployment to the single server entry.
              output: { codeSplitting: false },
            },
          },
        };
      }

      return {
        appType: "custom",
        build: {
          // The client output is assembled into `<outDir>/public/_hum` once the
          // pass is done, so this directory is an implementation detail.
          outDir: paths.client,
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
      const paths = buildPaths(options);

      // The client pass just wrote the assets and the build's public tree is
      // assembled from them, so the runtime's input is complete:
      // `virtual:hum/build` inlines it into the server bundle below, which is
      // why the deployed app has no manifest file to read.
      ctx.prod = await assembleBuild(ctx);
      if (options.verbose) {
        // The routes are resolved by the bundler now, so only the islands are
        // known here.
        this.info(`hum: ${Object.keys(ctx.prod.islands).length} island chunk(s)`);
      }

      await build({
        root: options.root,
        // This pass provides its own plugin list instead of reusing the config
        // file, which keeps it out of the plugin's other build hooks. The
        // generated server entry imports the build from its virtual module, so
        // the two plugins that resolve it are the exception.
        configFile: false,
        plugins: [humRoutes(ctx), humBuildInput(ctx)],
        logLevel: "warn",
        build: {
          // The build's public tree sits in the same directory, so this pass
          // writes its entry next to it without emptying it.
          outDir: options.outDir,
          emptyOutDir: false,
          ssr: true,
          target: "node20",
          rollupOptions: {
            input: { [SERVER_ENTRY_NAME]: SERVER_ENTRY },
            // Routes are discovered through dynamic imports; disabling
            // splitting keeps the deployment to the single server entry.
            output: { codeSplitting: false },
          },
        },
        // SSR builds externalize dependencies by default, which makes the
        // deployed server depend on the project's node_modules. Bundle npm
        // dependencies into the server file; Node built-ins remain external.
        ssr: { noExternal: true },
      });
      await writeFile(
        join(options.root, paths.packageJson),
        JSON.stringify({ type: "module" }, null, 2) + "\n",
        "utf8",
      );
    },
  };
}
