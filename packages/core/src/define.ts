import type {
  AppModule,
  ErrorModule,
  Handlers,
  HumMiddleware,
  LayoutModule,
  RouteModule,
} from "./types.js";

/**
 * Type helpers for route modules. They add no runtime behaviour, they only
 * make the exports of a route file type checked:
 *
 * ```ts
 * import { define } from "@hum/core";
 *
 * export default define.route({
 *   default: ({ params }) => <h1>Post {params.id}</h1>,
 *   head: ({ params }) => <title>Post {params.id}</title>,
 *   handlers: {
 *     // A handler can hand what it loaded to its own view with the imported
 *     // `page` helper.
 *     GET: (c) => page({ props: { post: await load(c.req.param("id")) } }),
 *     // Returning a Response answers the request without rendering.
 *     POST: async (c) => c.redirect("/thanks"),
 *   },
 * });
 * ```
 *
 * `head` accepts both a plain JSX fragment and a function receiving the route
 * props, so a file route can also just do:
 *
 * ```ts
 * export const head = <title>Post</title>;
 * ```
 */
export interface Define<State = Record<string, unknown>> {
  route(module: RouteModule<State>): RouteModule<State>;
  app(module: AppModule<State>): AppModule<State>;
  layout(module: LayoutModule<State>): LayoutModule<State>;
  error(module: ErrorModule<State>): ErrorModule<State>;
  handlers(handlers: Handlers): Handlers;
  middleware(middleware: HumMiddleware | HumMiddleware[]): HumMiddleware | HumMiddleware[];
}

export function createDefine<State = Record<string, unknown>>(): Define<State> {
  return {
    route: (module) => module,
    app: (module) => module,
    layout: (module) => module,
    error: (module) => module,
    handlers: (handlers) => handlers,
    middleware: (middleware) => middleware,
  };
}

export const define: Define<Record<string, unknown>> = createDefine();
