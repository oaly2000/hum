# @humjs/core

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
