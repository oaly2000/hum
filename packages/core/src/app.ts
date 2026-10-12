import { pathToFileURL } from "node:url";
import { Hono, type Env, type MiddlewareHandler, type Schema } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  BuildCache,
  manifestPath,
  readProdManifest,
  type ProdManifest,
} from "./build_cache.js";
import {
  defaultLogger,
  resolveConfig,
  type HumConfig,
  type ResolvedConfig,
} from "./config.js";
import { crawlProject } from "./discovery/fs_crawl.js";
import { ModuleLoader } from "./loader.js";
import { runWithRequestContext, type RequestContext } from "./request_context.js";
import {
  findNotFound,
  renderError,
  renderNotFound,
  renderRoute,
  type RenderOutcome,
  type RouteRenderInput,
} from "./render.js";
import {
  dirOf,
  resolveRoutes,
  unmatchedRoute,
  type ResolvedNotFound,
  type ResolvedRoute,
} from "./routing/fs_routes.js";
import { staticAssetHandler } from "./static.js";
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
  Hono<E, S, P> & { hum: HumInternals };

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
  return c.html(outcome.html, outcome.status as ContentfulStatusCode);
}

function pickHandler(
  handlers: RouteModule["handlers"],
  method: string,
): ((c: HumContext) => Response | Promise<Response> | void | Promise<void>) |
  undefined {
  if (handlers === undefined) return undefined;
  if (method === "HEAD" && handlers.HEAD === undefined) {
    return handlers.GET;
  }
  const byMethod = handlers as unknown as Record<
    string,
    ((c: HumContext) => Response | Promise<Response> | void | Promise<void>) |
      undefined
  >;
  return byMethod[method];
}

/**
 * Runs the middleware a route module exports. Mirrors Hono's semantics:
 * returning a `Response` short circuits, and a middleware that never calls
 * `next()` continues the chain so that simple middlewares stay ergonomic.
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

function middlewareArray(
  middleware: HumMiddleware | HumMiddleware[] | undefined,
): HumMiddleware[] {
  if (middleware === undefined) return [];
  return Array.isArray(middleware) ? middleware : [middleware];
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
  const manifest: HumManifest = config.manifest ?? await crawlToManifest(config);

  const root = config.root ?? process.cwd();
  const outDir = config.outDir ?? "_hum";
  const prodManifest = await readProdManifest(manifestPath(root, outDir));
  const dev = config.dev ?? prodManifest === null;

  const resolved = resolveConfig({ ...config, dev }, manifest);
  const buildCache = new BuildCache(dev);
  await buildCache.load(manifest, prodManifest, resolved.logger);

  const { routes, notFound } = resolveRoutes(
    manifest.routes,
    resolved.routesDir,
  );
  const loader = new ModuleLoader(dev);

  // Serve the production build output. In dev Vite handles these requests
  // before the Hum handler, so this branch stays inert.
  app.use(`/${outDir}/*`, staticAssetHandler(resolved));

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
    const found = findNotFound(notFound, url.pathname);
    const dir = found === undefined
      ? ""
      : dirOf(found.file.file, resolved.routesDir);

    const input: RouteRenderInput = {
      config: resolved,
      buildCache,
      loader,
      route: unmatchedRoute(manifest.routes, resolved.routesDir, dir, url.pathname),
      url,
      params: {},
      state: c.var as Record<string, unknown>,
      notFound,
    };

    try {
      await internals.refresh();
      return htmlResponse(
        c as HumContext,
        await renderNotFound(input, url.pathname),
      );
    } catch (err) {
      return htmlResponse(
        c as HumContext,
        await renderError(input, err),
      );
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
      const routeMiddleware: HumMiddleware[] = [];
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
        routeMiddleware.push(middleware);
      }

      routeMiddleware.push(...middlewareArray(mod.middleware));
      const terminal = async (): Promise<Response> => {
        const handler = pickHandler(mod.handlers, method);
        if (handler !== undefined) {
          const requestContext: RequestContext = {
            page: async (options?: PageRenderOptions) =>
              htmlResponse(context, await renderRoute(input, options)),
          };

          const res = await runWithRequestContext(requestContext, () =>
            handler(context));
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

/** Fallback discovery used when the bundler did not supply a manifest. */
async function crawlToManifest(config: HumConfig): Promise<HumManifest> {
  const root = config.root ?? process.cwd();
  const crawled = await crawlProject({
    root,
    routesDir: config.routesDir,
    islandsDir: config.islandsDir,
    logger: config.logger,
  });

  return {
    routes: crawled.routes.map((spec) => ({
      ...spec,
      // The path is only known at runtime; Vite must not try to resolve it.
      load: () => import(/* @vite-ignore */ pathToFileURL(spec.absPath).href) as Promise<
        Record<string, unknown>
      >,
    })),
    islands: crawled.islands.map((spec) => ({
      ...spec,
      // The path is only known at runtime; Vite must not try to resolve it.
      load: () => import(/* @vite-ignore */ pathToFileURL(spec.absPath).href) as Promise<
        Record<string, unknown>
      >,
    })),
  };
}
