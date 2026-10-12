# {{name}}

A [Hum](https://github.com/) app: static HTML first, islands for interaction.

```bash
npm install
npm run dev      # Custom Hono server with Vite SSR + HMR middleware
npm run build    # client + server bundles into _hum/
npm start        # run the built server
```

The production server bundle includes its npm dependencies, so the runtime
deployment does not need the project's `node_modules`. The generated `_hum/`
directory can move or even be renamed — it locates itself next to the server
bundle — as long as its internal structure is kept and `server/server.js` is the
entry point. Client assets stay reachable under `/_hum/`, the URL recorded in
the build manifest. Node.js 20 or newer is still required.

## Hono server

`server.ts` exports a Hono app. Configure middleware and API routes with the
normal Hono API; Hum mounts its file-based routes directly onto that app and
handles unmatched requests with its `_404` page.
Hum page errors use `_error`; API errors keep using the app's Hono `onError`.
Vite owns the development listener, preserving SSR and HMR. In production the
generated entry starts the exported app. The example includes a `/api/health`
route.

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
server.ts       Hono app with middleware and API routes
```

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
