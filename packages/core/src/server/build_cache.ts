import type { HumBuild } from "../build/registry.js";
import { ASSETS_BASE, RUNTIME_URL } from "./config.js";
import { setBuildId } from "../shared/asset.js";
import type { Island } from "../types.js";

/**
 * Maps island names to their client side module URLs, and keeps the bookkeeping
 * the renderer needs (entry assets, build id).
 *
 * Nothing is imported to build the table: an island's name, export and file
 * path are all in the build's manifest, and a module is only ever loaded when a
 * page uses it. That is what keeps mounting free of module loading, in the Vite
 * dev module runner and in the bundled production output alike — and what lets
 * the renderer recognize islands by the tag their components carry, rather than
 * by the identity of a module instance.
 */
export class BuildCache {
  /** Islands by name, as their markers and the boot script name them. */
  readonly islands = new Map<string, Island>();
  readonly factories = new Map<string, Island>();
  /** URL of the client runtime entry, imported by the boot script. */
  clientEntry: string;
  /** Stylesheets that belong to the client entry itself. */
  entryAssets: string[] = [];
  buildId = "dev";
  readonly dev: boolean;
  /**
   * URL prefix the client assets are published under. It is the build's when a
   * build registered one, and the framework constant otherwise: there is no
   * configuration that could set it.
   */
  #assetsBase: string;

  constructor(dev: boolean) {
    this.dev = dev;
    this.#assetsBase = ASSETS_BASE;
    this.clientEntry = dev ? RUNTIME_URL : "";
  }

  /** (Re)builds the island table from the build's manifest. */
  load(build: HumBuild): void {
    const prod = this.dev ? null : build.prod;
    this.islands.clear();
    this.factories.clear();
    // The URL is the build's, not the configuration's: the client assets are
    // published under it wherever the output directory ends up on disk.
    this.#assetsBase = (prod?.assetsBase ?? ASSETS_BASE).replace(/\/+$/, "");

    for (const [kind, specs] of [["islands", build.islands], ["factories", build.factories ?? []]] as const) {
      for (const spec of specs) {
        // In dev the modules are served straight from Vite, so the assets of a
        // build must never win over the dev URLs.
        const prodInfo = prod?.[kind]?.[spec.name];
        const island: Island = {
          name: spec.name,
          exportName: spec.exportName,
          file: spec.file,
          // In dev Vite serves the island module by its source path, which is why
          // the build's assets must never win over it.
          clientUrl: prodInfo === undefined
            ? `/${spec.clientFile ?? spec.file}`
            : this.#assetUrl(prodInfo.file),
          css: (prodInfo?.css ?? []).map((css) => this.#assetUrl(css)),
        };

        this[kind].set(island.name, island);
      }
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
