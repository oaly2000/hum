# {{name}}

A [Hum](https://github.com/oaly2000/hum) app on Cloudflare Workers: static HTML
first, islands for interaction.

```bash
npm install
npm run dev      # Vite dev server on Node, with SSR and HMR
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

## Two runtimes

`npm run dev` is Vite on Node; `npm run build` produces a Worker. Routing,
islands, serialization and streaming behave the same in both, but a dependency
that needs Node — `node:fs`, an addon, a package that only works on Node — will
load in development and fail on the platform. `npm run preview` runs the built
Worker on the real runtime, which is the closest thing to production.

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
