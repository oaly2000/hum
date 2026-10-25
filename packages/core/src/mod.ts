/**
 * Hum — islands, the Hono way.
 *
 * Server/framework entry point: application factory, route module types and
 * request helpers. Browser-safe helpers and components are exported separately
 * from `@humjs/core/client`.
 */

export { createApp, mountHum } from "./server/app.js";
export { createMemoryPageStore } from "./pages/store.js";
export { createPageService } from "./pages/service.js";
export type { GeneratedPage, PageServiceOptions, PageStore } from "./pages/types.js";
export type { PageService } from "./pages/service.js";
export type { HumApp, HumInternals, HumVariables, MountedHumApp } from "./server/app.js";

export { HttpError, RouteLoadError } from "./server/error.js";

export { createDefine, define } from "./define.js";
export type { Define } from "./define.js";

export type { HumConfig, ResolvedConfig } from "./server/config.js";

export type {
  AppModule,
  ErrorModule,
  Handlers,
  HeadExport,
  HumContext,
  HumHandler,
  HumMiddleware,
  Island,
  LayoutModule,
  Logger,
  PageFn,
  PageRenderOptions,
  PageRenderMode,
  PageViewProps,
  RouteConfig,
  RouteModule,
  RouteProps,
} from "./types.js";

export { getResource, page, registerResource } from "./server/request_context.js";
export {
  createResource,
  createResourceKey,
  type ResourceKey,
  type Resource,
  Suspense,
  type SuspenseProps,
} from "./server/resource.js";
