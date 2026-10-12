import type { ComponentChildren, ComponentType } from "preact";
import type { Context, Next } from "hono";

/** Hono context used by Hum request handlers and middlewares. */
export type HumContext = Context<any, any, any>;

/** Options accepted as the second argument to {@link PageFn}. */
export interface PageRenderOptions {
  /** Status of the rendered document. @default 200 */
  status?: number;
}

/** Route props supplied to a view defined with `define.page`. */
export interface PageViewProps<Data = unknown> {
  /** Business data supplied by the route handler through {@link PageFn}. */
  data: Data;
}

/**
 * Renders the page component of the current route file into a full HTML
 * `Response`, including layouts, the app shell and the merged head tags.
 * Business data is exposed separately from the framework's route props.
 */
export type PageFn = (
  data?: unknown,
  options?: PageRenderOptions,
) => Promise<Response>;

/**
 * Handles a request for one HTTP method.
 *
 * The argument is the **raw Hono `Context`** — it is never extended or mutated,
 * so every part of Hono's API (`c.req`, `c.text`, `c.redirect`, ...) stays
 * available and untouched. To render this route file's own page component, import
 * {@link page} from `@hum/core`; to answer directly, return a `Response`.
 *
 * Return a `Response` to answer the request directly. Return nothing (or with no
 * handler) to fall through to the default view.
 */
export type HumHandler = (
  c: HumContext,
) => Response | Promise<Response> | void | Promise<void>;

export interface Handlers {
  GET?: HumHandler;
  HEAD?: HumHandler;
  POST?: HumHandler;
  PUT?: HumHandler;
  PATCH?: HumHandler;
  DELETE?: HumHandler;
  OPTIONS?: HumHandler;
}

/** A Hono style middleware, `await next()` to continue the chain. */
export type HumMiddleware = (
  c: HumContext,
  next: Next,
) => Response | void | Promise<Response | void>;

/** Props every route page component receives. */
export interface RouteProps<State = Record<string, unknown>> {
  /** Matched URL parameters, e.g. `{ id: "42" }`. */
  params: Record<string, string>;
  /** The full request URL. */
  url: URL;
  /** Mutable per-request state shared with middlewares. */
  state: State;
  /**
   * Path of the route file being rendered, relative to the project root and
   * with its extension, e.g. `routes/blog/[id].tsx`.
   *
   * A request that matched no route file renders against a synthetic entry, so
   * a 404 page sees `routes/_404` instead — no extension, and no such file on
   * disk. Error pages keep the path of the route that failed, which is what
   * makes this usable from `_error.tsx`.
   */
  route: string;
  /** Present when rendering an error page. */
  error?: unknown;
  /** Status code that is being rendered (error/404 pages). */
  status?: number;
}

export interface RouteConfig {
  /** Render the page without the `_app` wrapper. */
  skipAppWrapper?: boolean;
  /** Render the page without inherited `_layout` components. */
  skipInheritedLayouts?: boolean;
  /**
   * Opt into experimental streaming SSR with `preact/compat` Suspense.
   * Streamed rendering has different error and response-header guarantees.
   */
  streaming?: boolean;
}

/**
 * A `head` export of a route file. Either a fixed JSX fragment
 * (`<title>…</title>`) or a function receiving the route props, which can use
 * `params`, `url` and `state` to build SEO tags.
 */
export type HeadExport<State = Record<string, unknown>> =
  | ComponentChildren
  | ((props: RouteProps<State>) => ComponentChildren);

/** Everything a route file (`routes/**`) can export. */
export interface RouteModule<State = Record<string, unknown>> {
  default?: ComponentType<RouteProps<State>>;
  handlers?: Handlers;
  head?: HeadExport<State>;
  config?: RouteConfig;
  middleware?: HumMiddleware | HumMiddleware[];
}

/** Everything an `_app` / `_layout` file can export. */
export interface AppModule<State = Record<string, unknown>> {
  default?: ComponentType<RouteProps<State> & { children?: ComponentChildren }>;
  head?: HeadExport<State>;
  config?: RouteConfig;
}

export type LayoutModule<State = Record<string, unknown>> = AppModule<State>;
export type ErrorModule<State = Record<string, unknown>> = AppModule<State>;

export type RouteKind =
  | "route"
  | "layout"
  | "app"
  | "middleware"
  | "error"
  | "notFound";

/** A file discovered in the routes directory, with its URL path. */
export interface RouteFileSpec {
  /** Path relative to the project root, using `/` separators. */
  file: string;
  /** Absolute path on disk. */
  absPath: string;
  kind: RouteKind;
  /**
   * URL path derived from the file path, still containing `[param]`,
   * `[...rest]`, `[[optional]]` and `(group)` syntax.
   */
  urlPath: string;
}

export interface IslandSpec {
  /** Island name as used in markers, e.g. `Counter`. */
  name: string;
  /** Named or default export to hydrate with. */
  exportName: string;
  /** Path relative to the project root, used for the client asset URL. */
  file: string;
  /** Absolute path on disk. */
  absPath: string;
}

/**
 * Lazy module loaders the bundler generates. Keeping the loading strategy in
 * the bundler layer lets Hum run the exact same code in dev (Vite module
 * runner) and in production (bundled output).
 */
export type ModuleThunk<T> = () => Promise<T>;

export interface RouteManifestEntry extends RouteFileSpec {
  load: ModuleThunk<Record<string, unknown>>;
}

export interface IslandManifestEntry extends IslandSpec {
  load: ModuleThunk<Record<string, unknown>>;
}

export interface HumManifest {
  routes: RouteManifestEntry[];
  islands: IslandManifestEntry[];
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/** Island metadata resolved against a module. */
export interface Island {
  name: string;
  exportName: string;
  /** Project root relative file path. */
  file: string;
  /** URL the client imports this island from. */
  clientUrl: string;
  /** Stylesheets this island depends on. */
  css: string[];
}
