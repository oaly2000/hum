import type { HumApp, HumInternals } from "./app.js";
import type { HumBuild } from "./build.js";
import type { HumConfig } from "./config.js";
import { ModuleLoader } from "./loader.js";
import { resolveRoutes, type ResolvedRoute } from "./routing/fs_routes.js";
import { compileMatcher } from "./routing/path_to_pattern.js";
import { PARTIAL_SEARCH_PARAM } from "./runtime/shared_internal.js";
import type {
  HumContext,
  PageRenderMode,
  RouteConfig,
  RouteModule,
} from "./types.js";

/** Both representations belong to one render and one shared payload graph. */
export interface GeneratedPage {
  route: string;
  body: string;
  partialBody: string;
  headers: [string, string][];
  generatedAt: number;
}

/** set must publish the complete value atomically. Keys include the build ID. */
export interface PageStore {
  get(key: string): GeneratedPage | undefined | Promise<GeneratedPage | undefined>;
  set(key: string, page: GeneratedPage): void | Promise<void>;
}

export function createMemoryPageStore(): PageStore {
  const entries = new Map<string, GeneratedPage>();
  return {
    get: (key) => entries.get(key),
    set: (key, page) => { entries.set(key, page); },
  };
}

export interface PageServiceOptions {
  store?: PageStore;
  /** e.g. (task, c) => c.executionCtx.waitUntil(task). Without it updates block. */
  background?: (task: Promise<void>, context: HumContext) => void;
  /** Clock for expiry; defaults to Date.now. */
  now?: () => number;
}

export interface PlannedPage {
  path: string;
  route: string;
}

class PagePlanError extends TypeError {}

function fail(route: ResolvedRoute, message: string): never {
  throw new PagePlanError(`hum: ${route.file.file}: ${message}`);
}

/** Validate JavaScript consumers too, before a bad policy can reach a cache. */
export function pagePolicy(
  route: ResolvedRoute,
  config?: RouteConfig,
): PageRenderMode {
  const policy = config?.render ?? { mode: "ssr" };
  if (!["ssr", "ssg", "isg"].includes(policy.mode)) fail(route, "unknown render mode");
  if (policy.mode === "ssr") return policy;
  if (config?.streaming) fail(route, "streaming is only supported with SSR");
  if (policy.slugs !== undefined &&
    (!Array.isArray(policy.slugs) || policy.slugs.some((slug) => typeof slug !== "string"))) {
    fail(route, "slugs must be a string array");
  }
  if (policy.mode === "ssg" && route.params.length > 0 && policy.slugs === undefined) {
    fail(route, "dynamic SSG routes require slugs (use [] to generate no pages)");
  }
  if (policy.mode === "isg") {
    if (!Number.isFinite(policy.revalidate) || policy.revalidate <= 0) {
      fail(route, "ISG revalidate must be a positive number of seconds");
    }
    if (policy.fallback !== undefined && policy.fallback !== false && policy.fallback !== "blocking") {
      fail(route, "ISG fallback must be false or 'blocking'");
    }
  }
  return policy;
}

function canonicalPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\\u0000-\u0020]/.test(path)) {
    throw new TypeError(`invalid page path ${JSON.stringify(path)}`);
  }
  // Reject traversal and encoded separators before URL normalization can hide them.
  for (const segment of path.split("/")) {
    const decoded = decodeURIComponent(segment);
    if (decoded === "." || decoded === ".." || /[/\\]/.test(decoded)) {
      throw new TypeError(`invalid page path ${JSON.stringify(path)}`);
    }
  }
  const pathname = new URL(path, "http://hum.local").pathname;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

