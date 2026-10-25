import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  createApp,
  type HumApp,
} from "@humjs/core";
import type { HumBuild } from "@humjs/core/build";
import { serveStatic } from "@hono/node-server/serve-static";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createServerModuleRunner,
  type DevEnvironment,
  type EnvironmentModuleNode,
  type Plugin,
  type ViteDevServer,
} from "vite";

/** Evaluator of the modules of one environment. `vite` keeps the type internal. */
type ModuleRunner = ReturnType<typeof createServerModuleRunner>;

/**
 * The `ssr` environment as it is when Vite evaluates its modules here.
 *
 * `vite` keeps the type of a runnable environment internal, so the runner is
 * read off the value instead of off the type: an environment Vite runs carries
 * one, and an environment a plugin hands to a runtime of its own does not.
 */
type RunnableEnvironment = DevEnvironment & { readonly runner: ModuleRunner };

import {
  ASSETS_BASE,
  BUILD_VIRTUAL_ID,
  CORE_RUNTIME_ID,
  projectSummary,
  projectUrlPath,
  RUNTIME_URL,
} from "../shared.js";
import type { HumContext } from "../shared.js";

/**
 * Project directory whose contents are public in development and in the build.
 */
const PUBLIC_DIR = "public";

/**
 * Options of the static middleware that answers the dev requests for the
 * project's own `public/` directory: where it is, and which URLs it may answer.
 */
interface PublicFileOptions {
  root: string;
  filter: (url: string) => boolean;
}

type RequestApp = Pick<HumApp, "fetch" | "use" | "all" | "notFound" | "route">;

function isRequestApp(value: unknown): value is RequestApp {
  return value !== null && typeof value === "object" &&
    "fetch" in value && typeof value.fetch === "function" &&
    "use" in value && typeof value.use === "function" &&
    "all" in value && typeof value.all === "function" &&
    "notFound" in value && typeof value.notFound === "function" &&
    "route" in value && typeof value.route === "function";
}

/**
 * Whether this dev server renders the app itself.
 *
 * The `ssr` environment is how Hum reaches the modules an app is made of. An
 * environment Vite runs — the default one, and the one a project without a
 * platform plugin has — carries a module runner, which is what makes serving
 * pages from here possible. One without a runner belongs to a runtime of its
 * own: `@cloudflare/vite-plugin` builds a `DevEnvironment` whose runner lives
 * inside workerd, so this process cannot evaluate the app's modules at all, and
 * that runtime owns the requests.
 *
 * Hum then mounts nothing and answers only the client runtime URL. Reading this
 * off the environment rather than off a plugin's name is what keeps a platform
 * adapter from having to be known here.
 */
function rendersHere(server: ViteDevServer): boolean {
  return (server.environments.ssr as { runner?: ModuleRunner }).runner !==
    undefined;
}

/**
 * Loads the build of the running project, which registers it with the runtime.
 *
 * The virtual module owns discovery: Vite resolves its `import.meta.glob` calls
 * against the file system and invalidates the module when a route or island
 * file is added or removed, so no directory scan is needed here. Importing the
 * build module also hands Hum its input, which is what `mountHum` boots from;
 * its lazily imported modules are served through this dev server, which is what
 * keeps HMR working.
 */
async function loadBuild(runner: ModuleRunner): Promise<HumBuild> {
  const module = await runner.import(BUILD_VIRTUAL_ID) as {
    build?: HumBuild;
  };
  if (module.build === undefined) {
    throw new TypeError(
      `hum: "${BUILD_VIRTUAL_ID}" did not export a build.`,
    );
  }
  return module.build;
}

/**
 * Mounts the Hum SSR handler into the Vite dev server.
 *
 * Vite owns every request it can answer itself (island modules, assets, HMR);
 * everything else is handled by the exported user Hono app (or a
 * standalone app), whose `ModuleLoader` re-imports route modules per request —
 * unless a platform plugin runs the app in a runtime of its own, in which case
 * that runtime answers those requests and this half only keeps them moving.
 */
