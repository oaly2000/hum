import { type Env, Hono, type MiddlewareHandler, type Schema } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  BuildCache,
  manifestPath,
  type ProdManifest,
  readProdManifest,
} from "./build_cache.js";
import {
  defaultLogger,
  type HumConfig,
  resolveConfig,
  type ResolvedConfig,
} from "./config.js";
import { ModuleLoader } from "./loader.js";
import {
  type RequestContext,
  runWithRequestContext,
} from "./request_context.js";
import {
  findNotFound,
  renderError,
  renderNotFound,
  type RenderOutcome,
  renderRoute,
  type RouteRenderInput,
} from "./render.js";
import {
  dirOf,
  type ResolvedNotFound,
  type ResolvedRoute,
  resolveRoutes,
  unmatchedRoute,
} from "./routing/fs_routes.js";
import type {
  HumContext,
  HumManifest,
  HumMiddleware,
  PageRenderOptions,
  RouteModule,
} from "./types.js";

export interface HumVariables {
  /** The route Hum matched for this request. */
  humRoute?: ResolvedRoute;
  [key: string]: unknown;
}

export type HumApp = Hono<{ Variables: HumVariables }> & { hum: HumInternals };
export type MountedHumApp<E extends Env, S extends Schema, P extends string> =
  & Hono<E, S, P>
  & { hum: HumInternals };

export interface HumInternals {
  config: ResolvedConfig;
  manifest: HumManifest;
  prodManifest: ProdManifest | null;
  buildCache: BuildCache;
  loader: ModuleLoader;
  routes: ResolvedRoute[];
  notFound: ResolvedNotFound[];
  /** Reloads island and route modules. No-op in production. */
  refresh(): Promise<void>;
}

function htmlResponse(
  c: HumContext,
  outcome: RenderOutcome,
): Response {
  if (outcome.links.length > 0) {
    c.header(
      "Link",
      outcome.links.map((url) => `<${url}>; rel=modulepreload`).join(", "),
    );
  }
  if (typeof outcome.body === "string") {
    return c.html(outcome.body, outcome.status as ContentfulStatusCode);
  }
  return c.body(
    outcome.body,
    outcome.status as ContentfulStatusCode,
    { "Content-Type": "text/html; charset=UTF-8" },
  );
}

function pickHandler(
  handlers: RouteModule["handlers"],
  method: string,
):
  | ((c: HumContext) => Response | Promise<Response> | void | Promise<void>)
  | undefined {
  if (handlers === undefined) return undefined;
  if (method === "HEAD" && handlers.HEAD === undefined) {
    return handlers.GET;
  }
  const byMethod = handlers as unknown as Record<
    string,
    | ((c: HumContext) => Response | Promise<Response> | void | Promise<void>)
    | undefined
  >;
  return byMethod[method];
}

/**
 * Runs a directory-scoped middleware chain, ending in `terminal`. The
 * middlewares are Hono middlewares, so Hono's semantics apply, with one
 * ergonomic extension: returning a `Response` short circuits, and a middleware
 * that never calls `next()` continues the chain.
 */
async function runRouteMiddleware(
  list: HumMiddleware[],
  c: HumContext,
  terminal: () => Promise<Response>,
): Promise<Response> {
  const dispatch = async (index: number): Promise<Response> => {
    if (index >= list.length) return await terminal();

    const fn = list[index];
    let downstream: Response | undefined;
    let called = false;

    const next = async (): Promise<void> => {
      if (called) throw new Error("next() called multiple times");
      called = true;
      downstream = await dispatch(index + 1);
    };

    const result = await fn(c, next);
    if (result instanceof Response) {
      c.res = result;
      return result;
    }
    if (called && downstream !== undefined) return downstream;
    return await dispatch(index + 1);
  };

  return await dispatch(0);
}

/**
 * Loads the `_middleware.ts` files scoped to a route's directory, root first.
 * Modules that do not export a middleware are skipped with a warning.
 */
async function loadMiddleware(
  route: ResolvedRoute,
  internals: HumInternals,
): Promise<HumMiddleware[]> {
  const list: HumMiddleware[] = [];
  for (const spec of route.middlewares) {
    const middlewareModule = await internals.loader.load(spec);
    const middleware = (middlewareModule.default ??
      middlewareModule.middleware) as HumMiddleware | undefined;

    if (typeof middleware !== "function") {
      internals.config.logger.warn(
        `hum: ${spec.file} does not export a middleware as its default ` +
          `export. Skipping it.`,
      );
      continue;
    }
    list.push(middleware);
  }

  return list;
}

/**
 * Mounts Hum's file routes, static assets, 404 handling, and runtime state onto
 * an existing Hono application.
 *
 * Application middleware registered before this call also wraps Hum routes.
 */
export async function mountHum<
  E extends Env,
  S extends Schema,
  P extends string,
