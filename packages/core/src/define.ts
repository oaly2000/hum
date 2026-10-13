import type { ComponentType } from "preact";

import type {
  AppModule,
  ErrorModule,
  Handlers,
  HeadExport,
  HumMiddleware,
  LayoutModule,
  PageViewProps,
  RouteConfig,
  RouteModule,
  RouteProps,
} from "./types.js";

/**
 * Type helpers for route modules. They add no runtime behaviour, they only
 * make the exports of a route file type checked:
 *
 * ```ts
 * import { define, page } from "@humjs/core";
 *
 * export const handlers = define.handlers({
 *   GET: async (c) => page({ post: await load(c.req.param("id")) }),
 *   POST: async (c) => c.redirect("/thanks"),
 * });
 *
 * export default define.page<{ post: Post }>(({ data }) => (
 *   <h1>{data.post.title}</h1>
 * ));
 * ```
 *
 * `define.page<Data>()` types a route's view. The handler passes business data
 * with `page(data)`, and the view receives it under `data`.
 *
 * Use `define.head()` for static or route-aware head content, and
 * `define.config()` for route rendering options:
 *
 * ```ts
 * export const head = define.head(({ params }) => <title>Post {params.id}</title>);
 * export const config = define.config({ skipInheritedLayouts: true });
 * ```
 */
export interface Define<State = Record<string, unknown>> {
  route(module: RouteModule<State>): RouteModule<State>;
  head(head: HeadExport<State>): HeadExport<State>;
  config(config: RouteConfig): RouteConfig;
  page<Data>(
    component: ComponentType<RouteProps<State> & PageViewProps<Data>>,
  ): ComponentType<RouteProps<State> & PageViewProps<Data>>;
  app(module: AppModule<State>): AppModule<State>;
  layout(module: LayoutModule<State>): LayoutModule<State>;
  error(module: ErrorModule<State>): ErrorModule<State>;
  handlers(handlers: Handlers): Handlers;
  middleware(
    middleware: HumMiddleware | HumMiddleware[],
  ): HumMiddleware | HumMiddleware[];
}

export function createDefine<State = Record<string, unknown>>(): Define<State> {
  return {
    route: (module) => module,
    head: (head) => head,
    config: (config) => config,
    page: (component) => component,
    app: (module) => module,
    layout: (module) => module,
    error: (module) => module,
    handlers: (handlers) => handlers,
    middleware: (middleware) => middleware,
  };
}

export const define: Define<Record<string, unknown>> = createDefine();
