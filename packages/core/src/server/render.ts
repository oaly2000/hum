import { Fragment, h, type VNode } from "preact";

import type { BuildCache } from "./build_cache.js";
import type { ResolvedConfig } from "./config.js";
import type { ResolvedNotFound, ResolvedRoute } from "../routing/fs_routes.js";
import { HttpError } from "./error.js";
import type { ModuleLoader } from "./loader.js";
import type { AnyVNode } from "../shared/preact.js";
import {
  DefaultApp,
  preloadLinks,
  renderDocument,
  renderDocumentStream,
} from "./document.js";
import { mergeHeads } from "./head.js";
import { RenderState, withRenderState } from "./preact_hooks.js";
import type {
  AppModule,
  HeadExport,
  LayoutModule,
  PageRenderOptions,
  RouteManifestEntry,
  RouteModule,
  RouteProps,
} from "../types.js";

export interface RenderOutcome {
  /** Full document plus inert partial metadata, captured from the same render. */
  partialBody?: string;
  body: string | ReadableStream<Uint8Array>;
  links: string[];
  status: number;
}

export interface RouteRenderInput<
  T extends RouteManifestEntry = RouteManifestEntry,
> {
  capturePage?: boolean;
  config: ResolvedConfig;
  buildCache: BuildCache;
  loader: ModuleLoader;
  route: ResolvedRoute<T>;
  url: URL;
  params: Record<string, string>;
  state: Record<string, unknown>;
  notFound: ResolvedNotFound<T>[];
}

function routeProps(
  input: RouteRenderInput,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    params: input.params,
    url: input.url,
    state: input.state,
    route: input.route.file,
    ...extra,
  };
}

/**
 * Runs a page component through the layout / app chain and renders the final
 * document. Head tags are collected from the `head` exports of the app shell,
 * the layouts and the page, merged, and rendered into the document `<head>`.
 */
async function renderTree(
  input: RouteRenderInput,
  page: AnyVNode | null,
  pageModule: RouteModule | null,
  props: Record<string, unknown>,
  status: number,
): Promise<RenderOutcome> {
  const { config, loader, route, buildCache } = input;

  const skipInheritedLayouts =
    pageModule?.config?.skipInheritedLayouts === true;
  const skipAppWrapper = pageModule?.config?.skipAppWrapper ?? false;

  let appModule: AppModule | undefined;
  if (!skipAppWrapper && route.app !== undefined) {
    appModule = (await loader.load(route.app)) as AppModule;
  }

  const layoutModules: LayoutModule[] = [];
  if (!skipInheritedLayouts) {
    for (const spec of route.layouts) {
      const mod = (await loader.load(spec)) as LayoutModule;
      if (mod.default !== undefined) layoutModules.push(mod);
    }
  }

  // Head exports are merged from the outside in, so a page can override what
  // its layouts and its app shell contributed.
  const headChain: Array<{ head?: HeadExport }> = [];
  if (appModule !== undefined) headChain.push(appModule);
  headChain.push(...layoutModules);
  if (pageModule !== null) headChain.push(pageModule);

  let children: VNode = h(Fragment, null, page);
  for (let i = layoutModules.length - 1; i >= 0; i--) {
    children = h(layoutModules[i].default as never, props, children);
  }

  const root: VNode = appModule?.default === undefined
    ? h(DefaultApp, null, children)
    : h(appModule.default as never, props, children);

  const renderState = new RenderState({
    url: input.url,
    buildCache,
    basePath: config.basePath,
  });
  renderState.headNodes = mergeHeads(headChain, props as unknown as RouteProps);

  return await withRenderState(renderState, () => {
    if (pageModule?.config?.streaming === true) {
      const stream = renderDocumentStream(root);
      return {
        body: stream,
        links: preloadLinks(renderState),
        status,
      };
    }

    try {
      const document = input.capturePage
        ? renderDocument(root, true)
        : { body: renderDocument(root) };
      return { ...document, links: preloadLinks(renderState), status };
    } finally {
      renderState.clear();
    }
  });
}

/**
 * Renders a matched route with optional handler data and response options.
 */
export async function renderRoute(
  input: RouteRenderInput,
  data?: unknown,
  options: PageRenderOptions = {},
): Promise<RenderOutcome> {
  const mod = (await input.loader.load(input.route.file)) as RouteModule;

  if (mod.default === undefined) {
    throw new Error(
      `Hum: route "${input.route.file}" has no default export. Add a ` +
        `component, or export a "handlers" object to answer the request.`,
    );
  }

  const props = { ...routeProps(input), data };
  return await renderTree(
    input,
    h(mod.default as never, props),
    mod,
    props,
    options.status ?? 200,
  );
}

function errorStatus(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  if (
    error !== null && typeof error === "object" && "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return 500;
}

function DefaultErrorContent(props: Record<string, unknown>): AnyVNode {
  const error = props.error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const dev = props.dev === true;
  return h(
    "div",
    { style: "font-family: system-ui; padding: 2rem; max-width: 48rem" },
    h("h1", { style: "font-size:1.5rem" }, "Internal Server Error"),
    dev ? h("pre", { style: "white-space:pre-wrap" }, message) : null,
    dev && error instanceof Error && error.stack
      ? h(
        "pre",
        { style: "white-space:pre-wrap; font-size:0.75rem; opacity:0.7" },
        error.stack,
      )
      : null,
  );
}

/** Renders the nearest `_error` page for a failed request. */
export async function renderError(
  input: RouteRenderInput,
  error: unknown,
): Promise<RenderOutcome> {
  const status = errorStatus(error);
  const props = routeProps(input, {
    error,
    status,
    dev: input.config.dev,
  });

  let page: VNode;
  let pageModule: RouteModule | null = null;

  if (input.route.error !== undefined) {
    try {
      const mod = (await input.loader.load(input.route.error)) as RouteModule;
      pageModule = mod;
      page = mod.default === undefined
        ? h(DefaultErrorContent as never, props)
        : h(mod.default as never, props);
    } catch (loadErr) {
      input.config.logger.error(
        "hum: failed to load the _error page:",
        loadErr,
      );
      page = h(DefaultErrorContent as never, props);
    }
  } else {
    page = h(DefaultErrorContent as never, props);
  }

  return await renderTree(input, page, pageModule, props, status);
}

function DefaultNotFoundContent(): AnyVNode {
  return h(
    "div",
    { style: "font-family: system-ui; padding: 2rem" },
    h("h1", { style: "font-size:1.5rem" }, "404 - Not Found"),
  );
}

/** Finds the deepest `_404` page that applies to `pathname`. */
export function findNotFound(
  notFound: ResolvedNotFound[],
  pathname: string,
): ResolvedNotFound | undefined {
  for (const entry of notFound) {
    if (entry.matchers.some((m) => m.test(pathname))) return entry;
  }
  return undefined;
}

/** Renders the 404 page for an unmatched request. */
export async function renderNotFound(
  input: RouteRenderInput,
  pathname: string,
): Promise<RenderOutcome> {
  const found = findNotFound(input.notFound, pathname);
  const props = routeProps(input, { status: 404 });

  let page: VNode = h(DefaultNotFoundContent as never, props);
  let pageModule: RouteModule | null = null;

  if (found !== undefined) {
    try {
      const mod = (await input.loader.load(found.file)) as RouteModule;
      pageModule = mod;
      if (mod.default !== undefined) page = h(mod.default as never, props);
    } catch (err) {
      input.config.logger.error("hum: failed to load the _404 page:", err);
    }
  }

  return await renderTree(input, page, pageModule, props, 404);
}
