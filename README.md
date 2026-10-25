# Hum

[![Node.js docs](https://img.shields.io/badge/Documentation-Node.js-339933?logo=nodedotjs&logoColor=white)](https://hum.runasp.net/)
[![Cloudflare docs](https://img.shields.io/badge/Documentation-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://hum-docs.oaly2000.workers.dev/)

Hum is an ESM SSR framework built with [Preact](https://preactjs.com),
[Hono](https://hono.dev) and Vite for Node.js and edge runtimes. It renders HTML
on the server and adds client JavaScript for explicitly declared islands and
reactive bindings. Inspired by [Fresh](https://usefresh.dev), including its
[Partial](https://usefresh.dev/docs/advanced/partials) mechanism.

Requires Node.js **22.18+** for development/builds. This workspace uses pnpm.

## Getting started

```sh
npm create hum@latest my-app
cd my-app
npm install
npm run dev
```

Edit `routes/index.tsx`, then build and start with `npm run build` and `npm start`.
The scaffold includes a Counter island, route handlers and Tailwind CSS.

```text
routes/
  _app.tsx       HTML document shell; imports global CSS
  _404.tsx       not-found page
  index.tsx      home page
islands/         example island components (placement is optional)
public/          static files served from the site root
styles.css       global styles
app.ts           Hono app, middleware, APIs and Hum mounting
server.ts        Node listener
vite.config.ts   hum({ devEntry: "app.ts" }) and CSS plugins
```

[Getting started guide](https://hum.runasp.net/docs/getting-started)

## Application and deployment

### Digital store example

[`packages/store`](./packages/store/README.md) is a digital-goods shop using Hum,
Better Auth, SQLite, and the official Creem TypeScript SDK in test mode. It covers
product filtering, shared-signal islands, hosted checkout, verified webhooks,
order history, and private downloads.

```sh
pnpm --filter hum-store setup:creem --from-cli # requires Creem CLI test login
pnpm build:pkgs
pnpm --filter hum-store dev                  # http://localhost:3001
```

Follow the example's setup guide to forward local payment events. The repository
does not include credentials or a database. Configure the store before building
that example; see its `.env.example` for manual configuration. The store is
excluded from `build:pkgs`, so existing workspace builds need no payment setup.

### Mounting an application

Create the app, register middleware/APIs, then mount Hum once:

```ts
// app.ts
import { Hono } from "hono";
import { mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";

const app = new Hono();
app.get("/api/health", (c) => c.json({ status: "ok" }));
await mountHum(app, config);
export default app;
```

`serverEntry` defaults to `server.ts`. Node entries import the app and call
`serve({ fetch: app.fetch })` from `@hono/node-server`. Set `devEntry: "app.ts"`
so development and prerendering load the mounted app without starting a listener.
Hum handles page errors/404s; API errors use your Hono `onError`.

Build output defaults to `dist/`: `server.js`, an ESM module tree and `public/`.
Run `node dist/server.js` with production dependencies installed. Only `public/`
is HTTP-accessible; project static files keep root URLs such as `/favicon.svg`.
Enable `hum({ standalone: true })` to bundle server dependencies into relocatable
ESM. Native addons and packages requiring installed files need external dependencies.

For Workers, run `pnpm dlx create-hum my-worker --template cloudflare`. Its entry
mounts Hum and exports the app; development uses workerd. Wrangler deploys
`dist/server.js` with `dist/public` as platform assets.

[Deployment guide](https://hum.runasp.net/docs/deployment)

## Routes and handlers

| File | URL / purpose |
| --- | --- |
| `routes/index.tsx` | `/` |
| `routes/blog/[id].tsx` | `/blog/:id` |
| `routes/docs/[...slug].tsx` | `/docs/*`, zero or more segments |
| `routes/[[lang]]/about.tsx` | `/about` or `/:lang/about` |
| `routes/(group)/a.tsx` | `/a` |
| `_app.tsx`, `_layout.tsx` | document shell, nested layout |
| `_middleware.ts` | Hono middleware for the directory subtree |
| `_error.tsx` / `_500.tsx`, `_404.tsx` | page errors, unmatched paths |

Static matches take precedence. `_components/` and `_islands/` are excluded from
routing. Directory middleware wraps pages and branch 404s; use `app.use()` for
policies shared with API routes.

Handlers receive Hono `Context`; return a Response or `page(data, options)`:

```tsx
import { define, page } from "@humjs/core";

export const handlers = define.handlers({
  GET: async (c) => page({ title: `Post ${c.req.param("id")}` }),
});

export default define.page<{ title: string }>(({ data }) => <h1>{data.title}</h1>);
```

Export `head` as JSX or a synchronous function of route props to override document
head tags. `define.head<Data>(({ data }) => ...)` types the same `page(data)` payload
used by `define.page<Data>()`; await database queries in the handler before calling
`page(data)`, then reuse the result in both the head and the view.
See [routing](https://hum.runasp.net/docs/routing),
[handlers/forms](https://hum.runasp.net/docs/handlers) and
[Hono middleware](https://hum.runasp.net/docs/hono).

## Islands and page-level reactivity

Declare islands at module scope, then import/render them like ordinary components:

```tsx
import { defineIsland } from "@humjs/core/client";
import { useSignal } from "@preact/signals";

export const Counter = defineIsland(({ start = 0 }: { start?: number }) => {
  const count = useSignal(start);
  return <button onClick={() => count.value++}>{count}</button>;
});
```

Named/default exports, re-exports and multiple declarations per module work;
exports are optional for local use. Declarations can live beside server handlers:
Hum extracts their used same-file dependencies into client slices. Imported
modules must be browser-safe; unsupported mutable/effectful dependencies fail
compilation. Pass request-specific data through props/arguments.

IDs derive from declaration file/binding; aliases and body edits preserve them,
while moves/renames can change them. No manual ID, client entry or special directory
is needed. Independent roots hydrate within 200px of the viewport; roots owned by
partials/reactive elements load eagerly. Missing observer support falls back to eager.

For page-level signals and DOM handlers, use `signal` from `@preact/signals` and
`add`, `setValue`, `toggle`, `setFromProp` from `@humjs/core/client`. Custom handlers
use module-level `defineFactory(fn)` from `@humjs/core/client`; pass signals/data
as arguments rather than serializing closures. Hum loads used factories
automatically and preserves shared signal identity across islands, bindings
and partials.

[Reactivity and factory examples](https://hum.runasp.net/docs/facets)

## Partial navigation

Wrap update regions in named `Partial` components and opt in on an ancestor:

```tsx
import { Partial } from "@humjs/core/client";

export default function Page() {
  return <main data-hum-client-nav>
    <a href="/topics?topic=hono">Hono</a>
    <Partial name="topic"><p>Current topic</p></Partial>
  </main>;
}
```

Links/forms fetch server-rendered partials and replace matching regions.
Response parsing and updates load on demand at the first partial navigation.
`data-hum-client-nav="false"` opts a subtree out. Successful updates reconcile
history; failures retain the current page/URL. View Transitions are used when
available. [Partial guide](https://hum.runasp.net/docs/partials)

GET forms put submitted controls in the browser URL and add a history entry,
so refresh and Back preserve filters. An explicit `data-hum-partial` endpoint
may use a different path or extra query parameters without exposing them in
the browser URL. POST forms retain their existing history entry.

## Rendering modes

SSR is the default. Select SSG or ISG per page:

```ts
import { define } from "@humjs/core";

export const config = define.config({
  render: { mode: "ssg", slugs: ["hello"] },
  // Or: render: { mode: "isg", revalidate: 60, slugs: ["hello"] }
});
```

Dynamic SSG requires `slugs`; parameter-free routes generate automatically.
ISG can generate unlisted paths on demand; `fallback: false` restricts the table.
Failed regeneration retains old output. `mountHum` supplies an in-memory page
service; use `createPageService({ store, background })` for persistence/background
updates and `prerenderOrigin` for the canonical build origin.

Generated pages are public GET responses without request-specific credentials or
query parameters; keep personalized pages and guards on SSR. App middleware still
runs on cache hits. Development always renders fresh pages. Builds embed HTML and
partial responses and require the app server, not pure static hosting.

[SSR/SSG/ISG guide](https://hum.runasp.net/docs/generation)

## CSS and streaming

Import CSS directly from `_app`, layouts, pages or components. Hum links static
style dependencies automatically, including on pages without client JavaScript.
Vite handles Tailwind/PostCSS, CSS Modules and assets. Partial navigation waits
for new styles before updating DOM and retains loaded styles. Dynamic-only imports
are outside automatic SSR style discovery; CSS Module edits reload dev HTML.

Experimental streaming SSR uses `define.config({ streaming: true })`,
`createResource` and Hum's `Suspense`; it is unavailable in SSG/ISG.
[Streaming examples](https://hum.runasp.net/docs/streaming)
