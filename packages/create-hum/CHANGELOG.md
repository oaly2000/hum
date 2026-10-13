# create-hum

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