>(
  app: Hono<E, S, P>,
  config: HumConfig,
): Promise<MountedHumApp<E, S, P>> {
  // Plain JavaScript callers get told what TypeScript already enforces.
  const manifest: HumManifest | undefined = config.manifest;
  if (manifest === undefined) throw new TypeError(MANIFEST_REQUIRED);

  const root = config.root ?? process.cwd();
  const outDir = config.outDir ?? "_hum";
  // An injected production manifest keeps the runtime off the file system
  // entirely; only the Node entry points read the build output from disk.
  const injected = config.prodManifest;
  const prodManifest = injected === undefined
    ? await readProdManifest(manifestPath(root, outDir))
    : injected;
  const dev = config.dev ?? prodManifest === null;

  const resolved = resolveConfig({
    ...config,
    dev,
    // The manifest knows the URL the build is served from, which is what keeps
    // the client asset URLs stable when the output directory is renamed.
    assetsBase: config.assetsBase ?? prodManifest?.assetsBase,
  }, manifest);
  const buildCache = new BuildCache(dev);
  await buildCache.load(manifest, prodManifest, resolved.logger);

  const { routes, notFound } = resolveRoutes(
    manifest.routes,
    resolved.routesDir,
  );
  const loader = new ModuleLoader(dev);

  // A manifest is only absent by accident: a dev run does not want one, and an
  // injected value is the caller's decision. Everything else — including the
  // inferred dev mode of a run that never asked for it — is reported instead of
  // silently serving source URLs that no production build can answer.
  if (prodManifest === null && injected === undefined && config.dev !== true) {
    resolved.logger.error(
      `hum: no build manifest found at ${manifestPath(root, outDir)}. ` +
        `Client islands and styles cannot be served; run the production ` +
        `build, point \`outDir\` at the deployed output directory, or inject ` +
        `\`prodManifest\` when the platform has no file system.`,
    );
  }

  const internals: HumInternals = {
    config: resolved,
    manifest,
    prodManifest,
    buildCache,
    loader,
    routes,
    notFound,
    async refresh() {
      if (!resolved.dev) return;
      await buildCache.load(manifest, prodManifest, resolved.logger);
    },
  };

  // Hono's variadic `HandlerInterface` overloads cannot be satisfied by a
  // dynamically built middleware chain, so registration goes through a
  // narrow, explicitly typed funnel. The handlers themselves stay typed.
  const register = app.all.bind(app) as unknown as (
    path: string,
    ...handlers: MiddlewareHandler[]
  ) => unknown;

  for (const route of routes) {
    const chain = routeHandler(route, internals, notFound);
    for (const pattern of route.honoPatterns) {
      register(pattern, chain);
    }
  }

  app.notFound(async (c) => {
    const url = new URL(c.req.url);
    const context = c as HumContext;
    const found = findNotFound(notFound, url.pathname);
    const dir = found === undefined
      ? ""
      : dirOf(found.file.file, resolved.routesDir);

    const route = unmatchedRoute(
      manifest.routes,
      resolved.routesDir,
      dir,
      url.pathname,
    );
    const input: RouteRenderInput = {
      config: resolved,
      buildCache,
      loader,
      route,
      url,
      params: {},
      state: c.var as Record<string, unknown>,
      notFound,
    };

    try {
      await internals.refresh();
      // The middleware of the directory the `_404` page belongs to wraps the
      // render too, so a branch guard also covers unmatched paths under it.
      const middleware = await loadMiddleware(route, internals);
      const terminal = async (): Promise<Response> =>
        htmlResponse(context, await renderNotFound(input, url.pathname));
      return await runRouteMiddleware(middleware, context, terminal);
    } catch (err) {
      return htmlResponse(context, await renderError(input, err));
    }
  });

  return Object.assign(app, { hum: internals });
}

/** Creates a standalone Hono app with Hum mounted on it. */
export async function createApp(config: HumConfig): Promise<HumApp> {
  const app = new Hono<{ Variables: HumVariables }>();
  return await mountHum(app, config);
}

function routeHandler(
  route: ResolvedRoute,
  internals: HumInternals,
  notFound: ResolvedNotFound[],
): MiddlewareHandler {
  return async (c) => {
    const url = new URL(c.req.url);
    const method = c.req.method.toUpperCase();
    const params = c.req.param() as Record<string, string>;
    const context = c as HumContext;
    context.set("humRoute", route);
    const input: RouteRenderInput = {
      config: internals.config,
      buildCache: internals.buildCache,
      loader: internals.loader,
      route,
      url,
      params,
      state: c.var as Record<string, unknown>,
      notFound,
    };

    try {
      await internals.refresh();
      const mod = (await internals.loader.load(route.file)) as RouteModule;
      const routeMiddleware = await loadMiddleware(route, internals);
      const terminal = async (): Promise<Response> => {
        const handler = pickHandler(mod.handlers, method);
        if (handler !== undefined) {
          const requestContext: RequestContext = {
            page: async (data?: unknown, options?: PageRenderOptions) =>
              htmlResponse(context, await renderRoute(input, data, options)),
          };

          const res = await runWithRequestContext(
            requestContext,
            () => handler(context),
          );
          if (res instanceof Response) return res;
        } else if (
          mod.handlers !== undefined && method !== "GET" && method !== "HEAD"
        ) {
          return context.text("Method Not Allowed", 405);
        }

        return htmlResponse(context, await renderRoute(input));
      };

      return await runRouteMiddleware(routeMiddleware, context, terminal);
    } catch (err) {
      if (route.error === undefined) {
        internals.config.logger.error(
          `hum: unhandled error while handling ${context.req.method} ${url.pathname}`,
          err,
        );
      }
      return htmlResponse(context, await renderError(input, err));
    }
  };
}

/**
 * Hum does not look for routes and islands by itself: only a bundler can turn a
 * project's files into modules — resolving imports, transforming JSX, splitting
 * chunks — so the manifest is its product, and the runtime never reads the file
 * system behind its back to reconstruct one.
 */
const MANIFEST_REQUIRED =
  "hum: `manifest` is required. The Vite plugin supplies the one that " +
  "`virtual:hum/routes` resolves; when mounting Hum yourself, build it with " +
  "`specsFromGlob` from `@humjs/core/routing`.";
