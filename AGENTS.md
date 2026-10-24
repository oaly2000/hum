# Hum Repository Guide

This file is for coding agents working on the Hum repository. User-facing setup
and framework usage documentation lives in [README.md](./README.md).

## Repository

Hum is an ESM islands SSR framework built with Preact, Hono, and Vite, for
Node.js and for edge runtimes. Keep the framework's core contract intact: render
pages to HTML on the server, and ship client JavaScript only for explicitly
registered islands.

## Package Map

- `packages/core` (`@humjs/core`): file-route matching, Hono request handling,
  SSR and the document shell, island markers/props, client runtime, and shared
  framework types.
- `packages/vite-plugin` (`@humjs/vite-plugin`): file discovery (routes, islands,
  client entry), Vite integration, development SSR/HMR, island/client entry
  generation, asset and CSS handling, and production client/server builds.
- `packages/create-hum` (`create-hum`): project scaffolder and its templates in
  `templates/basic`.
- `packages/docs`: documentation site and integration example exercising the
  public framework APIs.

When changing behavior that crosses package boundaries, update every affected
surface: core runtime, Vite development and production paths, the scaffold, and
the example where applicable.

## Architecture Notes

- Routes are derived from files under `routes/`. Special files such as
  `_app.tsx`, `_layout.tsx`, `_middleware.ts`, `_error.tsx`, and `_404.tsx`
  contribute behavior through the route tree.
- Route and island discovery is bundler driven, in both environments.
  Explicit islands use `defineIsland(Component)` from `@humjs/core/shared` in
  module-level declarations (exports optional). `humClientDeclarations` analyzes source
  metadata enumerated by Vite's glob, without evaluating application modules,
  and injects an ID derived from the project-relative module path and declaration
  binding (or `default` for an inline default export). Metadata lives in virtual
  modules so it does not take the output path of the actual application module.
  It excludes dependencies, generated/output/public files and tests. Named and
  default exports, aliases, and multiple definitions per module are supported;
  each declaration wraps its component rather than mutating a shared view.
  Private declarations receive generated exports in the client slice. Factory IDs
  use the same path/binding scheme as islands, in a separate ID namespace.
  The same compiler collects top-level `defineFactory(fn)`
  declarations from `@humjs/core/events`. `client_slice.ts` resolves lexical
  bindings and extracts declarations plus their same-file dependencies into
  `?hum-client` modules. SSR metadata imports original sources, keeping server
  output paths intact. Client metadata imports slices; production maps their
  manifest keys to island/factory IDs. External modules are normal imports
  and must be browser-safe. Unsupported mutable/effectful dependencies and
  non-CSS bare side-effect imports fail compilation rather than guessing.
  Serialized factory markers collect the factory IDs actually used by a
  response; full HTML imports their modules before boot, partial metadata lists
  their URLs and the client awaits them before parsing the shared payload graph.
  Directory placement never registers islands; there is no islandsDir option or
  implicit default-export tagging. `virtual:hum/routes` combines file routes
  with explicit island descriptors through `specsFromGlob`. The client build
  input `.hum/islands.js` uses the same metadata glob to retain lazy imports,
  emitting chunks per declaring module. Production assets map generated IDs to
  chunks through Vite's manifest and the analyzed declarations. Nothing discovers
  files at runtime: `defineBuild` registers the bundler-produced build.
  Route naming rules live in `packages/core/src/routing/route_files.ts`;
  `route_files.test.ts` covers the route glob, including `_components` and
  `_islands` as nonroute directories. These exclusions do not register islands.
- The runtime never reads the build output, and it never touches the file
  system: `virtual:hum/build` — generated for development and for the production
  server alike — calls `defineBuild` with the routes, the islands and the client
  assets, and `mountHum` boots from what it finds there. The registration lives
  on `globalThis` because a bundler's dev pipeline runs its own copy of the
  framework's modules. Keep it that way:
  `packages/core/tests/runtime_entry.test.ts` asserts that no module mentions
  `node:fs` or `node:url` at all.
- Route handlers use Hono's `Context`. `page(data, options)` associates business
  data and an optional response status with the current request through
  request-local context; view data is passed under the `data` prop.
  `define.page<Data>()` types the view without mixing business data into
  framework route props. Avoid adding framework-specific fields to Hono's
  context.
