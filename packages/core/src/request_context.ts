import { AsyncLocalStorage } from "node:async_hooks";

import type { PageFn } from "./types.js";

/** The request-scoped helpers available while a route handler runs. */
export interface RequestContext {
  /** Renders the page component of the route currently being handled. */
  page: PageFn;
}

// Stored on `globalThis` rather than as a plain module-level singleton: in dev
// the vite-plugin (Node module registry) and the route modules (vite SSR module
// registry) each load @hum/core separately, so two `request_context` module
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
  ctx: RequestContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn);
}

/**
 * Renders the page component of the route currently being handled. Import it
 * from `@hum/core` and call it inside a `handlers` function — no need to thread
 * it through arguments.
 *
 * ```tsx
 * import { page } from "@hum/core";
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
  return ctx.page(data, options);
};
