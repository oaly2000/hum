import type { IslandManifestEntry, RouteManifestEntry } from "./types.js";

/** One island chunk of a production build. */
export interface ProdIslandEntry {
  /** Island chunk path, relative to `assetsBase`. */
  file: string;
  /** Island stylesheet paths, relative to `assetsBase`. */
  css?: string[];
}

/**
 * The client assets of a production build, as the bundler recorded them.
 *
 * It reaches the runtime inside the build it belongs to, so nothing here is
 * read from disk: a platform without a file system runs the same runtime, and
 * the deployed output directory can be renamed or moved without touching the
 * URLs below.
 */
export interface ProdManifest {
  buildId: string;
  /**
   * URL Hum publishes its client assets under, e.g. `/_hum`. It is never
   * derived from the output directory: the assets live in the build's `public`
   * directory, next to the server bundle, and the URL is what addresses them,
   * so the output directory can be called `dist`, `wwwroot` or anything else.
   */
  assetsBase: string;
  /** Client runtime chunk path, relative to `assetsBase`. */
  clientEntry: string;
  islands: Record<string, ProdIslandEntry>;
  /** Client entry stylesheet paths, relative to `assetsBase`. */
  entryAssets?: string[];
}

/**
 * What a bundler produced for one app: the route and island modules it
 * resolved (`specsFromGlob`'s result) plus the client assets of the production
 * build, or `null` while the app runs from source.
 *
 * Hum never discovers any of this itself — only a bundler can turn a project's
 * files into modules — so the generated build module registers it before the
 * app is mounted, and the runtime boots from what it finds there.
 */
export interface HumBuild {
  routes: RouteManifestEntry[];
  islands: IslandManifestEntry[];
  /** The production build's assets, or `null` when there is no build. */
  prod: ProdManifest | null;
}

/**
 * Where the registered build lives.
 *
 * A bundler runs its own copy of the framework: Vite's dev pipeline loads
 * `@humjs/core` from source, so the module that registers the build and the one
 * that mounts the app are two instances with two module scopes. The build is
 * kept on `globalThis` — under a key no other module can collide with — so both
 * sides see the same one, in development and in a bundle alike.
 */
const BUILD_KEY = Symbol.for("hum.build");

interface BuildSlot {
  build: HumBuild | null;
}

function buildSlot(): BuildSlot {
  const scope = globalThis as unknown as Record<symbol, BuildSlot | undefined>;
  const existing = scope[BUILD_KEY];
  if (existing !== undefined) return existing;

  const slot: BuildSlot = { build: null };
  scope[BUILD_KEY] = slot;
  return slot;
}

/**
 * Registers the build Hum runs from and returns it, so a generated module can
 * both register its build and export it:
 *
 * ```js
 * export const build = defineBuild({
 *   routes: manifest.routes,
 *   islands: manifest.islands,
 *   prod: null,
 * });
 * ```
 *
 * Importing that module is what hands the runtime its input, which is why
 * `mountHum` takes no routes, islands or production assets of its own.
 */
export function defineBuild(build: HumBuild): HumBuild {
  buildSlot().build = build;
  return build;
}

/**
 * The registered build.
 *
 * A mounted app keeps the build it was mounted with, so registering another one
 * later does not disturb it.
 */
export function humBuild(): HumBuild {
  const { build } = buildSlot();
  if (build === null) throw new TypeError(BUILD_REQUIRED);
  return build;
}

/**
 * Nothing but the bundler can produce a build, so a missing one is a setup
 * mistake rather than something to fall back from.
 */
const BUILD_REQUIRED =
  "hum: no build registered. Import the module the Vite plugin generated " +
  "(`virtual:hum/build`), which calls `defineBuild` with the routes, the " +
  "islands and the production assets; when mounting Hum yourself, call " +
  "`defineBuild` with the result of `specsFromGlob` from `@humjs/core/routing`.";
