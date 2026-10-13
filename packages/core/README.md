# @humjs/core

Hum's core framework package for server-rendered Preact applications.

## Entry points

- `@humjs/core` is the server/framework API. It includes app setup, route
  helpers, and the request-scoped `page()` helper. Do not import it from a
  browser island.
- `@humjs/core/shared` is safe to import in both server-rendered routes and
  browser code. It exports `IS_BROWSER`, `Partial`, `PartialProps`, and `asset`.
  Shared helpers are intentionally not re-exported from the root or runtime
  entry points, so their import location is unambiguous.
- `@humjs/core/runtime` is the browser runtime used by Hum's generated client
  entry. It installs client navigation and exposes hydration functions; it is
  not a server-safe substitute for `@humjs/core/shared`.

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).
