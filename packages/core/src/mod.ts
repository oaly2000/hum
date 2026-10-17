/**
 * Hum — islands, the Hono way.
 *
 * Server/framework entry point: application factory, route module types and
 * request helpers. Browser-safe helpers and components are exported separately
 * from `@humjs/core/shared`.
 */

export { createApp, mountHum } from "./app.js";
export {
  createMemoryPageStore,
  createPageService,
  planPages,
  prerenderPages,
} from "./pages.js";
export type {
  GeneratedPage,
  PageService,
  PageServiceOptions,
  PageStore,
  PlannedPage,
} from "./pages.js";
export type {
  HumApp,
  HumInternals,
  HumVariables,
  MountedHumApp,
} from "./app.js";

export { defineBuild } from "./build.js";
export type { HumBuild, ProdIslandEntry, ProdManifest } from "./build.js";

export { HttpError, RouteLoadError } from "./error.js";

export { createDefine, define } from "./define.js";
export type { Define } from "./define.js";

export {
  ASSETS_BASE,
  defaultLogger,
  type HumConfig,
  resolveConfig,
  type ResolvedConfig,
  RUNTIME_URL,
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
  PageRenderMode,
  PageViewProps,
  RouteConfig,
  RouteFileSpec,
  RouteKind,
  RouteModule,
  RouteProps,
} from "./types.js";

export {
  getResource,
  page,
  registerResource,
} from "./request_context.js";
export {
  createResource,
  createResourceKey,
  type ResourceKey,
  type Resource,
  Suspense,
  type SuspenseProps,
} from "./resource.js";

export { BuildCache } from "./build_cache.js";
