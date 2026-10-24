# {{name}}

A [Hum](https://github.com/) app: static HTML first, islands for interaction.

```bash
npm install
npm run dev      # Custom Hono server with Vite SSR + HMR middleware
npm run build    # client assets + server ESM modules into dist/
npm start        # run the built server
```

The production server is emitted as ESM modules. npm dependencies stay external,
so deploy `dist/` with the project's `package.json` and lockfile and install its
production dependencies. The output's own `package.json` only marks ESM; it does
not list dependencies. Native addons and packages that load their own resources
use the installed `node_modules` as they would in any Node app.

```
dist/
  server.js     the entry point
  app.js        the Hono application
  routes/       compiled routes
  islands/      compiled server-side islands
  _generated/   generated Hum build and route modules
  package.json  {"type": "module"}
  public/       served from the deployment root
    _hum/       Hum's client assets (runtime, islands, styles)
    …           the files you put in public/
```

Hum renders the client asset URLs the build recorded (under `/_hum/`, next to
the server entry) but does not serve them itself: `app.ts` answers the
requests for the sibling `public/` directory with
`@hono/node-server/serve-static`. The path is resolved relative to the server
module, so a renamed or relocated output directory needs no extra configuration
when its production dependencies remain available to Node.
Delegate static files to a reverse proxy or a CDN in production. Only `public/`
is public — the server entry sits next to it and stays unreachable. Node.js
20.19 or newer (or 22.12 or newer) is required.

For deployment without `node_modules`, set `standalone: true` in the Hum plugin
options. This bundles server dependencies into a relocatable ESM `server.js` and
requires dependencies that support bundling. The client assets are bundled in
both modes. Include any application resources loaded through runtime-computed
paths in your deployment as well.

## Hono server

`app.ts` creates the Hono app, registers middleware and APIs, then explicitly
calls `await mountHum(app, { ...config, pages })`. The config comes from `virtual:hum/build`,
which also registers the discovered routes, islands and client assets.
Hum handles unmatched requests with `_404`; page errors use `_error`, while API
errors use the app's Hono `onError`.

`server.ts` imports that app and calls `serve()` directly. The production build
compiles this entry without invoking any special exports. Development uses
`hum({ devEntry: "app.ts" })` so Vite owns the listener and does not run the Node
startup code. The example includes `/api/health`.

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
styles.css      Tailwind CSS entry point, imported by routes/_app.tsx
vite-env.d.ts   Vite and Hum virtual module types
public/         files served from / in dev, and copied into the build
app.ts          Hono app with explicit Hum mounting
server.ts       Node listener
```

## Static files

Anything in `public/` is served from the site root in development and copied into
the build's `public/` directory, so `/favicon.svg` means the same file before and
after a build. Hum's own client assets (the runtime, island chunks, stylesheets)
are handled for you and do not belong there.

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
Full HTML and Partial responses are embedded in the generated build module and
served by Hono. Development always renders fresh output.

## Tailwind CSS

The basic template includes Tailwind CSS v4. Global styles are linked from
`routes/_app.tsx` using `import "../styles.css"`; add or edit utility classes in your routes
and islands. No user client entry is needed.

## Head

Route files export `head` — either a JSX fragment or a function of the route
props. `_app.tsx` provides the defaults, pages override them by tag.

```tsx
export const head = <title>Home</title>;

export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}
```
