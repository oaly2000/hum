# {{name}}

A [Hum](https://github.com/) app: static HTML first, islands for interaction.

```bash
npm install
npm run dev      # Custom Hono server with Vite SSR + HMR middleware
npm run build    # client + server bundles into dist/
npm start        # run the built server
```

The production server is emitted as one JavaScript file with its npm
dependencies bundled, so the runtime deployment does not need the project's
`node_modules`. The generated output directory can move or even be renamed — it
holds everything the deployment needs:

```
dist/
  server.js     the entry point
  package.json  {"type": "module"}
  public/       served from the deployment root
    _hum/       Hum's client assets (runtime, islands, styles)
    …           the files you put in public/
```

Hum renders the client asset URLs the build recorded (under `/_hum/`, next to
the server entry) but does not serve them itself: `server.ts` answers the
requests for the sibling `public/` directory with
`@hono/node-server/serve-static`. The path is resolved relative to the server
entry, so a renamed or relocated output directory needs no extra configuration.
Delegate static files to a reverse proxy or a CDN in production. Only `public/`
is public — the server entry sits next to it and stays unreachable. Node.js
20.19 or newer (or 22.12 or newer) is required.

## Hono server

`server.ts` exports a Hono app. Configure middleware and API routes with the
normal Hono API; Hum mounts its file-based routes directly onto that app and
handles unmatched requests with its `_404` page.
Hum page errors use `_error`; API errors keep using the app's Hono `onError`.
Vite owns the development listener, preserving SSR and HMR. In production the
generated entry calls the app's `start(app)` export — this template's — which is
what binds the port; a project that exports no `start` hands the app to whatever
calls its `fetch` instead. The example includes a `/api/health` route.

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
public/         files served from / in dev, and copied into the build
server.ts       Hono app with middleware and API routes
```

## Static files

Anything in `public/` is served from the site root in development and copied into
the build's `public/` directory, so `/favicon.svg` means the same file before and
after a build. Hum's own client assets (the runtime, island chunks, stylesheets)
are handled for you and do not belong there.

## Tailwind CSS

The basic template includes Tailwind CSS v4. Global styles are imported from
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
