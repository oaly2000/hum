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
  `virtual:hum/routes` (`packages/vite-plugin/src/plugins/routes.ts`) enumerates
  the files with `import.meta.glob` and calls `specsFromGlob`, which the dev
  server and the generated production server entry both consume; the islands
  entry (`.hum/islands.js`, written by `writeBuildEntries`) is a build input
  whose glob makes the client build emit one chunk per island. The Vite plugin
  therefore never scans a directory: the production assets map island names to
  chunks by reading Vite's own manifest. Nothing discovers files at runtime
  either — Hum has no file system discovery at all, which is why the build the
  bundler produced is registered through `defineBuild` instead of passed as
  configuration. Everything shares the file naming rules in
  `packages/core/src/routing/route_files.ts` — in particular
  `islandNameOfFile` names an island from its path, which is what keeps the
  bundler's chunk map and the glob result in agreement. `route_files.test.ts`
  spells out which files a fixture project contributes, so a change to
  `globPatterns` has to be reflected there.
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
- The Vite plugin has distinct dev and production paths. Keep module handling,
  island/runtime entry generation, styles, and emitted asset metadata consistent
  between them.
- Hum renders its own HTML document rather than relying on a Vite `index.html`.
  Global client CSS must be reachable from the configured client entry and
  included in both development responses and production assets.
- The Vite plugin defaults its optional user client entry to `client/main.ts`;
  keep that default, the scaffold, and example projects in sync when changing
  client-entry conventions.
- If a project has `server.ts`, it default-exports a configured Hono app. The
  Vite plugin calls `mountHum(app, config)` after loading it. Hum mounts file
  routes directly onto that app, takes ownership of the app-level 404 handler,
  and does not replace the app-level `onError`: Hum route failures render
  `_error`, while Hono API failures use the user's Hono error handler. Register
  app middleware before routes so it wraps those routes; Vite owns the dev
  listener and HMR.
- Whether a production build runs itself is the entry's business, not a plugin
  option: the generated entry always exports the app — a Hono instance *is* its
  fetch handler, so a Worker or an edge runtime can import the bundle as it is —
  and it calls the entry's optional `start(app)` export when the project has one,
  which is the build's entry point. Nothing in the plugin records a platform, and
  no option selects one: the Cloudflare template exports no `start`, the Node
  templates and `packages/docs` do, and a project without `server.ts` gets an app
  of its own that serves itself on Node.
- An island is recognized by a tag the bundler writes onto its component — the
  `humIslandTags` transform stamps `{ name, file, exportName }` under
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
  it detects the Cloudflare plugin by name (`vite-plugin-cloudflare:dev`) and
  leaves the request to it, answering only the client runtime URL. That URL is
  registered before Vite's own middlewares, so the order the plugins are listed
  in does not matter. The Vite dev script is emitted by the document render
  (development only, never in a partial response) rather than spliced into the
  response, because a runtime rendering elsewhere has no response to splice.
- `createApp(config)` creates the Hono app for projects that do not have their
  own `server.ts`. Keep it a wrapper around `mountHum(app, config)` so both
  paths share routing behavior.
- Every build has the same shape: `<outDir>/server.js`, `<outDir>/package.json`
  and `<outDir>/public/`, where `public/_hum` holds the client assets and the
  project's `public/` files are copied in beside them. `/_hum` addresses them, so
  the output directory is never part of an asset URL — it may be `dist`,
  `wwwroot` or anything else, and `assetsBase` in the build is a constant rather
  than something derived from `outDir`. The client build's intermediate output
  (`<outDir>/.hum-client`, including Vite's manifest) is copied into
  `<outDir>/public/_hum` and then deleted, so the deployed output directory
  carries nothing that is not published. `outDir` defaults to `dist`.
- Production server builds bundle npm dependencies into relocatable ESM chunks.
  Verify the built tree runs from a different directory, and under a different
  directory name, without `node_modules`. The server entry locates nothing on
  disk — the build is inlined into the bundle — and the client asset URL comes
  from `assetsBase` in that build, so neither may be derived from a directory
  name at runtime.
- The output directory's `public/` tree is served from the deployment root: it is
  what the dev server answers for the project's `public/` directory and what a
  built app mounts `@hono/node-server/serve-static` for (see
  `packages/docs/server.ts` and the scaffold). The built app resolves this
  directory as a sibling of its server entry, so renaming or moving the output
  needs no runtime environment variable. Normally static requests are delegated
  to a reverse proxy, a CDN, or a platform asset binding. Only that tree is
  public: the server bundle sits next to it and must stay unreachable over HTTP,
  which `tools/test-standalone-deploy.mjs` asserts in both directions.

## Development and Validation

Requires Node.js 20 or later and pnpm.

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
