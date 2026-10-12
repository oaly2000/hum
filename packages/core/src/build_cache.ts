import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { setBuildId } from "./runtime/shared_internal.js";
import type { HumManifest, Island, Logger } from "./types.js";

/** URL the dev server serves the client runtime from. */
export const CLIENT_ENTRY_DEV = "/_hum/runtime.js";

/** Name of the manifest the production build writes into the out dir. */
export const MANIFEST_FILE = "manifest.json";

export interface ProdIslandEntry {
  url: string;
  css?: string[];
}

export interface ProdManifest {
  buildId: string;
  clientEntry: string;
  islands: Record<string, ProdIslandEntry>;
  entryAssets?: string[];
}

export function manifestPath(root: string, outDir: string): string {
  return join(root, outDir, MANIFEST_FILE);
}

/** Reads the production manifest, or `null` when the app runs in dev. */
export async function readProdManifest(
  path: string,
): Promise<ProdManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ProdManifest;
  } catch {
    return null;
  }
}

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
  #prod: ProdManifest | null = null;

  constructor(dev: boolean) {
    this.dev = dev;
    this.clientEntry = dev ? CLIENT_ENTRY_DEV : "";
  }

  /** Loads every island module and (re)builds the registries. */
  async load(
    manifest: HumManifest,
    prod: ProdManifest | null,
    logger?: Logger,
  ): Promise<void> {
    this.#prod = prod;
    this.islands.clear();
    this.islandRegistry.clear();

    for (const spec of manifest.islands) {
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

      // In dev the modules are served straight from Vite, so a leftover
      // production manifest must never win over the dev URLs.
      const prodInfo = this.dev ? undefined : prod?.islands[spec.name];
      const island: Island = {
        name: spec.name,
        exportName: spec.exportName,
        file: spec.file,
        clientUrl: prodInfo?.url ?? `/${spec.file}`,
        css: prodInfo?.css ?? [],
      };

      this.islands.set(island.name, island);
      this.islandRegistry.set(component, island);
    }

    if (!this.dev && prod !== null) {
      this.clientEntry = prod.clientEntry;
      this.entryAssets = prod.entryAssets ?? [];
      this.buildId = prod.buildId;
      setBuildId(prod.buildId);
    }
  }

  getIsland(name: string): Island | undefined {
    return this.islands.get(name);
  }

  get prodManifest(): ProdManifest | null {
    return this.#prod;
  }
}
