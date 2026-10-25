# Hum Repository Guide

Hum is an ESM islands SSR framework using Preact, Hono and Vite for Node and edge
runtimes. Render HTML on the server; ship application JavaScript only for explicit
client declarations. User documentation belongs in [README.md](./README.md).

## Package map

- `packages/core`: routing, Hono integration, SSR/document shell, serialization,
  client interactions and shared types (`@humjs/core`).
- `packages/vite-plugin`: discovery, client extraction, dev/HMR, CSS and production
  builds (`@humjs/vite-plugin`).
- `packages/create-hum`: scaffolder and templates (`create-hum`).
- `packages/docs`: documentation site and public API integration example.

Update all affected runtime, dev/build, scaffold and example surfaces together.

Core implementation lives in `core/src/server`, `runtime`, `shared`, `protocol`,
`routing`, `pages` and `build`. Public entry files select explicit exports;
bundler integrations use `@humjs/core/build`, application code uses the root
and `@humjs/core/client` entries. Keep client APIs independent of server modules
and the browser runtime; `/runtime` is the generated bootstrap entry.

## Routing and application lifecycle

- Route rules live in `core/src/routing/route_files.ts` and its tests.
  `_app`, `_layout`, `_middleware`, `_error`/`_500` and `_404` compose through the
  route tree. `_components` and `_islands` directories are not routes.
- Handlers receive Hono `Context`. `page(data, options)` stores request-local data
  and optional status; views receive `data`, typed with `define.page<Data>()`.
  Do not add framework fields to Hono's context.
- Create the Hono instance in its mounting module. Register middleware/API routes,
  then `await mountHum(app, config)` exactly once. Hum owns page errors and the
  app-level 404; API errors use Hono's `onError`. `createApp` wraps the same mount.
- `serverEntry` defaults to `server.ts`; preserve its exports and top-level effects.
  Node entries call `serve()`; Workers export the app. No `start(app)` protocol.
  `devEntry` defaults to `serverEntry` and must default-export the mounted app
  without starting a listener. Node examples use `app.ts`; Workers use one entry.
- Node dev re-evaluates `devEntry` after discovery/dependency changes, recreating
  the app rather than remounting a cached instance. For platform runtimes without
  an SSR module runner, yield page requests without detecting plugin names.
  Register Hum's client-runtime URL before other middleware (`enforce: "pre"`).
  Emit Vite's dev script during document rendering, never partials or response splicing.

## Discovery and client compilation

- Vite globs discover routes and module-level `defineIsland(Component)` and
  `defineFactory(fn)` declarations from `@humjs/core/client`.
  Analyze sources without evaluating them; exclude dependencies, tests and
  generated/output/public files. Directory placement never registers islands;
  there is no `islandsDir`, manual ID or user `clientEntry`.
- IDs derive from project-relative file and declaration binding (`default` for
  inline default exports), with separate island/factory namespaces. Support
  private, named/default, aliased and multiple declarations; wrap each component
  rather than mutating a shared view. Private client declarations get generated exports.
- `client_slice.ts` extracts declarations and lexical same-file dependencies into
  `?hum-client` modules. External imports remain normal browser-safe imports.
  Reject unsupported mutable/effectful dependencies and non-CSS bare side effects.
  SSR metadata imports originals; client metadata imports slices. Virtual metadata
  must not occupy original server module paths. Production reuses client analysis
  and the shared stylesheet map instead of per-source metadata/wrapper modules.
- `.hum/islands.js` retains lazy imports for compilation. Manifest entries map IDs
  to chunks. Default slice names are `client-<relative-module-path>-<hash>.js`;
  user chunk filenames take precedence. Omit the discovery entry from publication
  unless a runtime chunk depends on it. Framework modules/preload helper share
  the runtime chunk; Preact/signals and application slices retain normal splitting.
- `virtual:hum/build` calls `defineBuild` and exports mounting config. Keep build
  registration on `globalThis` across module runners. Runtime performs no file
  discovery or filesystem access; `core/tests/runtime_entry.test.ts` forbids
  `node:fs` and `node:url` in runtime modules.
- Islands carry `{ name, file, exportName }` under `Symbol.for("hum.island")`.
  Resolve identity through the build manifest, never component-object tables or
  importing island modules in `BuildCache.load()`. Include tag transforms in SSR
  builds. Install Preact hooks per options object, not with a process-global flag.

## Client interactions

- Serialize one reference-sharing payload graph per full/partial response. Revive
  once so signals shared by facets, island props, factories and partials retain
  identity. Import used factory modules before revival, including partial navigation.
- `core/src/runtime/interaction_manager.ts` owns scheduling, registration/disposal
  and exclusive DOM boundaries. Hosts delegate nested partials; replacement refreshes
  delegates, and `PartialComp` rekeys when its name changes. Submit a response's
  partial updates as one scheduled batch with stale-navigation checks.
- Unit definitions fix kind/phase; instances own identity, ranges, delegates and
  lifecycle. Keep Preact rendering and DOM-binding restoration as separate
  executors; do not add wrappers that merely forward callbacks.
- Standalone roots activate within a 200px viewport margin; no element/observer
  means eager activation. Modules nested in partials or page-level element facets
  are eager for all their roots; unrelated modules remain deferred. Failed deferred
  imports retry after leaving/re-entering the observer range.