- Server rendering identifies registered islands and emits markers plus
  serialized props. The client runtime discovers those markers and hydrates the
  corresponding island bundles.
- The render payload is a reference-sharing graph, not independent per-unit
  records. Parse one payload for a page or partial response and pass its revived
  values to every owning interaction unit: a signal used by a page facet, an
  island prop, a factory handler, or multiple partials must remain the same
  client signal instance.
- The client reviver registers island/partial roots and page-level signal/DOM
  bindings with `runtime/client/interaction_manager.ts`. The manager owns their
  shared scheduling, incremental registration/disposal and exclusive
  DOM-boundary checks; a page-level element host or an island/partial root
  delegates nested partial updates inside its range rather than creating an
  overlapping root. Replacing a partial refreshes its delegated nested targets,
  and `PartialComp` rekeys its active instance when reconciliation changes its
  name. Partial updates from one response are submitted as one scheduled
  batch. Keep them on that manager path so replacing a subtree does not race a
  stale navigation or bypass its owner.
- Runtime interaction instances refer to a shared unit definition that fixes
  their kind and scheduling phase. Keep instance-specific identity, DOM range,
  delegates and lifecycle callbacks separate from that definition when adding
  new unit kinds.
- Standalone island roots hydrate when their first element enters the viewport
  (with a 200px root margin); when `IntersectionObserver` is unavailable or the
  root has no element, activation falls back to eager hydration. Island modules
  whose roots are nested in a partial or below a page-level element facet are
  eagerly available to the owning Preact tree; unrelated modules on the same
  page remain deferred. If one module is used in both contexts, the module is
  eager for all its roots. A failed deferred import is reported and remains
  eligible for a retry after the island leaves and re-enters the observer's
  visibility range.
- A changed island module in Vite development currently triggers a client
  full-page reload, not component-state-preserving Preact HMR. Runtime boot
  replaces its island module/loader registries so a detached runtime cannot
  reuse loaders from the previous page; do not describe this as hot component
  replacement without adding and validating that behavior.
- Keep the Preact-root renderer and DOM-binding restoration as separate
  executors behind the shared manager. Do not add an executor wrapper that only
  forwards `mount`/`apply` callbacks; extract an executor only when it owns
  behavior (for example dependency activation, transactional updates or
  replacement) that can be tested independently.
- The Vite plugin has distinct dev and production paths. Keep module handling,
  island/runtime entry generation, styles, and emitted asset metadata consistent
  between them.
- Hum renders its own HTML document rather than relying on a Vite `index.html`.
  Import CSS directly: `_app` for global styles, layouts for shared styles, pages
  and components for local styles. The plugin adds head links automatically.
  Vite processes Tailwind/PostCSS, imports and referenced assets. The build's base is
  basePath + `/_hum/`; SSR builds emit assets, and a final generateBundle hook
  republishes them under `public/_hum/`, including in standalone mode.
  No user clientEntry option or implicit client/main.ts import exists. The dev
  runtime is served directly from the framework; responses need no CSS splicing.
  Keep the internal framework runtime entry for hydration and partial navigation.
  Partial navigation awaits new stylesheets before committing DOM updates, shares
  in-flight loads, retries failures and checks navigation generation after loading.
  Loaded styles stay available to surviving layouts/partials; no automatic unload.
  Ordinary CSS and CSS Modules use normal imports. `humStyles` collects static source dependencies
  from Vite's graph, and route loaders add their links through the existing head
  merge (so app/layout skip flags and error/404 chains apply naturally). Production
  compiles those CSS sources as independent Vite inputs using the user plugin
  pipeline; only CSS and referenced assets are copied, never JS class-map wrappers.
  The generated stylesheet map is finalized before prerender and embedded in the
  standalone pass. CSS Module edits reload development HTML because scoped names
  may change. Dynamic imports are outside automatic SSR stylesheet discovery;
  cross-file composes can duplicate rules. Client manifest CSS includes recursive
  static chunk dependencies.
- Applications explicitly call `mountHum(app, config)` after registering Hono
  middleware and API routes. `virtual:hum/build` registers the bundler-produced
  build and exports `config` with routesDir, basePath and dev mode.
  Hum owns the app-level 404 handler; page failures render `_error`, while API
  failures use the user's Hono `onError`.