export function humDevServer(ctx: HumContext): Plugin {
  let app: Promise<RequestApp> | null = null;
  let publicFiles: PublicFileOptions | null = null;
  // One runner for the whole session: it holds the evaluated modules, and it is
  // where HMR invalidates them.
  let runner: ModuleRunner | null = null;

  /**
   * Runner that evaluates the app's modules here. Only reached in an
   * environment that has one: `server.ssrLoadModule` is a deprecated
   * compatibility shim, it throws for an environment Vite does not run, and the
   * environment's own runner is what Vite itself uses in its place.
   */
  function ssrRunner(server: ViteDevServer): ModuleRunner {
    return (runner ??= (server.environments.ssr as RunnableEnvironment).runner);
  }

  async function buildApp(server: ViteDevServer): Promise<RequestApp> {
    // Route discovery changes require a fresh app, never another mount on a
    // Hono instance that has already handled requests.
    const moduleRunner = ssrRunner(server);
    const entryFile = resolve(ctx.options.root, ctx.options.devEntry)
      .replace(/\\/g, "/");
    const entryModules = moduleRunner.evaluatedModules.getModulesByFile(entryFile);
    for (const mod of entryModules ?? []) {
      moduleRunner.evaluatedModules.invalidateModule(mod);
    }
    // Importing the build module registers it for entry-less applications.
    const build = await loadBuild(ssrRunner(server));
    if (ctx.options.verbose) {
      server.config.logger.info(projectSummary({
        routes: build.routes.length,
        islands: build.islands.length,
      }));
    }

    const humConfig = {
      root: ctx.options.root,
      routesDir: ctx.options.routesDir,
      outDir: ctx.options.outDir,
      basePath: ctx.options.basePath,
      dev: true,
    };

    // A project's own `public/` directory is served during development, the way
    // the build copies it into the output directory's public tree. Mounted with
    // Hono rather than on the Vite middleware stack, so it inherits the same
    // request handling as the rest of the app.
    const publicDir = resolve(ctx.options.root, PUBLIC_DIR);
    if (existsSync(publicDir)) {
      publicFiles = {
        root: publicDir,
        // A built project publishes its client assets under `/_hum` itself, so
        // `public/` must not shadow them.
        filter: (path) => !path.startsWith(`${ASSETS_BASE}/`),
      };
    } else {
      publicFiles = null;
    }

    const serverEntry = resolve(ctx.options.root, ctx.options.devEntry);
    if (!existsSync(serverEntry)) {
      return withPublicFiles(await createApp(humConfig));
    }

    const serverModule = await ssrRunner(server).import(
      projectUrlPath(ctx.options.root, serverEntry),
    ) as { default?: unknown };
    if (!isRequestApp(serverModule.default)) {
      throw new TypeError(
        `hum: "${serverEntry}" must default-export a Hono app.`,
      );
    }

    return withPublicFiles(serverModule.default);
  }

  /**
   * Registers the `public/` middleware ahead of everything the app answers, so
   * a public file is served exactly as it would be from the build's public
   * directory — URL unchanged, and ahead of the routes.
   */
  function withPublicFiles(instance: RequestApp): RequestApp {
    if (publicFiles !== null) {
      instance.use("*", serveStatic(publicFiles));
    }
    return instance;
  }

  return {
    name: "hum:dev-server",
    apply: "serve",
    // Both middlewares below have to be in place before the ones other plugins
    // register: the client runtime URL must not be answerable by a runtime that
    // answers pages, and the app Hum serves itself only runs when nothing else
    // does. Vite applies the middleware halves in plugin order, so being a `pre`
    // plugin is what keeps that true whatever order the plugins are listed in.
    enforce: "pre",

    hotUpdate({ file, server }) {
      if (
        this.environment.name !== "client" ||
        !rendersHere(server) ||
        !isSsrPageModule(
          file,
          server,
          resolve(ctx.options.root, ctx.options.routesDir),
          resolve(ctx.options.root, ctx.options.devEntry),
        )
      ) {
        return;
      }

      server.ws.send({
        type: "full-reload",
        path: "*",
        triggeredBy: resolve(file),
      });
    },

    configureServer(server) {
      // Registered before Vite's own middlewares, and before any other plugin's
      // (this plugin half is `enforce: "pre"`), so this URL is answered here and
      // never reaches a runtime that answers pages.
      //
      // Serve the framework runtime independently of application modules.
      server.middlewares.use(async (req, res, next) => {
        if (
          req.url !== RUNTIME_URL && !req.url?.startsWith(RUNTIME_URL + "?")
        ) {
          next();
          return;
        }

        try {
          const result = await server.transformRequest(CORE_RUNTIME_ID);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(result?.code ?? "");
        } catch (err) {
          next(err);
        }
      });

      // Adding or removing a route/island file changes the route table, so the
      // app has to be rebuilt. Application dependency edits also rebuild it,
      // so middleware and API handlers update together with page views.
      const invalidate = (file: string) => {
        if (file.includes("node_modules")) return;
        app = null;
      };
      server.watcher.on("add", (file) => invalidate(file));
      server.watcher.on("unlink", (file) => invalidate(file));
      server.watcher.on("change", (file) => {
        if (
          isSsrPageModule(
            file,
            server,
            resolve(ctx.options.root, ctx.options.routesDir),
            resolve(ctx.options.root, ctx.options.devEntry),
          )
        ) {
          app = null;
        }
      });

      return () => {
        server.middlewares.use(
          async (
            req: IncomingMessage,
            res: ServerResponse,
            next: (err?: unknown) => void,
          ) => {
            try {
              // A runtime of its own is running this project: it evaluates the
              // app's modules and answers the requests, so this middleware is
              // only here to keep them moving. The client entry above is the one
              // URL that runtime cannot answer.
              if (!rendersHere(server)) {
                next();
                return;
              }

              if (app === null) app = buildApp(server);
              let instance: RequestApp;
              try {
                instance = await app;
              } catch (error) {
                app = null;
                throw error;
              }

              const response = await instance.fetch(await toRequest(req));
              await writeResponse(res, response);
            } catch (err) {
              next(err);
            }
          },
        );
      };
    },
  };
}

