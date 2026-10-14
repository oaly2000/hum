# {{name}}

A [Hum](https://github.com/oaly2000/hum) app on Cloudflare Workers: static HTML
first, islands for interaction.

```bash
npm install
npm run dev      # Vite dev server with SSR and HMR, rendering inside workerd
npm run build    # client + server bundles into dist/
npm run preview  # run the built Worker locally on workerd
npm run deploy   # publish the Worker and its assets
```

The build is one JavaScript file with its npm dependencies bundled, plus the
public tree it publishes:

```
dist/
  server.js     the Worker entry; exports the app's fetch handler
  package.json  {"type": "module"}
  public/       published by the asset binding, served from the site root
    _hum/       Hum's client assets (runtime, islands, styles)
    …           the files you put in public/
```

`wrangler.jsonc` points wrangler at that layout: `main` is the server bundle and
`assets.directory` is the public tree. A request that matches a file there never
reaches the Worker, so `/_hum/...` is answered by the platform and the app only
sees the paths it routes. Everything else falls through to the Worker, which is
what keeps Hum's file routing and its `_404` page in charge. Only `public/` is
published: the server bundle sits next to it, outside the asset directory, so it
stays unreachable over HTTP.

## Development runs on workerd

The dev server renders pages inside workerd, the runtime that will serve them,
so this project's bindings are available while developing and a dependency that
needs Node fails where production would fail rather than in development only.
Vite still owns the module graph, HMR and the client assets; the Cloudflare
plugin takes the page requests.

That is why `vite.config.ts` loads `@cloudflare/vite-plugin` only while serving:
the production build stays Hum's own, which is what keeps `npm run build` at one
server bundle plus a public tree. It also points the plugin at `dev-worker.ts`,
because `main` in `wrangler.jsonc` names the *built* entry — the same app, but
mounted from the build. `npm run preview` then runs that build, so a change that
only works in development is caught before deploying.

`dev-worker.ts` mounts that app on an app of its own instead of onto `server.ts`'s
app. The dev runtime re-runs the worker's entry file on every change, while the
app module it imports stays in the module cache, and Hono takes no route once a
request has matched on its router: mounting the cached app again fails, where
mounting a fresh app that the project's app is routed into keeps serving the
edited page — and a page added while the server runs.

The runtime imports `node:async_hooks` and `node:path`; `compatibility_flags:
["nodejs_compat"]` in `wrangler.jsonc` is what provides them, so keep the flag
when changing `compatibility_date`. If wrangler reports that the date is newer
than the runtime it ships supports, upgrade wrangler or lower the date.

Workers Free allows 10 ms of CPU per request, which server rendering can exceed
under load; Workers Paid allows far more.

## Hono server

`server.ts` exports a Hono app. Configure middleware and API routes with the
normal Hono API; Hum mounts its file based routes directly onto that app and
handles unmatched requests with its `_404` page. Hum page errors use `_error`;
API errors keep using the app's Hono `onError`. The example includes a
`/api/health` route.

It exports no `start(app)`, which is what makes this a Worker build: the app is
the build's export and the runtime calls its `fetch`, so nothing binds a port.
Export one and the same project becomes a process that serves itself.

## Layout

```
routes/
  _app.tsx      document shell (html/head/body)
  _404.tsx      not found page
  index.tsx     /
  seo.tsx       /seo
  blog/[id].tsx /blog/:id
islands/
  Counter.tsx   interactive component
client/
  main.ts       client entry; imports global CSS
  style.css     Tailwind CSS entry point
public/         files served from / in dev, and published by the asset binding
server.ts       Hono app with middleware and API routes
dev-worker.ts   what the dev server loads: the same app, mounted on workerd
wrangler.jsonc  Worker name, entry point and asset directory
```

## Static files

Anything in `public/` is served from the site root in development and published
by the asset binding in production, so `/favicon.svg` means the same file before
and after a build. Hum's own client assets (the runtime, island chunks,
stylesheets) are handled for you and do not belong there.

## Tailwind CSS

The template includes Tailwind CSS v4. Global styles are imported from
`client/main.ts`; add or edit utility classes in your routes and islands.

## Head

Route files export `head` — either a JSX fragment or a function of the route
props. `_app.tsx` provides the defaults, pages override them by tag.

```tsx
export const head = <title>Home</title>;

export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}
```
