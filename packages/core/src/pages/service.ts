import type { HumApp, HumInternals } from "../server/app.js";
import type { ResolvedRoute } from "../routing/fs_routes.js";
import { PARTIAL_SEARCH_PARAM } from "../protocol/markers.js";
import type { HumContext, PageRenderMode } from "../types.js";
import { canonicalPath, pagePaths } from "./policy.js";
import { planPages } from "./prerender.js";
import { createMemoryPageStore } from "./store.js";
import type { GeneratedPage, PageStore, PageServiceOptions } from "./types.js";

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