- Page modes live in page-level `define.config({ render: ... })`: SSR by
  default, SSG with an optional slugs array (required for parameter routes), and
  ISG with a positive revalidate interval and optional slugs/fallback. The
  page service is configured in the application entry with createPageService
  and passed to mountHum. It generates fresh anonymous GET requests through
  the app, leaving application middleware on cache hits while directory
  middleware and handlers run during generation. Never reuse a request Context
  for background work or cache private/varying responses.
- The client build is followed by server compilation. Prerendering evaluates
  route policies from the compiled modules and loads devEntry only when paths
  need generation. That entry must be the mounted app, without a listener.
  Generated responses are embedded in HumBuild.pages in the generated build
  module, with the canonical origin from prerenderOrigin. Both deployment modes
  use this path rather than a separate temporary prerender bundle; runtime still
  performs no file system discovery. Static hosting is not an output mode.
- A generated page carries full HTML and partial metadata captured during the
  same buffered render. Publish both representations atomically and keep their
  shared payload graph intact. Streaming remains SSR-only. ISG storage keys
  include the build ID; per-service generation coalesces, adapter storage owns
  cross-instance coordination. Failed regeneration keeps the previous page.
- `serverEntry` defaults to `server.ts` and is built directly, preserving named
  and default exports and top-level side effects. No `start(app)` protocol is
  used. Node entries call `serve()` directly; Worker entries export their app.
  `devEntry` defaults to serverEntry and must default-export the Hono app Vite
  serves and the build prerenders. Node templates and docs use `app.ts` for devEntry to avoid starting a
  second listener. Entry-less projects still get a generated Node server.
- An island is recognized by a tag the bundler supplies to `defineIsland`: `{ name, file, exportName }` under
  `Symbol.for("hum.island")`, and the renderer reads it back and looks the name
  up in the build. Do not reintroduce a table keyed by component identity: it
  only works while a module is instantiated once, which a Worker runtime's
  module runner does not promise. For the same reason `BuildCache.load()` reads
  the island table out of the build's manifest instead of importing island
  modules, and the plugin's server-build pass has to include the tag transform.
- Preact's options hooks are installed per Preact, marked on the options object
  rather than on `globalThis`. More than one copy of the framework can live in
  one process or isolate, and a process-wide flag lets one copy's installation
  silence the others — which renders without island markers and wraps a finished
  document in a second one.
- The dev server yields to a plugin that runs the app in a runtime of its own:
  it asks the `ssr` environment for a module runner — one a platform plugin
  builds for its own runtime has none, because the runner lives in that runtime
  — and leaves the request to that runtime, answering only the client runtime
  URL. Nothing keys off a plugin's name, so another adapter of the same kind
  needs no change here. That URL is registered before Vite's own middlewares and
  — the plugin half being `enforce: "pre"` — before every other plugin's, so no
  runtime that answers pages can claim it whatever order the plugins are listed
  in. The Vite dev script is emitted by the document render
  (development only, never in a partial response) rather than spliced into the
  response, because a runtime rendering elsewhere has no response to splice.
- An app is mounted once. Create the Hono instance in the module that mounts
  it, so invalidating the build dependency recreates the application. The Node
  dev server re-evaluates devEntry after route discovery changes and relevant
  dependency edits; it never mounts onto or wraps the user's cached app.
  Worker templates use their application entry in both development and
  production, without a separate dev-worker module. `mountHum` refuses a second
  mount of the same instance because Hono freezes routing after a match.
- `createApp(config)` creates the Hono app for projects that do not have their
  own `server.ts`. Keep it a wrapper around `mountHum(app, config)` so both
  paths share routing behavior.