export function pagePaths(route: ResolvedRoute, policy: PageRenderMode): string[] {
  if (policy.mode === "ssr") return [];
  const slugs = policy.slugs ?? (route.params.length === 0
    ? ["/" + route.pattern.segments.map((segment) => segment.raw).join("/")]
    : []);
  const paths = new Set<string>();
  for (const slug of slugs) {
    try {
      let path = slug;
      if (!slug.startsWith("/")) {
        if (route.params.length !== 1) fail(route, "use absolute paths in slugs for multiple parameters");
        path = "/" + route.pattern.segments.map((segment) => {
          if (segment.kind === "optional" && slug === "") return "";
          return segment.raw.replace(/\[\[\w+\]\]|\[\.\.\.\w+\]|\[\w+\]/g, () => slug);
        }).filter(Boolean).join("/");
      }
      path = canonicalPath(path);
      if (!compileMatcher(route.pattern).test(decodeURI(path))) {
        fail(route, `slug ${JSON.stringify(slug)} does not match the route`);
      }
      if (paths.has(path)) fail(route, `duplicate generated path ${path}`);
      paths.add(path);
    } catch (error) {
      if (error instanceof PagePlanError) throw error;
      fail(route, error instanceof Error ? error.message : String(error));
    }
  }
  return [...paths];
}

/** Bundler discovery remains the sole source of routes. No file system access. */
export async function planPages(
  build: HumBuild,
  config: Pick<HumConfig, "routesDir"> = {},
): Promise<PlannedPage[]> {
  const { routes } = resolveRoutes(build.routes, config.routesDir ?? "routes");
  const loader = new ModuleLoader(false);
  const result: PlannedPage[] = [];
  const owners = new Map<string, string>();
  for (const route of routes) {
    const mod = await loader.load(route.file) as RouteModule;
    const policy = pagePolicy(route, mod.config);
    for (const path of pagePaths(route, policy)) {
      if (owners.has(path)) fail(route, `generated path ${path} is already owned by ${owners.get(path)}`);
      // Hono registration order must agree with the owner of each output URL.
      const owner = routes.find((candidate) => compileMatcher(candidate.pattern).test(decodeURI(path)));
      if (owner !== route) fail(route, `generated path ${path} is shadowed by ${owner?.file.file}`);
      owners.set(path, route.file.file);
      result.push({ path, route: route.file.file });
    }
  }
  return result;
}

interface Generation {
  route?: string;
  partialBody?: string;
  response?: Response;
}

type PageFetch = (
  request: Request,
  env?: object,
  executionCtx?: Parameters<HumApp["fetch"]>[2],
) => Response | Promise<Response>;

export class PageService {
  readonly #store: PageStore;
  readonly #now: () => number;
  readonly #background?: PageServiceOptions["background"];
  readonly #generating = new WeakMap<Request, Generation>();
  readonly #pending = new Map<string, Promise<GeneratedPage>>();
  #runtime?: HumInternals;
  #fetch?: PageFetch;

  constructor(options: PageServiceOptions = {}) {
    this.#store = options.store ?? createMemoryPageStore();
    this.#now = options.now ?? Date.now;
    this.#background = options.background;
  }

  /** @internal One service belongs to one mounted app. */
  attach(runtime: HumInternals, fetch: PageFetch): void {
    if (this.#runtime !== undefined) {
      throw new TypeError("hum: a page service can only be mounted once");
    }
    this.#runtime = runtime;
    this.#fetch = fetch;
  }

  /** @internal Generation requests pass through Hono with a fresh context. */
  generation(request: Request): Generation | undefined {
    return this.#generating.get(request);
  }

