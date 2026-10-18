# @humjs/core

## 0.5.0

### Minor Changes

- Add typed request-scoped resources shared across route middleware, layouts, and pages.
- `server.ts` is now the server build's entry as written: Hum no longer generates one. It creates its Hono app, imports `virtual:hum/build`, calls `await mountHum(app)` and default-exports the app, and starts its own listener (for example `serve(...)` guarded by `import.meta.env.PROD`). The `start(app)` export and the `cache`/`waitUntil` export convention are removed; pass them to `mountHum` instead. A project without `server.ts` is an error. The Cloudflare template drops `dev-worker.ts`.
- Add unified SSR, SSG and ISG page generation with per-route render configuration and slugs tables. Pre-generate pages during builds, retain shared Partial payloads, and configure incremental storage and background regeneration in the application entry.

### Patch Changes

- Unify build-time static generation and incremental regeneration on a portable response-cache contract.

## 0.4.1

### Patch Changes

- Use the browser View Transitions API for partial navigations when available.
- Keep the Cloudflare template's development server working across edits. Its
  dev worker mounts the project's app on an app of its own, because the runtime
  re-runs the worker entry after every change while the app module stays cached
  and Hono takes no route once a request has matched on its router. Mounting Hum
  on an app it already mounted is now refused with a message naming that shape,
  rather than failing inside Hono with nothing about the cause.
- Expand the package documentation with entry-point guidance, configuration
  reference, a getting-started walkthrough, and production usage notes.
- Recognize an island by the component the bundler stamped instead of by the
  identity of a loaded module. The Vite plugin writes the island's name, file and
  export onto every island module's default export, and the renderer reads it
  back, so an island is found wherever its module came from and mounting no longer
  imports every island to build a table of components.

  This also fixes the preact hooks not being installed for a second copy of the
  framework in the same process — a render that then produced no island markers
  and wrapped the finished document in a second one. Islands are covered end to
  end in both the dev server and the production build now.

## 0.4.0

### Minor Changes

- Separate browser-safe helpers from the framework and client runtime entry points, and keep streamed Suspense content intact across response chunks.

## 0.3.0

### Minor Changes

- Routes, islands and client assets now reach the runtime through the build the
  bundler produced: the generated `virtual:hum/build` module calls `defineBuild`,
  and `mountHum` boots from it. `HumConfig` no longer takes `manifest` or
  `prodManifest`, the production build no longer writes `manifest.json`, and the
  runtime no longer touches the file system at all.

## 0.2.0

### Minor Changes

- Stop serving the production build output from within Hum.
  
  Hum still renders the client asset URLs recorded in the build manifest, but
  answering `/_hum/client/*` is the application's job now: use your platform's
  asset binding, a reverse proxy, a CDN, or `@hono/node-server/serve-static`. The
  scaffold and the documentation example mount that middleware themselves and
  accept `HUM_OUT_DIR` for renamed or relocated output directories. Only
  `_hum/client/` is public — the server bundle and `manifest.json` are no longer
  reachable over HTTP.
  
  Projects built with an earlier version need to mount a static middleware for
  `/_hum/client/*` (or serve that directory from a proxy) after upgrading.
- Remove file system discovery, and require the manifest.
  
  Discovery belongs to the bundler: only it can turn a project's files into
  modules, so the route and island manifest is its product. Hum no longer keeps a
  second, Node-only implementation of that. `@humjs/core/discovery` is gone with
  `crawlProject` and `crawlToManifest`, `HumConfig.manifest` is required instead
  of falling back to a directory scan, and `RouteFileSpec.absPath` /
  `IslandSpec.absPath` are gone because nothing ever read them.
  
  What this buys is a runtime that never resolves a path: no static `node:fs` or
  `node:url` import remains anywhere in `@humjs/core`, and the one remaining
  read of the build output — `readProdManifest` — happens on demand, only when
  the app does not inject `prodManifest` itself.
  
  Mounting Hum without the Vite plugin now means building the manifest with
  `specsFromGlob` (or any other source of route and island modules) first.
- Drop the `@humjs/core/server` entry and its `@hono/node-server` dependency.
  
  Starting a Node listener is the application's business, the same way Hono leaves
  it to `@hono/node-server` and to each platform's own entry point. The generated
  production entry now imports `serve` from `@hono/node-server` directly, so
  projects must declare that dependency (new scaffolds and the documentation
  example already do). `PORT`, `HOST`, and the `hum: listening on …` log behave as
  before. This also removes `createListener`, which wrapped `getRequestListener`.
- Discover routes and islands from a bundler glob.
  
  `@humjs/core/routing` exports `globPatterns`, `specsFromGlob` and `routeSpecOf`,
  which derive the manifest from the result of Vite's `import.meta.glob` instead of
  a directory scan.
- Let the app supply the build manifest.
  
  `HumConfig.prodManifest` takes the build manifest directly. When it is provided
  — which the generated production entry now does, after reading `manifest.json`
  itself — Hum never touches the file system, so a runtime that has none can mount
  the same app.
  
  A missing `manifest.json` is reported now that Hum infers dev mode from it. The
  run used to fall back to dev in silence and serve source URLs that a production
  build cannot answer, which was indistinguishable from an intended dev run.
- Name an island from its file path in one place.
  
  `@humjs/core/routing` exports `islandNameOfFile`, which answers "is this file an
  island, and what is its name" for a project relative module path, or `null` when
  it is no island. `specsFromGlob` now derives its island names through it, so a
  bundler manifest and a glob result cannot name the same file differently.

## 0.1.0

### Minor Changes

- Rename the client-navigation opt-in attribute from `f-client-nav` to
  `data-hum-client-nav`, and let it be switched off per subtree with
  `data-hum-client-nav="false"`. Update the scaffold to the new attribute name.
- Add page-level facets: signals and event handlers on elements outside islands.
  A signal rendered as a child (`<p>{count}</p>`) or passed as a prop is serialized
  by the page render and revived into a live signal in the browser, and a handler
  created by a `@humjs/core/events` factory (`add`, `setValue`, `toggle`,
  `setFromProp`, or a custom one registered with `defineFactory`) is serialized by
  factory name instead of by closure, so a page can drive a signal from a click or
  a native form control without shipping an island. Server rendering records the
  bindings in `data-hum-signal` / `data-hum-handler` attributes that the client
  reviver consumes. The Vite plugin now serves the user client entry at the runtime
  URL in development, so the modules that register factories are evaluated in the
  browser.
- Drop the `middleware` export from route modules: middleware is only ever a
  directory-scoped `_middleware.ts` mount point now, so use `app.use()` in
  `server.ts` for app-wide or URL-prefix policy. Directory middleware also wraps
  the `_404` render for unmatched paths under its directory.

## 0.0.2

### Patch Changes

- Move packages to the `@humjs` scope and publish them to npm with Trusted Publishing.
