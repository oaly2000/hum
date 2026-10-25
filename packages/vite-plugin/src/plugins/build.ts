import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PreRenderedChunk } from "rolldown";

import type { GeneratedPage, ProdManifest } from "@humjs/core/build";
import { createBuilder, type Plugin, type UserConfig, type ViteBuilder } from "vite";

import {
  ASSETS_BASE,
  BUILD_VIRTUAL_ID,
  CLIENT_RUNTIME_ENTRY,
  CLIENT_SLICE_QUERY,
  ISLANDS_ENTRY,
  makeBuildId,
  PAGES_VIRTUAL_ID,
  SERVER_ENTRY,
  SERVER_ENTRY_NAME,
  GENERATED_DIR,
  type HumContext,
  type ResolvedHumOptions,
} from "../shared.js";
import { writeBuildEntries } from "./islands.js";
import { STYLES_ID, STYLES_OUTPUT, stylesSource } from "./styles.js";

const PRERENDER_ENTRY = ".hum/prerender-entry.js";
const PAGES_OUTPUT = "_generated/hum-pages.js";

function comparisonPath(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function containsPath(parent: string, path: string): boolean {
  return path === parent || path.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** Keep application modules, globals and native addons out of Vite's process. */
async function prerender(entry: string): Promise<Record<string, GeneratedPage>> {
  const script = `
try {
  const module = await import(${JSON.stringify(pathToFileURL(entry).href)});
  const pages = await module.prerender();
  process.send({ pages }, () => process.exit(0));
} catch (error) {
  process.send({ error: { message: error instanceof Error ? error.message : String(error), stack: error?.stack } }, () => process.exit(1));
}
`;
  const child = spawn(process.execPath, [...process.execArgv, "--input-type=module", "--eval", script], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    serialization: "advanced",
  });
  try {
    return await new Promise((resolve, reject) => {
      child.once("message", (message: {
        pages?: Record<string, GeneratedPage>;
        error?: { message: string; stack?: string };
      }) => {
        if (message.error) {
          const error = new Error(message.error.message);
          error.stack = message.error.stack;
          reject(error);
        } else {
          resolve(message.pages!);
        }
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => reject(new Error(
        `hum: prerender exited before returning pages (${signal ?? code})`,
      )));
    });
  } finally {
    child.kill();
  }
}

/** This entry loads the compiled app only when route policies need generation. */
async function writePrerenderEntry(ctx: HumContext): Promise<void> {
  const { options } = ctx;
  const appEntry = resolve(options.root, options.devEntry);
  const loadApp = existsSync(appEntry)
    ? `const { default: app } = await import(${JSON.stringify(appEntry.replace(/\\/g, "/"))});`
    : `const app = await createApp(config);`;
  await writeFile(resolve(options.root, PRERENDER_ENTRY), `
import { createApp } from "@humjs/core";
import { planPages, prerenderPages } from "@humjs/core/build";
import { build, config } from ${JSON.stringify(BUILD_VIRTUAL_ID)};
export async function prerender() {
  const plan = await planPages(build, config);
  if (plan.length === 0) return {};
  ${loadApp}
  if (!app?.hum) throw new TypeError("hum: devEntry must export the mounted app for prerendering; keep the Node listener in serverEntry");
  return await prerenderPages(app);
}
`, "utf8");
}

interface ClientManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

// These helpers are already required by the runtime. Keep them with its entry
// without pulling Preact/signals or application declarations into that chunk.
const coreDirectory = dirname(fileURLToPath(import.meta.resolve("@humjs/core"))).replace(/\\/g, "/");

function runtimeModule(id: string): boolean {
  const path = id.replace(/\\/g, "/");
  // Keep response handling behind its dynamic import instead of pulling it
  // back into the eager framework group.
  const lazyPartial = /\/runtime\/partials\.[jt]s$/.test(path);
  return path.endsWith("/" + CLIENT_RUNTIME_ENTRY) ||
    (path.startsWith(coreDirectory + "/") && !lazyPartial) ||
    path === "\0vite/preload-helper.js";
}

/** Include CSS owned by shared static chunks, in dependency order. */
export function manifestStyles(manifest: Record<string, ClientManifestEntry>, key: string, seen = new Set<string>()): string[] {
  if (seen.has(key)) return [];
  seen.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`hum: missing asset manifest entry ${key}`);
  return [...new Set([
    ...(entry.imports ?? []).flatMap(id => manifestStyles(manifest, id, seen)),
    ...(entry.css ?? []),
    ...(entry.file.endsWith(".css") ? [entry.file] : []),
  ])];
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
 * Compile the application to ESM modules. Framework virtual modules become
 * ordinary generated modules and npm imports remain available to Node.
 */
function serverBuildConfig(options: ResolvedHumOptions, outDir: string, standalone = false) {
  const entry = existsSync(resolve(options.root, options.serverEntry))
    ? options.serverEntry : SERVER_ENTRY;
  return {
    outDir,
    emptyOutDir: false,
    ssr: true,
    emitAssets: true,
    target: "node20",
    manifest: false,
    minify: false,
    rolldownOptions: {
      input: {
        [SERVER_ENTRY_NAME]: resolve(options.root, entry),
        ...(standalone ? {} : {
          "_generated/prerender": resolve(options.root, PRERENDER_ENTRY),
          "_generated/hum-build": BUILD_VIRTUAL_ID,
          "_generated/hum-pages": PAGES_VIRTUAL_ID,
          "_generated/hum-styles": STYLES_ID,
        }),
      },
      preserveEntrySignatures: "strict" as const,
      treeshake: standalone,
      output: standalone ? {
        format: "es" as const,
        preserveModules: false,
        codeSplitting: false,
        entryFileNames: "[name].js",
      } : {
        format: "es" as const,
        preserveModules: true,
        codeSplitting: undefined,
        preserveModulesRoot: options.root,
        virtualDirname: "_generated",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
      },
    },
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
function prodManifest(ctx: HumContext, clientManifest: Record<string, ClientManifestEntry>): ProdManifest {
  const runtime = clientManifest[CLIENT_RUNTIME_ENTRY];
  if (runtime === undefined) {
    throw new Error(
      "hum: the client runtime produced no chunk, cannot build the manifest.",
    );
  }

  const islands: ProdManifest["islands"] = {};
  const factories: NonNullable<ProdManifest["factories"]> = {};
  for (const [file, entry] of Object.entries(clientManifest)) {
    if (!file.endsWith("?" + CLIENT_SLICE_QUERY)) continue;
    const declarations = ctx.clientDeclarations?.get(file.split("?")[0]!) ?? [];
    for (const declaration of declarations) {
      (declaration.kind === "island" ? islands : factories)[declaration.name] = { file: entry.file, css: manifestStyles(clientManifest, file) };
    }
  }

  return {
    buildId: makeBuildId(),
    assetsBase: ASSETS_BASE,
    clientEntry: runtime.file,
    islands,
    factories,
    entryAssets: manifestStyles(clientManifest, CLIENT_RUNTIME_ENTRY),
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

  const manifest = JSON.parse(await readFile(join(root, paths.client, ".vite", "manifest.json"), "utf8")) as Record<string, ClientManifestEntry>;
  const prod = prodManifest(ctx, manifest);
  const reachable = new Set<string>();
  function visit(key: string) {
    if (reachable.has(key)) return;
    reachable.add(key);
    const entry = manifest[key];
    for (const dependency of [...(entry?.imports ?? []), ...(entry?.dynamicImports ?? [])]) visit(dependency);
  }
  visit(CLIENT_RUNTIME_ENTRY);
  for (const key of Object.keys(manifest)) {
    if (key.endsWith("?" + CLIENT_SLICE_QUERY)) visit(key);
  }
  // The declarations entry only keeps lazy imports alive during compilation.
  // Omit it unless chunking has made it a dependency of a real client entry.
  const discovery = manifest[ISLANDS_ENTRY];
  const privateFiles = new Set<string>();
  if (discovery && !reachable.has(ISLANDS_ENTRY) &&
    ![...reachable].some(key => manifest[key]?.file === discovery.file)) {
    privateFiles.add(resolve(root, paths.client, discovery.file));
    privateFiles.add(resolve(root, paths.client, discovery.file + ".map"));
  }
  await cp(join(root, paths.client), resolve(root, paths.assets), {
    recursive: true,
    // The client manifest is build bookkeeping, not a client asset: the runtime
    // carries its build inside the server bundle, so nothing reads it at
    // runtime and it has no business being public. Node resolves a `cp` filter
    // against the source path only while its parent survives, so the directory
    // is named rather than pattern matched.
    filter: (source) => !source.includes(`${sep}.vite`) && !privateFiles.has(resolve(source)),
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
 * Vite environments retain the complete user configuration and plugin hooks.
 * Both deployment modes prerender the same compiled application modules; only
 * standalone adds a final bundling environment.
 */
export function humBuild(ctx: HumContext): Plugin {
  let sourceConfig: UserConfig;
  let orchestrating = false;
  let clientFailed = false;
  let standalonePass = false;
  const compilationId = makeBuildId();
  const moduleDir = () => ctx.options.standalone
    ? resolve(ctx.options.root, ".hum", `server-${compilationId}`)
    : resolve(ctx.options.root, ctx.options.outDir);

  async function compileStyles() {
    const inputs = [...new Set([...(ctx.styleDependencies?.values() ?? [])].flat())];
    ctx.styles = {};
    if (!inputs.length) return;
    const directory = resolve(ctx.options.root, ".hum/styles");
    ctx.stylesPass = inputs;
    try {
      const builder = await createBuilder({ ...sourceConfig, configFile: false });
      await builder.build(builder.environments.client!);
      const manifest = JSON.parse(await readFile(join(directory, ".vite/manifest.json"), "utf8")) as Record<string, ClientManifestEntry>;
      for (const [route, dependencies] of ctx.styleDependencies!) {
        ctx.styles[route] = [...new Set(dependencies.flatMap(id => {
          const key = relative(ctx.options.root, id).replace(/\\/g, "/");
          return manifestStyles(manifest, key);
        }))].map(file => ctx.options.basePath.replace(/\/$/, "") + ASSETS_BASE + "/" + file);
      }
      // JS class-map wrappers are compilation intermediates. Only styles and
      // their referenced assets belong in the public deployment.
      await cp(directory, resolve(ctx.options.root, buildPaths(ctx.options).assets), {
        recursive: true,
        filter: path => !path.includes(`${sep}.vite`) && !/\.[cm]?js(?:\.map)?$/.test(path),
      });
    } finally {
      ctx.stylesPass = undefined;
      await rm(directory, { recursive: true, force: true });
    }
  }

  async function finishBuild(builder: ViteBuilder) {
    const { options } = ctx;
    const paths = buildPaths(options);
    ctx.prod = await assembleBuild(ctx);
    ctx.pages = undefined;
    if (options.verbose) {
      const islands = Object.values(ctx.prod.islands);
      const chunks = new Set(islands.map((island) => island.file));
      builder.config.logger.info(`hum: ${islands.length} island(s), ${chunks.size} island module chunk(s)`);
    }
    try {
      await builder.build(builder.environments.ssr!);
      await compileStyles();
      // Finalize metadata before prerender captures full HTML and partials.
      await writeFile(join(moduleDir(), STYLES_OUTPUT), stylesSource(ctx));
      await writeFile(join(moduleDir(), "package.json"), '{"type":"module"}\n');
      const prerenderFile = join(moduleDir(), "_generated", "prerender.js");
      ctx.pages = await prerender(prerenderFile);
      await writeFile(join(moduleDir(), PAGES_OUTPUT), `export default ${JSON.stringify(ctx.pages)};\n`);
      await rm(prerenderFile);
      await rm(prerenderFile + ".map", { force: true });
      await rm(join(moduleDir(), PAGES_OUTPUT + ".map"), { force: true });
      if (options.standalone) {
        // Resolve a fresh SSR environment so native resolvers use the final
        // dependency policy. User transforms see original source, and plugins
        // scoped to the standard ssr environment keep working.
        standalonePass = true;
        try {
          const standalone = await createBuilder({ ...sourceConfig, configFile: false });
          await standalone.build(standalone.environments.ssr!);
        } finally {
          standalonePass = false;
        }
      }
      await writeFile(resolve(options.root, paths.packageJson), '{"type":"module"}\n');
    } finally {
      if (options.standalone) {
        // This directory is created solely for this build inside .hum.
        await rm(moduleDir(), { recursive: true, force: true });
      }
    }
  }

  return {
    name: "hum:build",
    apply: "build",
    sharedDuringBuild: true,

    async config(config) {
      const options = ctx.options;
      const paths = buildPaths(options);
      if (ctx.stylesPass) return {
        base: options.basePath.replace(/\/$/, "") + ASSETS_BASE + "/",
        publicDir: false,
        build: {
          outDir: ".hum/styles", emptyOutDir: true, manifest: true,
          cssCodeSplit: true,
          rolldownOptions: { input: ctx.stylesPass, preserveEntrySignatures: "strict" },
        },
      };
      sourceConfig ??= { ...config, build: { ...config.build }, environments: { ...config.environments } };
      await writeBuildEntries(ctx);
      await writePrerenderEntry(ctx);
      const configuredOutput = config.build?.rolldownOptions?.output;
      const chunkFileNames = !Array.isArray(configuredOutput) && configuredOutput?.chunkFileNames;

      return {
        appType: "custom",
        base: options.basePath.replace(/\/$/, "") + ASSETS_BASE + "/",
        publicDir: false,
        builder: { sharedConfigBuild: true, sharedPlugins: true },
        environments: { ssr: { consumer: "server" } },
        build: {
          outDir: paths.client,
          emptyOutDir: true,
          manifest: true,
          rolldownOptions: {
            input: { runtime: CLIENT_RUNTIME_ENTRY, islands: ISLANDS_ENTRY },
            // Runtime helpers may add exports consumed by application slices.
            preserveEntrySignatures: "allow-extension",
            output: {
              chunkFileNames: chunkFileNames || ((chunk: PreRenderedChunk) => {
                const id = chunk.facadeModuleId;
                let name = "[name]";
                if (id?.endsWith("?" + CLIENT_SLICE_QUERY)) {
                  const file = relative(options.root, id.split("?")[0]!).replace(/\\/g, "/");
                  name = "client-" + file.replace(/\.[jt]sx?$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
                }
                return `${config.build?.assetsDir ?? "assets"}/${name}-[hash].js`;
              }),
              codeSplitting: {
                groups: [{ name: "runtime", test: runtimeModule, includeDependenciesRecursively: false }],
              },
            },
          },
        },
      };
    },

    configEnvironment(name, config) {
      const options = ctx.options;
      if (name === "ssr") {
        const server = serverBuildConfig(options, standalonePass ? options.outDir : moduleDir(), standalonePass);
        const output = config.build?.rolldownOptions?.output;
        config.build = {
          ...config.build,
          ...server,
          target: config.build?.target ?? server.target,
          minify: config.build?.minify ?? server.minify,
          rolldownOptions: {
            ...config.build?.rolldownOptions,
            ...server.rolldownOptions,
            output: { ...(Array.isArray(output) ? {} : output), ...server.rolldownOptions.output },
          },
        };
        config.resolve = {
          ...config.resolve,
          external: config.resolve?.external ?? (standalonePass ? [] : true),
          ...(standalonePass ? { noExternal: true } : {}),
        };
      }
    },

    resolveId(id) {
      return id === PAGES_VIRTUAL_ID ? "\0" + PAGES_VIRTUAL_ID : null;
    },
    load(id) {
      return id === "\0" + PAGES_VIRTUAL_ID ? `export default ${JSON.stringify(ctx.pages ?? {})};` : null;
    },

    // Publish server-referenced assets beside client output. Rendered asset
    // URLs already use the build's /_hum/ base. Stylesheet links are supplied
    // by the independent style compilation before prerendering, so extracted
    // SSR CSS is redundant. Explicit asset imports (including CSS ?url) remain.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        if (this.environment.name !== "ssr") return;
        const referencedAssets = new Set(Object.values(bundle).flatMap(output =>
          output.type === "chunk" ? [...(output.viteMetadata?.importedAssets ?? [])] : [],
        ));
        for (const [file, output] of Object.entries(bundle)) {
          if (output.type !== "asset") continue;
          delete bundle[file];
          if (file.endsWith(".css") && !referencedAssets.has(file)) continue;
          this.emitFile({
            type: "asset",
            fileName: `public/${HUM_ASSETS_DIR}/${file}`,
            source: output.source,
          });
        }
      },
    },

    async buildStart() {
      if (ctx.stylesPass) return;
      if (this.environment.name !== "client") return;
      clientFailed = false;
      const { options } = ctx;
      const root = resolve(options.root);
      const outDir = resolve(root, options.outDir);
      const rootPath = comparisonPath(root);
      const outputPath = comparisonPath(outDir);
      if (containsPath(outputPath, rootPath)) {
        throw new Error("hum: outDir must not contain the project root");
      }
      const sourceDirectories = [GENERATED_DIR, PROJECT_PUBLIC, options.routesDir];
      for (const directory of sourceDirectories) {
        const source = comparisonPath(resolve(root, directory));
        if (containsPath(source, outputPath) || containsPath(outputPath, source)) {
          throw new Error(`hum: outDir must not overlap the source directory "${directory}"`);
        }
      }
      for (const entry of [options.serverEntry, options.devEntry]) {
        const source = comparisonPath(resolve(root, entry));
        if (containsPath(outputPath, source)) {
          throw new Error(`hum: outDir must not contain the source entry "${entry}"`);
        }
      }
      // Match Vite's protection of output directories outside the project.
      if (containsPath(rootPath, outputPath) || sourceConfig.build?.emptyOutDir === true) {
        await rm(outDir, { recursive: true, force: true });
      }
    },

    buildEnd(error) {
      if (this.environment.name === "client" && error) clientFailed = true;
    },

    async buildApp(builder) {
      orchestrating = true;
      try {
        await builder.build(builder.environments.client!);
        await finishBuild(builder);
      } finally {
        orchestrating = false;
      }
    },

    async closeBundle() {
      if (ctx.stylesPass) return;
      // Vite's programmatic build() builds one environment instead of invoking
      // buildApp. Reuse its original user config and full plugin pipeline.
      if (this.environment.name !== "client" || orchestrating || clientFailed) return;
      orchestrating = true;
      try {
        const builder = await createBuilder({ ...sourceConfig, configFile: false });
        await finishBuild(builder);
      } finally {
        orchestrating = false;
      }
    },
  };
}
