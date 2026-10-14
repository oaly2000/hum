import { type Env, Hono, type MiddlewareHandler, type Schema } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { type HumBuild, humBuild } from "./build.js";
import { BuildCache } from "./build_cache.js";
import {
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
  /** The build this app was mounted with. */
  build: HumBuild;
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
 * Mounts Hum's file routes, 404 handling, and runtime state onto an existing
 * Hono application.
 *
 * The routes, the islands and the production assets come from the build that
 * `defineBuild` registered — the Vite plugin generates the module that does it,
 * so an app only has to import it. Application middleware registered before
 * this call also wraps Hum routes.
 *
 * An app is mounted once. Hono builds its router when the first request matches
 * on it and takes no route after that, so a runtime that re-runs the module
 * which mounts the app mounts onto an app of its own — see `ALREADY_MOUNTED`.
 */
export async function mountHum<
  E extends Env,
  S extends Schema,
  P extends string,
>(
  app: Hono<E, S, P>,
  config: HumConfig,
): Promise<MountedHumApp<E, S, P>> {
  // Re-mounting is a setup mistake, not a state to recover from: the routes the
  // second mount has to register cannot be registered. Say what the runtime
  // should do instead, because Hono's own error says nothing about the cause.
  if ((app as { hum?: unknown }).hum !== undefined) {
    throw new TypeError(ALREADY_MOUNTED);
  }

  const build = humBuild();
  const prod = build.prod;
  const dev = config.dev ?? prod === null;

  const resolved = resolveConfig({ ...config, dev });
  // The build knows the URL its client assets are published under; there is no
  // configuration that could override it, so the output directory never
  // reaches a client URL.
  const buildCache = new BuildCache(dev);
  buildCache.load(build);

  const { routes, notFound } = resolveRoutes(build.routes, resolved.routesDir);
  const loader = new ModuleLoader(dev);

  // Production assets only ever go missing by accident, and the fallback —
  // islands addressed by the path of their source file — is a development
  // configuration a deployed app cannot serve. Say so instead of shipping it.
  if (prod === null && config.dev !== true) {
    resolved.logger.error(
      `hum: the registered build carries no production assets. Client ` +
        `islands and styles cannot be served; run the production build, ` +
        `whose generated module records them, or set \`dev: true\` to run ` +
        `from source on purpose.`,
    );
  }

  const internals: HumInternals = {
    config: resolved,
    build,
    buildCache,
    loader,
    routes,
    notFound,
    async refresh() {
      if (!resolved.dev) return;
      buildCache.load(build);
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
      build.routes,
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

/**
 * Why a second mount of the same app is refused, and what to do instead.
 *
 * The case is real rather than theoretical: `@cloudflare/vite-plugin` runs a
 * project's worker entry in the runtime and re-evaluates that entry after every
 * change, while the app module it imports keeps coming from the module cache.
 * An entry that mounts the app it imported therefore mounts an app Hum already
 * mounted — and a plain mount onto the app is what broke, so the message names
 * the shape that works, which is the one Hum's dev server and the scaffold's
 * `dev-worker.ts` use.
 */
const ALREADY_MOUNTED =
  "hum: this Hono app is already mounted, and Hono takes no further route once " +
  "a request has matched on its router. Mount on an app of your own instead of " +
  "on the app you imported, so a runtime that re-runs the mounting module can " +
  "mount again: `const app = new Hono(); app.route(\"/\", userApp); " +
  "await mountHum(app, config)`.";

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
 * Hum does not look for routes, islands or client assets by itself: only a
 * bundler can turn a project's files into modules — resolving imports,
 * transforming JSX, splitting chunks — so the build the bundler produced is its
 * input, registered through `defineBuild`. The runtime never reads the file
 * system behind its back to reconstruct any of it, which is what lets a
 * platform without one run the same code.
 */
