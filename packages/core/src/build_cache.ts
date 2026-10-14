import type { HumBuild } from "./build.js";
import { setBuildId } from "./runtime/shared_internal.js";
import type { Island, Logger } from "./types.js";

/** URL the dev server serves the client runtime from. */
export const CLIENT_ENTRY_DEV = "/_hum/runtime.js";

/**
 * URL Hum publishes its client assets under when it runs from source: the dev
 * server serves them, and there is no build to record a different one.
 */
export const ASSETS_BASE_DEV = "/_hum";

/**
 * Maps island components to their client side module URLs, and keeps the
 * bookkeeping the renderer needs (`islandRegistry`, entry assets, build id).
 *
 * Island modules are loaded through the bundler supplied thunks, so the same
 * cache implementation works for the Vite dev module runner and for the
 * bundled production output.
 */
export class BuildCache {
  /** Islands by name. */
  readonly islands = new Map<string, Island>();
  /** Islands by component reference, used to detect islands while rendering. */
  readonly islandRegistry = new Map<unknown, Island>();
  /** URL of the client runtime entry, imported by the boot script. */
  clientEntry: string;
  /** Stylesheets that belong to the client entry itself. */
  entryAssets: string[] = [];
  buildId = "dev";
  readonly dev: boolean;
  /** URL prefix the client assets are published under. */
  #assetsBase: string;

  constructor(dev: boolean, assetsBase?: string) {
    this.dev = dev;
    // The build records the URL its assets are published under; a bundler that
    // runs from source falls back to the one the dev server serves.
    this.#assetsBase = (assetsBase ?? ASSETS_BASE_DEV).replace(/\/+$/, "");
    this.clientEntry = dev ? CLIENT_ENTRY_DEV : "";
  }

  /** Loads every island module and (re)builds the registries. */
  async load(build: HumBuild, logger?: Logger): Promise<void> {
    const prod = this.dev ? null : build.prod;
    this.islands.clear();
    this.islandRegistry.clear();
    // The URL is the build's, not the configuration's: the client assets are
    // published under it wherever the output directory ends up on disk.
    this.#assetsBase = (prod?.assetsBase ?? this.#assetsBase).replace(/\/+$/, "");

    for (const spec of build.islands) {
      let component: unknown;
      try {
        const mod = await spec.load();
        component = mod[spec.exportName];
      } catch (err) {
        logger?.error(
          `hum: failed to load island "${spec.name}" from ${spec.file}:`,
          err,
        );
        continue;
      }

      if (component === undefined) {
        logger?.warn(
          `hum: island "${spec.name}" (${spec.file}) has no ` +
            `"${spec.exportName}" export. Add a default export to make it ` +
            `interactive.`,
        );
        continue;
      }

      // In dev the modules are served straight from Vite, so the assets of a
      // build must never win over the dev URLs.
      const prodInfo = prod?.islands[spec.name];
      const island: Island = {
        name: spec.name,
        exportName: spec.exportName,
        file: spec.file,
        // In dev Vite serves the island module by its source path, which is why
        // the build's assets must never win over it.
        clientUrl: prodInfo === undefined
          ? `/${spec.file}`
          : this.#assetUrl(prodInfo.file),
        css: (prodInfo?.css ?? []).map((css) => this.#assetUrl(css)),
      };

      this.islands.set(island.name, island);
      this.islandRegistry.set(component, island);
    }

    if (!this.dev && prod !== null) {
      this.clientEntry = this.#assetUrl(prod.clientEntry);
      this.entryAssets = (prod.entryAssets ?? []).map((asset) =>
        this.#assetUrl(asset)
      );
      this.buildId = prod.buildId;
      setBuildId(prod.buildId);
    }
  }

  /** Turns a path relative to the assets base into a public URL. */
  #assetUrl(file: string): string {
    // Builds written by an older plugin stored absolute URLs; keep those
    // working instead of prefixing them a second time.
    if (file.startsWith("/")) return file;
    return `${this.#assetsBase}/${file}`;
  }

  getIsland(name: string): Island | undefined {
    return this.islands.get(name);
  }
}