function isSsrPageModule(
  file: string,
  server: ViteDevServer,
  routesDir: string,
  serverEntry: string,
): boolean {
  const changedFile = resolve(file);
  if (
    isPathWithin(changedFile, routesDir) ||
    changedFile === serverEntry
  ) {
    return true;
  }

  const modules = server.environments.ssr.moduleGraph.getModulesByFile(
    changedFile.replace(/\\/g, "/"),
  );
  if (modules === undefined) return false;

  const seen = new Set<EnvironmentModuleNode>();
  const pending = [...modules];
  while (pending.length > 0) {
    const mod = pending.pop()!;
    if (seen.has(mod)) continue;
    seen.add(mod);

    if (mod.file !== null) {
      const importer = resolve(mod.file);
      if (
        isPathWithin(importer, routesDir) ||
        importer === serverEntry
      ) {
        return true;
      }
    }
    pending.push(...mod.importers);
  }

  return false;
}

function isPathWithin(file: string, directory: string): boolean {
  const path = relative(directory, file);
  return path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else {
      headers.set(name, value);
    }
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  let body: Uint8Array | undefined;
  if (hasBody) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = new Uint8Array(Buffer.concat(chunks));
  }

  // `Buffer`/`Uint8Array` are valid bodies at runtime but the DOM types do not
  // line up with the Node ones.
  return new Request(url, {
    method,
    headers,
    body: body as unknown as BodyInit | undefined,
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  setResponseHeaders(res, response);
  const reader = response.body?.getReader();
  if (reader !== undefined) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch (error) {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
      return;
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

function setResponseHeaders(res: ServerResponse, response: Response): void {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name === "content-length") return;
    res.setHeader(name, value);
  });
}
