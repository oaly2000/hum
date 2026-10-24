# @humjs/core

The runtime and route APIs for Hum applications: server-rendered Preact pages,
Hono request handlers, file-route modules, and the browser runtime contract.

For a project setup walkthrough, start with the
[getting started guide](https://hum.runasp.net/docs/getting-started). For
framework concepts and examples, see the
[Hum documentation](https://hum.runasp.net/docs/routing).

## Install

```sh
npm install @humjs/core preact hono
```

Most applications should use the
[`@humjs/vite-plugin`](https://www.npmjs.com/package/@humjs/vite-plugin) and
`create-hum` rather than wiring the core runtime by hand.

## Entry points

- `@humjs/core` is the server/framework API. It includes app setup, route
  helpers (`define`, `defineBuild`), `page()` for request-local view data,
  `createApp()` / `mountHum()`, error types, and streaming helpers
  (`createResource`, `Suspense`). Use it in routes, server setup, and server
  rendering code. Do not import it from browser islands.
- `@humjs/core/shared` is safe to import in both server-rendered routes and
  browser code. It exports `defineIsland`, `IS_BROWSER`, `Partial`, `PartialProps`, and `asset`.
  Shared helpers are intentionally not re-exported from the root or runtime
  entry points, so their import location is unambiguous. `Partial` marks a
  region for partial navigation; `asset()` resolves a public asset URL.
- `@humjs/core/events` exports serializable event factories for page-level
  reactive bindings, including `add`, `setValue`, `toggle`,
  `setFromProp`, and `defineFactory`. Import this entry only where those event
  helpers are needed.
- `@humjs/core/runtime` is the browser runtime used by Hum's generated client
  entry. It installs client navigation and exposes hydration functions; it is
  not a server-safe substitute for `@humjs/core/shared`.
- `@humjs/core/routing` exports route-file and path-matching helpers. It is
  primarily useful to integrations and tooling rather than application routes.

## Islands

Declare islands with `defineIsland(Component)` from `@humjs/core/shared` in a
project module, including a route file. Declare it at module scope; exporting is optional. The Vite plugin generates
its ID and client registration. Named and default exports are supported, with
multiple declarations per module. No special directory or client-entry import
is required. Directory placement never registers an island; wrap existing island
exports with `defineIsland` when migrating. The plugin extracts the declaration's
same-file dependencies into a browser module and excludes unrelated server code.
Extracted imports must be browser-safe.

Top-level `defineFactory(fn)` declarations from
`@humjs/core/events` use the same extraction. Modules for factories used in a
response load before payload revival, including partial navigation; no manual
client-entry import is needed. IDs are generated from file paths and declaration
bindings; exporting is optional.
Pass per-request data and signals as factory arguments.

## Typical route

```tsx
import { define, page } from "@humjs/core";

export const handlers = define.handlers({
  GET: async (c) => page({ name: c.req.query("name") ?? "world" }),
});

export default define.page<{ name: string }>(({ data }) => (
  <h1>Hello, {data.name}!</h1>
));
```

The handler receives Hono's context. `page(data)` carries request-local data to
the route's default view as its `data` prop; it does not add framework-specific
fields to Hono's context. A handler may also return a normal `Response`, such as
`c.json(...)` or `c.redirect(...)`.

## Resources across route layers

For data shared between a directory middleware and its layout or page, define a
typed key in a module imported by both route files:

```tsx
// routes/admin/_components/resources.ts
import { createResourceKey } from "@humjs/core";

export const accountKey = createResourceKey<{ name: string }>("admin.account");
```

Register the request-specific fetch in the directory middleware. Descendant
layouts and pages can retrieve the same `Resource<T>` from the request context:

```tsx
// routes/admin/_middleware.ts
import { registerResource, type HumMiddleware } from "@humjs/core";
import { accountKey } from "./_components/resources.js";

const middleware: HumMiddleware = async (c, next) => {
  registerResource(accountKey, () => loadAccount(c));
  await next();
};

export default middleware;
```

```tsx
// routes/admin/_layout.tsx
import { getResource, Suspense } from "@humjs/core";
import type { ComponentChildren } from "preact";
import { accountKey } from "./_components/resources.js";

export default function AdminLayout(
  { children }: { children?: ComponentChildren },
) {
  return (
    <Suspense
      resource={getResource(accountKey)}
      fallback={<p>Loading account…</p>}
      errorFallback={<p>Could not load account.</p>}
    >
      {(account) => <section>Welcome, {account.name}{children}</section>}
    </Suspense>
  );
}
```

Resources are scoped to one request and shared through AsyncLocalStorage, so
parallel requests do not share values. Registering the same key more than once
in one request throws; layouts and middleware must import the same key object,
and a key must be registered before a layout or page reads it. The existing
`streaming: true` route option lets `Suspense` stream its fallback while the
resource is pending. Resource values are server-side and are not serialized
into island props.

## Runtime boundaries

- Keep server-only APIs from `@humjs/core` out of browser island modules. Import
  shared browser/server helpers from `@humjs/core/shared`.
- Import the generated runtime from `@humjs/core/runtime` only when building a
  custom client integration; the Vite plugin wires this entry for regular apps.
- Island components are rendered on the server and hydrated in the browser.
  Put browser-only effects in island lifecycle code, not in module-level code
  that also executes during server rendering.

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).

## Stylesheets

Import global styles in `_app`, shared styles in layouts, or page styles in
routes and components (`import "./page.css"`). CSS Modules export scoped class
names (`import styles from "./page.module.css"`). The Vite plugin automatically
adds stylesheet links for the active render chain and static dependencies.
Styles do not require a manual head link, user client entry or island. Partial
navigation awaits new stylesheet loads before committing DOM changes and keeps
loaded styles available for surviving regions.
