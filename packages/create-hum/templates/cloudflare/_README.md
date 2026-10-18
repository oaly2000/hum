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

The template selects `hum({ standalone: true })` so npm dependencies are bundled
into `server.js` and no `node_modules` is deployed. The build also includes the
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
the production build stays Hum's own server output plus a public tree. It
points the plugin at source `server.ts`,
while `main` in `wrangler.jsonc` names the built entry. Both use the same app
module, which creates a Hono instance and explicitly mounts Hum. Route discovery
changes invalidate that dependency and recreate the app. `npm run preview` runs
the built Worker before deployment.

The runtime imports `node:async_hooks` and `node:path`; `compatibility_flags:
["nodejs_compat"]` in `wrangler.jsonc` is what provides them, so keep the flag
when changing `compatibility_date`. If wrangler reports that the date is newer
than the runtime it ships supports, upgrade wrangler or lower the date.

Workers Free allows 10 ms of CPU per request, which server rendering can exceed
under load; Workers Paid allows far more.

## Hono server

`server.ts` exports a Hono app. Configure middleware and API routes with the
normal Hono API, then explicitly call `await mountHum(app, { ...config, pages })` using
`config` from `virtual:hum/build`. Hum
handles unmatched requests with its `_404` page. Hum page errors use `_error`;
API errors keep using the app's Hono `onError`. The example includes a
`/api/health` route.

The production build bundles `server.ts` directly and preserves its exports.
The runtime calls the exported app's `fetch`; nothing binds a port and no
special startup export is needed.

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

## Page generation

The `/seo` page uses `define.config({ render: { mode: "ssg" } })` and is generated
at build time. Dynamic routes require a `slugs` table, for example
`{ mode: "ssg", slugs: ["hello", "world"] }` for `/posts/[slug]`. Multiple
parameters require full paths. Unlisted SSG paths return 404.

Use `{ mode: "isg", revalidate: 60, slugs: ["hello"] }` for incremental generation;
unlisted paths generate on demand unless `fallback: false` is set. The entry's
`createPageService()` controls storage and scheduling. Its default memory store
lasts for the process lifetime; provide a store for persistent ISG output.
A background executor returns stale output while updating; without one the
update blocks. Failed updates retain the last successful page.

Generation runs public GET requests without cookies, authorization or query
parameters. Keep personalized pages on SSR. Configure `prerenderOrigin` on the
Hum Vite plugin for absolute URLs. The build evaluates the application and route
configuration in Node; generated handlers must work without deployment bindings.
Full HTML and Partial responses are bundled into the server output and served
by Hono. Development always renders fresh output.

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
