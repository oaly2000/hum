import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { crawlProject } from "@humjs/core/discovery";
import type { Plugin } from "vite";

import type { HumContext, ResolvedHumOptions } from "../shared.js";
import {
  CLIENT_RUNTIME_ENTRY,
  CORE_RUNTIME_ID,
  SERVER_ENTRY,
} from "../shared.js";

/**
 * Discovers the routes and islands of the project.
 *
 * In development the client runtime — including the optional user client entry
 * — is served through the `hum:client-entry` virtual module, and every island
 * file is served straight from Vite, so no extra entry is needed: `BuildCache`
 * points the boot script at `/islands/Foo.tsx` and Vite transforms that request
 * on the fly.
 */
export function humIslands(ctx: HumContext): Plugin {
  return {
    name: "hum:islands",

    async buildStart() {
      const crawled = await crawlProject({
        root: ctx.options.root,
        routesDir: ctx.options.routesDir,
        islandsDir: ctx.options.islandsDir,
      });
      ctx.project.routes = crawled.routes;
      ctx.project.islands = crawled.islands;

      if (ctx.options.verbose) {
        this.info(
          `hum: ${ctx.project.routes.length} route file(s), ` +
            `${ctx.project.islands.length} island(s)`,
        );
      }
    },

    // The client runtime modules expose `boot`/`revive`/`applyPartials` that the
    // generated boot script imports from the built entry chunk, but nothing inside
    // the bundle itself consumes them, so Rolldown (Vite 8) tree-shakes the whole
    // `@humjs/core/runtime` module — leaving the chunk without `boot` and breaking
    // island hydration in production. Marking the runtime as side-effectful keeps
    // the full module (including `boot`) in the output.
    transform(code, id) {
      if (
        id.includes(CORE_RUNTIME_ID) ||
        id.includes("/runtime/client/")
      ) {
        // `"no-treeshake"` (the Rolldown Vite 8 value) prevents this module's
        // own code — and crucially its exports — from being tree-shaken. The
        // client runtime exposes `boot`/`revive`/`applyPartials` that are only
        // imported by the server-inlined boot script outside the bundle, so
        // without this Rolldown drops them and hydration/partials break in
        // production.
        return { code, moduleSideEffects: "no-treeshake" };
      }
      return null;
    },
  };
}

/**
 * Writes the entry files the production build needs into `.hum/`. The client
 * build bundles the runtime once and every island as its own chunk; the server
 * build gets an entry that boots a real Node server.
 */
export async function writeBuildEntries(ctx: HumContext): Promise<void> {
  const dir = join(ctx.options.root, ".hum");
  await mkdir(dir, { recursive: true });
  const userServer = resolve(ctx.options.root, "server.ts");

  // The runtime entry imports the optional user client entry first, so its
  // global styles (e.g. TailwindCSS) become part of the runtime chunk and flow
  // into the manifest's `entryAssets` in production.
  const userEntry = resolve(ctx.options.root, ctx.options.clientEntry);
  const userImport = existsSync(userEntry)
    ? `import ${JSON.stringify(userEntry)};\n`
    : "";
  // The boot script in the server-rendered HTML does `import { boot } from
  // "<entry>.js"` and calls it, but that call lives outside the bundle, so the
  // bundler cannot see a consumer for `boot`/`revive`/`applyPartials`. Their
  // only reachable use inside the bundle is the `typeof` guard below, which
  // keeps them alive through tree-shaking (Rolldown in Vite 8 drops an entry
  // that merely re-exports inlined, unused bindings — that broke island
  // hydration in production).
  await writeFile(
    join(ctx.options.root, CLIENT_RUNTIME_ENTRY),
    // The boot script in the server-rendered HTML imports `boot` from this
    // entry and calls it, but that call lives outside the bundle, so Rolldown
    // (Vite 8) cannot see a consumer and tree-shakes `boot`/`revive`/
    // `applyPartials` away — breaking hydhration and partial updates in
    // production. Importing them here and exporting a live reference keeps the
    // runtime (which also registers the partial navigation side effects) fully
    // in the emitted chunk.
    userImport +
      `import { boot, revive, applyPartials, hum_island_registry } from ${
        JSON.stringify(CORE_RUNTIME_ID)
      };\n` +
      `export { boot, revive, applyPartials, hum_island_registry };\n` +
      `globalThis.__humRuntime = { boot, revive, applyPartials };\n` +
      `void applyPartials;\n`,
    "utf8",
  );

  const toModule = (absPath: string) =>
    JSON.stringify(absPath.replace(/\\/g, "/"));

  const routes = ctx.project.routes.map(
    (spec) =>
      `  [ ${JSON.stringify(spec.file)}, ${JSON.stringify(spec.kind)}, ` +
      `${JSON.stringify(spec.urlPath)}, () => import(${
        toModule(spec.absPath)
      }) ]`,
  );
  const islands = ctx.project.islands.map(
    (spec) =>
      `  [ ${JSON.stringify(spec.name)}, ${JSON.stringify(spec.exportName)}, ` +
      `${JSON.stringify(spec.file)}, ` +
      `() => import(${toModule(spec.absPath)}) ]`,
  );
  // The deployed output directory may be renamed or moved, so the server entry
  // locates it relative to its own bundle instead of trusting the build machine
  // path: the server file lives in `<outDir>/server/`, which makes `<outDir>`
  // the parent directory of the bundle.
  //
  // Only the nesting depth of the output directory is known at build time, so
  // the entry walks that many levels up from the bundle to find the project
  // root and derives the output directory from it. Renaming any of its segments
  // therefore keeps the static file lookup intact; the URL the assets are
  // served from is recorded in the build manifest instead.
  const outDir = ctx.options.outDir.replace(/\\/g, "/");
  const upToRoot = outDir
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .map(() => '".."')
    .join(", ") || '".."';

  const entry = `// Generated by @humjs/vite-plugin. Do not edit.
  import { dirname, relative, resolve, sep } from "node:path";
  import { fileURLToPath } from "node:url";
  import { createApp, mountHum } from "@humjs/core";
  import { serve } from "@humjs/core/server";

const buildDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(buildDir, ${upToRoot});
const outDir = relative(root, buildDir).split(sep).join("/");

  const routes = [
${routes.join(",\n")}
  ].map(([file, kind, urlPath, load]) => ({
    file,
    kind,
    urlPath,
    absPath: resolve(root, file),
    load,
  }));

  const islands = [
  ${islands.join(",\n")}
  ].map(([name, exportName, file, load]) => ({
    name,
    exportName,
    file,
    absPath: resolve(root, file),
    load,
  }));

const humConfig = {
  root,
  routesDir: ${JSON.stringify(ctx.options.routesDir)},
  islandsDir: ${JSON.stringify(ctx.options.islandsDir)},
  outDir,
  dev: false,
  manifest: { routes, islands },
};

${
    existsSync(userServer)
      ? `const { default: app } = await import(${
        JSON.stringify(userServer.replace(/\\/g, "/"))
      });
await mountHum(app, humConfig);
serve(app);`
      : `const humApp = await createApp(humConfig);
serve(humApp);`
  }
`;

  await writeFile(join(ctx.options.root, SERVER_ENTRY), entry, "utf8");
}
