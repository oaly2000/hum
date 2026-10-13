# @humjs/vite-plugin

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
