# @humjs/core

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