  #key(path: string): string {
    return JSON.stringify([this.#runtime!.build.prod?.buildId ?? "source", path]);
  }

  async #generate(
    path: string,
    route: string,
    context?: HumContext,
  ): Promise<GeneratedPage> {
    const key = this.#key(path);
    const pending = this.#pending.get(key);
    if (pending) return pending;
    const task = (async () => {
      const runtime = this.#runtime!;
      // Static pages are public: never copy credentials, cookies, query params
      // or other request headers into a shared generation.
      const request = new Request(new URL(path, runtime.build.origin ?? "http://localhost"));
      const generation: Generation = {};
      this.#generating.set(request, generation);
      try {
        let executionCtx: Parameters<HumApp["fetch"]>[2];
        // Hono's getter throws when the adapter has no execution context.
        try {
          executionCtx = context?.executionCtx;
        } catch {
          executionCtx = undefined;
        }
        const response = await this.#fetch!(request, context?.env, executionCtx);
        const cacheControl = response.headers.get("cache-control") ?? "";
        if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/html") ||
          response.headers.has("set-cookie") || response.headers.has("vary") ||
          response.headers.has("content-encoding") || /\b(private|no-store|no-cache)\b/i.test(cacheControl)) {
          throw new Error(`hum: cannot generate public page ${path}: expected cacheable HTML with status 200`);
        }
        if (generation.route !== route || generation.partialBody === undefined || !generation.response) {
          throw new Error(`hum: ${path} did not render the expected page ${route}`);
        }
        // Cache at the page boundary. Outer Hono middleware must transform the
        // body and add request-specific headers once on every real request.
        const rendered = generation.response;
        const [body] = await Promise.all([rendered.text(), response.arrayBuffer()]);
        const page: GeneratedPage = {
          route,
          body,
          partialBody: generation.partialBody,
          headers: [...rendered.headers].filter(([name]) =>
            !["content-length", "transfer-encoding", "date"].includes(name)),
          generatedAt: this.#now(),
        };
        await this.#store.set(key, page);
        return page;
      } finally {
        this.#generating.delete(request);
      }
    })();
    this.#pending.set(key, task);
    try {
      return await task;
    } finally {
      this.#pending.delete(key);
    }
  }

  /** Build tools call this on the app module, never on a Node listener entry. */
  async prerender(): Promise<Record<string, GeneratedPage>> {
    if (!this.#runtime || !this.#fetch) {
      throw new TypeError("hum: mount the page service before prerendering");
    }
    const plan = await planPages(this.#runtime.build, this.#runtime.config);
    const pages: Record<string, GeneratedPage> = {};
    for (const { path, route } of plan) pages[path] = await this.#generate(path, route);
    return pages;
  }

  /** @internal Called after route matching, before directory middleware. */
  async respond(
    c: HumContext,
    route: ResolvedRoute,
    policy: Exclude<PageRenderMode, { mode: "ssr" }>,
    notFound: () => Promise<Response>,
  ): Promise<Response> {
    const path = canonicalPath(new URL(c.req.url).pathname);
    const allowed = pagePaths(route, policy);
    if ((policy.mode === "ssg" || policy.fallback === false) && !allowed.includes(path)) return notFound();
    const key = this.#key(path);
    let page = await this.#store.get(key) ?? this.#runtime!.build.pages?.[path];
    if (page?.route !== route.file.file) page = undefined;
    if (!page && policy.mode === "ssg") {
      throw new Error(`hum: missing pre-generated SSG page ${path}; run the production build`);
    }
    if (!page) page = await this.#generate(path, route.file.file, c);
    else if (policy.mode === "isg" && this.#now() - page.generatedAt >= policy.revalidate * 1000) {
      const stale = page;
      const update = this.#generate(path, route.file.file, c);
      if (this.#background) {
        this.#background(update.then(() => {}, (error) => {
          this.#runtime!.config.logger.error("hum: page regeneration failed", error);
        }), c);
      } else {
        try {
          page = await update;
        } catch (error) {
          this.#runtime!.config.logger.error("hum: page regeneration failed", error);
          page = stale;
        }
      }
    }
    const partial = new URL(c.req.url).searchParams.has(PARTIAL_SEARCH_PARAM);
    return new Response(c.req.method === "HEAD" ? null : partial ? page.partialBody : page.body, {
      status: 200,
      headers: page.headers,
    });
  }
}

export function createPageService(options: PageServiceOptions = {}): PageService {
  return new PageService(options);
}

export function prerenderPages(app: { hum: HumInternals }): Promise<Record<string, GeneratedPage>> {
  return app.hum.pages.prerender();
}
