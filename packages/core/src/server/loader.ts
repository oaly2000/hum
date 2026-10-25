import { RouteLoadError } from "./error.js";
import type { ModuleThunk } from "../types.js";

/** A module source that can be imported lazily by the current bundler. */
export interface ModuleSource {
  file: string;
  load: ModuleThunk<Record<string, unknown>>;
}

/**
 * Loads route modules through the bundler supplied thunks. In development the
 * thunk is invoked per request so that HMR invalidated modules are picked up
 * automatically; in production the module is imported once and cached.
 */
export class ModuleLoader {
  #cache = new Map<string, Promise<Record<string, unknown>>>();

  constructor(readonly dev: boolean) {}

  load(source: ModuleSource): Promise<Record<string, unknown>> {
    if (!this.dev) {
      const cached = this.#cache.get(source.file);
      if (cached !== undefined) return cached;
    }

    // A failure is wrapped so that the rendered error page can tell which file
    // broke; the original error stays reachable through `cause`.
    const promise = source.load().catch((err: unknown) => {
      this.#cache.delete(source.file);
      throw new RouteLoadError(source.file, err);
    });

    if (!this.dev) this.#cache.set(source.file, promise);
    return promise;
  }

  clear(): void {
    this.#cache.clear();
  }
}
