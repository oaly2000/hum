# @humjs/vite-plugin

## 0.4.0

### Minor Changes

- `server.ts` is now the server build's entry as written: Hum no longer generates one. It creates its Hono app, imports `virtual:hum/build`, calls `await mountHum(app)` and default-exports the app, and starts its own listener (for example `serve(...)` guarded by `import.meta.env.PROD`). The `start(app)` export and the `cache`/`waitUntil` export convention are removed; pass them to `mountHum` instead. A project without `server.ts` is an error. The Cloudflare template drops `dev-worker.ts`.
- Build ordinary Hono entries directly and add devEntry for applications with separate Node startup modules. Applications now mount Hum explicitly; replace the special start export with a top-level listener call. Simplify Worker templates to use the same application entry in development and production.
- Add unified SSR, SSG and ISG page generation with per-route render configuration and slugs tables. Pre-generate pages during builds, retain shared Partial payloads, and configure incremental storage and background regeneration in the application entry.

### Patch Changes

- Unify build-time static generation and incremental regeneration on a portable response-cache contract.
- Allow selecting a runtime-specific Hono server entry.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @humjs/core@0.5.0

## 0.3.0

### Minor Changes

- Decide how a production build runs from the project's entry file instead of a
  plugin option: `server.ts` default-exports the app, the build exports it — a Hono
  instance is its own fetch handler, so a Worker or an edge runtime can import the
  bundle as it is — and the entry's optional `start(app)` export is the build's
  entry point, which Hum calls once the file routes are mounted. `platform` is
  gone: export `start` and the build serves itself, omit it and whatever imports
  the bundle calls `fetch`.

### Patch Changes

- Hand dev requests to a runtime of their own by asking the `ssr` environment for
  a module runner instead of looking for `@cloudflare/vite-plugin` by name, so an
  adapter of the same kind needs no change here. The half that answers the client
  runtime URL also runs before other plugins' middlewares now, which keeps that
  URL Hum's however the plugins are ordered.
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
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @humjs/core@0.4.1

## 0.2.1

### Patch Changes

- Updated dependencies
  - @humjs/core@0.4.0

## 0.2.0

### Minor Changes

- Routes, islands and client assets now reach the runtime through the build the
  bundler produced: the generated `virtual:hum/build` module calls `defineBuild`,
  and `mountHum` boots from it. `HumConfig` no longer takes `manifest` or
  `prodManifest`, the production build no longer writes `manifest.json`, and the
  runtime no longer touches the file system at all.

### Patch Changes

- Updated dependencies
  - @humjs/core@0.3.0

## 0.1.0

### Minor Changes

- Discover routes and islands with `import.meta.glob`.
  
  The plugin exposes `virtual:hum/routes`, a module that enumerates the routes and
  islands with `import.meta.glob` and turns them into the manifest Hum serves, and
  it writes `.hum/islands.js`, a build input that makes the client build emit one
  chunk per island. Discovery therefore happens inside the bundler's module graph
  in both environments: the development server reads that module instead of
  scanning a directory, and the generated production server entry imports the
  manifest instead of carrying a serialized route table with one absolute path per
  file, which also drops the `node:path` resolution the entry used to do for every
  route at startup.
  
  The plugin no longer depends on `@humjs/core/discovery` — or on `tinyglobby` —
  and it maps island chunks to island names by reading Vite's own manifest, so an
  island cannot be missed or reported with a chunk that does not exist. The
  `HumProject` type and the project field of the plugin context are gone with the
  scan, and a production build reports the island chunks it emitted rather than a
  route and island count it can no longer observe.
  
  Behaviour is unchanged: the same files become routes and islands, the
  development server still picks up added and removed route files, and the build
  manifest keeps its shape.

### Patch Changes

- Read the production manifest in the generated server entry.
  
  The entry calls `readProdManifest(manifestPath(root, outDir))` and passes the
  result as `prodManifest`, which is the manifest Hum used to look up itself. The
  runtime therefore stays off the file system, and the adapter — the part that
  already starts a listener — owns the one remaining read of the build output.
- Updated dependencies
  - @humjs/core@0.2.0

## 0.0.3

### Patch Changes

- Serve the user client entry at the runtime URL in development, so the modules
  that register handler factories are evaluated in the browser, and tag injected
  dev stylesheets with `data-vite-dev-id` so Vite adopts that element instead of
  injecting a duplicate copy.
- Updated dependencies
  - @humjs/core@0.1.0

## 0.0.2

### Patch Changes

- Move packages to the `@humjs` scope and publish them to npm with Trusted Publishing.
- Updated dependencies
  - @humjs/core@0.0.2