- Every build includes `<outDir>/server.js`, `<outDir>/package.json`
  and `<outDir>/public/`, where `public/_hum` holds the client assets and the
  project's `public/` files are copied in beside them. `/_hum` addresses them, so
  the output directory is never part of an asset URL — it may be `dist`,
  `wwwroot` or anything else, and `assetsBase` in the build is a constant rather
  than something derived from `outDir`. The client build's intermediate output
  (`<outDir>/.hum-client`, including Vite's manifest) is copied into
  `<outDir>/public/_hum` and then deleted, so the deployed output directory
  carries nothing that is not published. `outDir` defaults to `dist`.
- Production server builds default to an ESM module tree with npm dependencies
  external. Preserve application paths (`app.ts` becomes `<outDir>/app.js`) and
  place generated Hum modules under `<outDir>/_generated/`. Deploy the tree
  alongside installed production dependencies; its `package.json` only marks
  ESM and does not replace the application's dependency manifest and lockfile.
  Do not bundle native addons or packages that need their installed files in
  this mode. Runtime-computed application resources still need to be deployed.
- `hum({ standalone: true })` bundles server dependencies into relocatable ESM
  output. Cloudflare uses this mode. Verify standalone output runs from a
  different directory, and under a different directory name, without
  `node_modules`. Normal builds instead retain Node's dependency resolution.
  Both modes embed the build rather than discovering files at runtime; client
  asset URLs come from `assetsBase`, independent of the output directory name.
- The output directory's `public/` tree is served from the deployment root: it is
  what the dev server answers for the project's `public/` directory and what a
  built app mounts `@hono/node-server/serve-static` for (see
  `packages/docs/server.ts` and the scaffold). The built app resolves this
  directory as a sibling of its server entry, so renaming or moving the output
  needs no runtime environment variable. Normally static requests are delegated
  to a reverse proxy, a CDN, or a platform asset binding. Only that tree is
  public: the server modules sit next to it and must stay unreachable over HTTP,
  which `tools/test-standalone-deploy.mjs` asserts in both directions.

## Development and Validation

Workspace development and documentation builds require Node.js 22.18 or later
and pnpm. Hum's published Vite build plugin itself supports Node.js 20.19 or
later (or 22.12 or later).

```bash
pnpm install
pnpm typecheck       # TypeScript across workspace packages
pnpm test            # Vitest test suite
pnpm build:pkgs      # Build package outputs
pnpm dev             # Build packages and run the documentation site
pnpm build           # Build packages and production documentation site
pnpm start           # Run the built example server
pnpm test:standalone  # Build and run the artifact without node_modules
```

Prefer focused package tests while iterating, then run the relevant workspace
checks for changes that cross package boundaries. Do not commit generated
`dist/` output unless a package explicitly tracks it.

Every package build removes `dist` through `tools/clean-dist.mjs` first: `tsc`
never prunes its output, so a deleted source file would otherwise leave a stale
module behind that imports something which no longer exists. Keep the clean step
in build scripts added for new packages.

## Versioning and Releases

Versions and changelogs are managed with Changesets
(`.changeset/config.json`). Published packages are `@humjs/core`,
`@humjs/vite-plugin`, and `create-hum`; `hum-docs` is ignored.

- Record a change by writing `.changeset/<name>.md` by hand:

  ```markdown
  ---
  "@humjs/core": patch
  ---

  Fix island props serialization for nested slots.
  ```

  Never run `pnpm changeset`: its interactive package/version prompt blocks
  agents. Use a short user-facing description with `patch` / `minor` / `major`.
- Changeset files are temporary: `pnpm changeset version` consumes them, bumps
  versions, and writes `CHANGELOG.md`. Run `version` first, then commit only the
  bumps and changelogs as a release commit; never commit `.changeset/*.md`. Only
  `config.json` is tracked under `.changeset/`.
- Release order: `pnpm changeset version` → commit and push `main` →
  `pnpm changeset git-tag` → `git push github --follow-tags`. Only pushing tags
  to the GitHub remote triggers CI, a plain `git push` does not push tags, and
  the tag must point at a commit that already has the tag-triggered workflows.
- CI does the publishing (`npm-publish.yml`): it publishes over npm Trusted
  Publishing and skips versions already on the registry. `docs-build.yml`
  rebuilds the documentation site onto the `docs` branch from the same tags.
  Never publish locally, and never move a tag once its version is on npm — ship
  a new version instead.

## Change Practices

- Preserve existing user-facing behavior unless the requested change requires
  otherwise; cover intentional behavior changes with tests.
- Add tests for changes to routing, SSR/island serialization, partial/client
  navigation, Vite build output, and scaffolding.
- Keep the scaffold aligned with the supported Vite plugin and framework APIs.
  Verify changes by generating a project when template contents or copying
  behavior changes.
- Keep documentation in `README.md` focused on using Hum. Put repository
  architecture and agent-oriented development guidance here.
