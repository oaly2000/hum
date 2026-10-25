import { AsyncLocalStorage } from "node:async_hooks";

import { ResourceManager, type Resource, type ResourceKey } from "./resource.js";
import type { PageFn } from "../types.js";

/** The request-scoped helpers available while a route handler runs. */
export interface RequestContext {
  /** Renders the page component of the route currently being handled. */
  page?: PageFn;
  resources: ResourceManager;
}

// Stored on `globalThis` rather than as a plain module-level singleton: in dev
// the vite-plugin (Node module registry) and the route modules (vite SSR module
// registry) each load @humjs/core separately, so two `request_context` module
// evaluations would otherwise produce two independent `AsyncLocalStorage`
// instances. `runWithRequestContext` and the imported `page` must share one.
const globalRef = globalThis as unknown as {
  __humRequestContext?: AsyncLocalStorage<RequestContext>;
};

const storage = globalRef.__humRequestContext ??
  (globalRef.__humRequestContext = new AsyncLocalStorage<RequestContext>());

/**
 * Runs `fn` with a request-scoped context so that module-level helpers such as
 * {@link page} know which route they belong to. AsyncLocalStorage keeps each
 * concurrent request isolated — the store is only visible within that request's
 * async chain.
 */
export function runWithRequestContext<T>(
  ctx: Partial<RequestContext>,
  fn: () => T,
): T {
  const parent = storage.getStore();
  const context = parent === undefined
    ? { resources: new ResourceManager(), ...ctx }
    : { ...parent, ...ctx };
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Starts and registers a typed resource for the current request.
 *
 * Call this from a Hum route middleware; descendant layouts and the route view
 * can retrieve it with {@link getResource}.
 */
export function registerResource<T>(
  key: ResourceKey<T>,
  load: () => PromiseLike<T>,
): Resource<T> {
  const context = storage.getStore();
  if (context === undefined) {
    throw new Error(
      "hum: `registerResource` can only be called while handling a Hum request.",
    );
  }
  return context.resources.register(key, load);
}

/** Retrieves a typed resource registered earlier in the current request. */
export function getResource<T>(key: ResourceKey<T>): Resource<T> {
  const context = storage.getStore();
  if (context === undefined) {
    throw new Error(
      "hum: `getResource` can only be called while handling or rendering a Hum request.",
    );
  }
  return context.resources.get(key);
}

/**
 * Renders the page component of the route currently being handled. Import it
 * from `@humjs/core` and call it inside a `handlers` function — no need to thread
 * it through arguments.
 *
 * ```tsx
 * import { page } from "@humjs/core";
 * export const handlers = {
 *   GET: (c) => page({ id: c.req.param("id") }),
 * };
 * ```
 */
export const page: PageFn = (data, options) => {
  const ctx = storage.getStore();
  if (ctx === undefined) {
    throw new Error(
      "hum: `page` can only be called from within a route handler. " +
        "To render outside of one, use `renderRoute` directly.",
    );
  }
  if (ctx.page === undefined) {
    throw new Error(
      "hum: `page` can only be called from within a route handler.",
    );
  }
  return ctx.page(data, options);
};
