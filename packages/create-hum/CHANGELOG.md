# create-hum

## 0.1.0

### Minor Changes

- The Cloudflare template's development server renders pages inside workerd, so a
  project develops against the runtime it deploys to and with its bindings
  available. `@cloudflare/vite-plugin` is loaded only while serving — the
  production build stays Hum's own server bundle plus a public tree — and the
  template points it at a new `dev-worker.ts`, because `wrangler.jsonc` names the
  built entry.
- Add a `cloudflare` template, selected with `--template cloudflare`, and a
  `--list` command that shows the templates. The Cloudflare project targets a
  Worker runtime and publishes its client assets through the Worker's static asset
  binding, so it deploys with `wrangler deploy`.
- Decide how a production build runs from the project's entry file instead of a
  plugin option: `server.ts` default-exports the app, the build exports it — a Hono
  instance is its own fetch handler, so a Worker or an edge runtime can import the
  bundle as it is — and the entry's optional `start(app)` export is the build's
  entry point, which Hum calls once the file routes are mounted. `platform` is
  gone: export `start` and the build serves itself, omit it and whatever imports
  the bundle calls `fetch`.

### Patch Changes

- Keep the Cloudflare template's development server working across edits. Its
  dev worker mounts the project's app on an app of its own, because the runtime
  re-runs the worker entry after every change while the app module stays cached
  and Hono takes no route once a request has matched on its router. Mounting Hum
  on an app it already mounted is now refused with a message naming that shape,
  rather than failing inside Hono with nothing about the cause.

## 0.0.7

### Patch Changes

- Separate browser-safe helpers from the framework and client runtime entry points, and keep streamed Suspense content intact across response chunks.

## 0.0.6

### Patch Changes

- Routes, islands and client assets now reach the runtime through the build the
  bundler produced: the generated `virtual:hum/build` module calls `defineBuild`,
  and `mountHum` boots from it. `HumConfig` no longer takes `manifest` or
  `prodManifest`, the production build no longer writes `manifest.json`, and the
  runtime no longer touches the file system at all.

## 0.0.5

### Patch Changes

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

## 0.0.4

### Patch Changes

- Rename the client-navigation opt-in attribute from `f-client-nav` to
  `data-hum-client-nav`, and let it be switched off per subtree with
  `data-hum-client-nav="false"`. Update the scaffold to the new attribute name.

## 0.0.3

### Patch Changes

- Replace the `{{name}}` placeholder in every scaffolded file, including templates that write it as `{{ name }}`, so new projects no longer ship an unresolved title.

## 0.0.2

### Patch Changes

- Move packages to the `@humjs` scope and publish them to npm with Trusted Publishing.
