/**
 * Hum — islands, the Hono way.
 *
 * Public entry point: application factory, route module types and the shared
 * runtime component (`Partial`). Head tags are contributed per route file
 * through its `head` export, not through a component.
 */

export { createApp, mountHum } from "./app.js";
export type {
  HumApp,
  HumInternals,
  HumVariables,
  MountedHumApp,
} from "./app.js";

export { HttpError, RouteLoadError } from "./error.js";

export { createDefine, define } from "./define.js";
export type { Define } from "./define.js";

export {
  defaultLogger,
  resolveConfig,
  type HumConfig,
  type ResolvedConfig,
} from "./config.js";

export type {
  AppModule,
  ErrorModule,
  Handlers,
  HeadExport,
  HumContext,
  HumHandler,
  HumManifest,
  HumMiddleware,
  Island,
  IslandSpec,
  LayoutModule,
  Logger,
  ModuleThunk,
  PageFn,
  PageRenderOptions,
  PageViewProps,
  RouteConfig,
  RouteFileSpec,
  RouteKind,
  RouteModule,
  RouteProps,
} from "./types.js";

export { asset, IS_BROWSER, Partial, type PartialProps } from "./runtime/shared.js";

export { page } from "./request_context.js";

export {
  BuildCache,
  manifestPath,
  readProdManifest,
  type ProdManifest,
} from "./build_cache.js";