- Island edits currently cause a full-page reload, not state-preserving HMR.
  Boot replaces module/loader registries so detached runtimes cannot reuse old loaders.

## Styles and assets

- Hum renders its document without Vite `index.html`. Import global CSS in `_app`,
  shared CSS in layouts and local CSS in pages/components; no implicit `client/main.ts`.
  Keep dev/production handling of modules, runtime entries, CSS and assets consistent.
- `humStyles` follows static Vite dependencies; route loaders merge links through
  normal head handling, including skip flags and error/404 chains. CSS Modules use
  normal imports. Dynamic-only imports are outside SSR discovery; cross-file
  `composes` may duplicate rules. Client CSS includes recursive static chunk dependencies.
- Production compiles CSS with the user plugin pipeline as independent inputs;
  publish CSS/referenced assets, not JS class-map wrappers. Finalize the stylesheet
  map before prerender and embed it in standalone output. SSR assets are republished
  by `generateBundle`, including standalone. Asset base is `basePath + /_hum/`.
- Partial navigation shares stylesheet loads, retries failures and awaits CSS
  before DOM commit, checking navigation generation afterwards. Retain loaded CSS
  for surviving content. CSS Module edits reload HTML; ordinary CSS retains HMR.

## Generated pages and deployment

- Page-level `define.config({ render })` selects SSR (default), SSG or ISG.
  Dynamic SSG requires `slugs`; ISG requires positive `revalidate`, with optional
  slugs/fallback. Use `createPageService` via `mountHum` for storage/background work.
- Generate fresh anonymous GET requests through the app. App middleware runs on
  cache hits; directory middleware/handlers run during generation. Never reuse a
  request Context for background work or cache private/varying responses.
- Build client then server; evaluate policies in compiled routes and load
  `devEntry` only when generation is needed. Embed responses in `HumBuild.pages`
  using `prerenderOrigin`. Both deployment modes share this path; no separate
  temporary prerender bundle or static-hosting output. Streaming is SSR-only.
- Publish full HTML and partial metadata atomically from the same buffered render
  and payload graph. ISG keys include build ID; services coalesce generation,
  storage adapters coordinate instances, and failed regeneration keeps old output.
- Every build has `<outDir>/server.js`, ESM `package.json` and `public/`; default
  outDir is `dist`. Publish client assets at `public/_hum` and copy project public
  files beside them. Remove `.hum-client`/manifest intermediates after assembly.
  Asset URLs use constant `assetsBase`, independent of output directory names.
- Normal server builds preserve application paths and npm externals; generated
  modules go in `_generated/`. Deploy production dependencies, the application's
  manifest/lockfile and runtime resources; output `package.json` only marks ESM.
  Native addons/packages requiring installed files must remain external.
- `standalone: true` bundles dependencies into relocatable ESM (used by Cloudflare).
  Verify it runs from a differently named directory without `node_modules`.
- Only `public/` is HTTP-accessible; server modules stay private. Node static
  serving resolves public as a sibling of the server entry; proxies/CDNs/platform
  assets may serve it instead. Verify with `tools/test-standalone-deploy.mjs`.

## Development and changes

Require Node >=22.18 and pnpm. Main commands:

```sh
pnpm install
pnpm typecheck
pnpm test                 # all Vitest projects
pnpm test:fast            # core/runtime, compiler, scaffold
pnpm test:integration     # Vite builds/dev, built CLI, workerd
pnpm build:pkgs           # build workspace dependencies
pnpm dev                 # build packages and run docs
pnpm build               # production docs
pnpm start               # built docs server
pnpm test:standalone      # relocatable deployment check
```

- Iterate with focused tests, then relevant workspace checks. Integration tests
  use built dependencies: run `pnpm build:pkgs` after source edits, before testing.
- Tests that start Vite, build output, execute built CLI or use workerd belong in
  `tests/integration/`; core HTTP and Happy DOM tests remain fast. Vite helpers live
  in `vite-plugin/tests/helpers`; only identical read-only builds may share fixtures.
- Preserve behavior unless intentionally changed. Test routing, serialization,
  navigation, build and scaffold changes; generate a project after template edits.
- Every package build must run `tools/clean-dist.mjs` before tsc to remove stale
  modules. Do not commit generated `dist/` unless explicitly tracked.
- Keep README focused on usage and link detailed guides. Update existing guidance
  instead of appending change history; keep this file to durable constraints and
  source/test pointers, not implementation walkthroughs.

## Releases

- Changesets manages `@humjs/core`, `@humjs/vite-plugin`, `create-hum`; docs is ignored.
  Handwrite `.changeset/<name>.md` with package + patch/minor/major frontmatter and
  a short user-facing description. Never run interactive `pnpm changeset`.
- Changeset files are temporary and untracked. `pnpm changeset version` consumes
  them; commit only resulting version bumps/changelogs, never `.changeset/*.md`.
- Release order: version -> commit/push `main` -> `pnpm changeset git-tag` ->
  `git push github --follow-tags`. Only tags pushed to GitHub trigger release CI;
  tags must point at commits containing the tag-triggered workflows.
- CI (`npm-publish.yml`) publishes via npm Trusted Publishing and skips existing
  versions; `docs-build.yml` rebuilds the docs branch. Never publish locally or
  move a tag already published to npm; release a new version.
