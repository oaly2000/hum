import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  createApp,
  type HumApp,
  type HumBuild,
} from "@humjs/core";
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
  projectSummary,
  projectUrlPath,
  RESOLVED_USER_ENTRY_VIRTUAL_ID,
  RUNTIME_URL,
  USER_ENTRY_VIRTUAL_ID,
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
      islandsDir: ctx.options.islandsDir,
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
          resolve(ctx.options.root, ctx.options.islandsDir),
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
      // The boot script imports `boot` from here, so this URL has to serve the
      // user client entry wired to the runtime: that entry imports
      // `client/main.ts` (global styles, factory modules) and re-exports the
      // runtime. Serving the runtime alone would leave factories the page
      // relies on unregistered in the browser.
      server.middlewares.use(async (req, res, next) => {
        if (
          req.url !== RUNTIME_URL && !req.url?.startsWith(RUNTIME_URL + "?")
        ) {
          next();
          return;
        }

        try {
          const result = await server.transformRequest(
            RESOLVED_USER_ENTRY_VIRTUAL_ID,
          );
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
            resolve(ctx.options.root, ctx.options.islandsDir),
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
              await writeResponse(res, response, server);
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
  islandsDir: string,
  serverEntry: string,
): boolean {
  const changedFile = resolve(file);
  if (isPathWithin(changedFile, islandsDir)) return false;
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

async function writeResponse(
  res: ServerResponse,
  response: Response,
  server: ViteDevServer,
): Promise<void> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    // The HMR client is part of the rendered document (see
    // `@humjs/core/runtime/server/document`), so only what needs this process
    // is spliced in here: styles are read out of the client environment's
    // module graph, which a runtime rendering the app elsewhere cannot reach.
    const styles = await collectCss(server);
    const stylesHtml = styles.join("\n");
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let done = reader === undefined;

    while (!done && !buffered.includes("</head>")) {
      const result = await reader!.read();
      done = result.done;
      if (result.value !== undefined) {
        buffered += decoder.decode(result.value, { stream: !done });
      }
      if (done) buffered += decoder.decode();
    }

    const headEnd = buffered.indexOf("</head>");
    let initial: string;
    if (headEnd === -1) {
      initial = buffered;
    } else {
      const end = headEnd + "</head>".length;
      initial = buffered.slice(0, headEnd) +
        `${stylesHtml}</head>` +
        buffered.slice(end);
    }

    setResponseHeaders(res, response);
    if (initial !== "") res.write(initial);
    if (reader !== undefined) {
      try {
        while (!done) {
          const result = await reader.read();
          done = result.done;
          const chunk = result.value === undefined
            ? ""
            : decoder.decode(result.value, { stream: !done });
          if (chunk !== "") res.write(chunk);
          if (done) {
            const tail = decoder.decode();
            if (tail !== "") res.write(tail);
          }
        }
      } catch (error) {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
    return;
  }

  const payload = Buffer.from(await response.arrayBuffer());
  setResponseHeaders(res, response);
  res.end(payload);
}

function setResponseHeaders(res: ServerResponse, response: Response): void {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name === "content-length") return;
    res.setHeader(name, value);
  });
}

/**
 * Collects the CSS produced by the modules of the client environment and
 * returns the inline `<style>` tags that should be injected into the document
 * head. Hum renders the document itself (there is no `index.html`), so styles
 * imported by the user client entry — such as TailwindCSS — never reach the
 * head through Vite's normal index.html pipeline.
 */
async function collectCss(server: ViteDevServer): Promise<string[]> {
  const env = server.environments.client;
  const seen = new Set<string>();
  const queue: string[] = [
    RESOLVED_USER_ENTRY_VIRTUAL_ID,
    USER_ENTRY_VIRTUAL_ID,
  ];
  const out: string[] = [];

  let current: string | undefined;
  while ((current = queue.pop()) !== undefined) {
    if (seen.has(current)) continue;
    seen.add(current);

    let mod = env.moduleGraph.idToModuleMap.get(current);
    if (mod === undefined || mod.transformResult === null) {
      // During development assets are loaded lazily, so trigger processing.
      await env.fetchModule(current);
      mod = env.moduleGraph.idToModuleMap.get(current) ??
        env.moduleGraph.idToModuleMap.get(`\0${current}`) ??
        env.moduleGraph.idToModuleMap.get(current.slice(1));
      if (mod === undefined) continue;
    }

    if (
      (current.endsWith(".css") || current.endsWith(".scss")) &&
      mod.transformResult !== null
    ) {
      // Vite stores CSS as a JS module; extract the stylesheet content from it.
      const match = mod.transformResult.code.match(
        /__vite__css\s+=\s+("(?:\\\\|\\"|[^"])*")/,
      );
      if (match !== null) {
        // Tag the style with the id Vite's client uses for the module, so that
        // when the module itself is loaded (the boot script pulls in the user
        // client entry) `updateStyle` adopts this element instead of injecting
        // a second copy into the page.
        out.push(
          `<style type="text/css" data-vite-dev-id="${
            escapeAttr(mod.id ?? current)
          }">${JSON.parse(match[1])}</style>`,
        );
      }
    }

    for (const m of mod.importedModules) {
      if (m.id === null) continue;
      queue.push(m.id);
    }
  }

  return out;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
