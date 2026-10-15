# Hum

[中文](./README.zh.md)

Hum is a server-side rendering framework built on [Preact](https://preactjs.com)
and [Hono](https://hono.dev).

Most of its inspiration and a good part of its code come from
[Fresh](https://usefresh.dev). It keeps Fresh's distinctive
[Partial](https://usefresh.dev/docs/advanced/partials) mechanism and adds a few
improvements and features of its own.

## Getting started

```sh
pnpm dlx create-hum my-app     # or: npm create hum@latest my-app
```

The scaffold generates a project like this:

```
routes/
  _app.tsx       document shell (html/head/body) + default head tags
  _404.tsx       not found page
  index.tsx      /
  ...
islands/
  Counter.tsx    interactive component
client/
  main.ts        client entry; imports global CSS
  style.css      global styles
public/          served from / in dev; copied into the build's public/
server.ts        Hono app with middleware and API routes
vite.config.ts   plugins: [hum(), tailwindcss()]
```

Projects use Vite for dev/build, and the build output can be run directly with
`node dist/server.js`. The output directory has one shape wherever it is
deployed:

```
dist/                 the output directory; `outDir` in the plugin options
  server.js           the app, with npm dependencies bundled
  package.json        {"type": "module"}, so Node runs server.js as ESM
  public/             served from the deployment root
    _hum/             Hum's client assets (runtime, islands, styles)
    …                 whatever the project's public/ directory holds
```

The directory itself is never addressed: Hum's client assets live in
`public/_hum` next to the server entry, so the same build runs whether it is
deployed as `dist`, `wwwroot` or anything else. Production emits a single server
JavaScript file with npm dependencies bundled; Node built-ins remain external.
The app serves its `public/` tree (see `server.ts`, which mounts
`@hono/node-server/serve-static` for it) — in production that is normally
delegated to a reverse proxy, a CDN, or a platform asset binding.

Whether a build runs itself is up to `server.ts`, not to a plugin option. It
default-exports the app — a Hono instance *is* its fetch handler — and the build
exports that app; when it also exports `start(app)`, Hum calls it once the file
routes are mounted, and that is the build's entry point. `pnpm dlx create-hum
my-worker --template cloudflare` scaffolds a project whose `server.ts` exports no
`start`: the built module is a Worker the runtime calls, and `wrangler.jsonc`
points `main` at `dist/server.js` and publishes `dist/public` through the
Worker's static asset binding. A Node deployment exports `start` and binds a
port there. Development is Vite on Node in both templates.

## Static files

Files in `public/` are served from the site root in development and copied into
the build's `public/` directory, so `/favicon.svg` means the same file before
and after a build. Only that directory is public: the server entry sits next to
it, never inside it. Everything Hum itself publishes — the client runtime,
island chunks, stylesheets — is already covered by the framework and does not
belong in `public/`.

## File-based routing

Every file under `routes/` produces a URL based on its relative path.

| File path                     | URL                        |
| ----------------------------- | -------------------------- |
| `routes/index.tsx`            | `/`                        |
| `routes/about.tsx`            | `/about`                   |
| `routes/blog/[id].tsx`        | `/blog/:id`                |
| `routes/docs/[...slug].tsx`   | `/docs/*` (zero or more)   |
| `routes/[[lang]]/about.tsx`   | `/about` or `/:lang/about` |
| `routes/(marketing)/a.tsx`    | `/a`                       |

- `[id].tsx` matches a single dynamic segment, read through Hono's context.
- `[[id]].tsx` is an optional segment: the route matches with or without it.
- `[...slug].tsx` is a wildcard segment, matching zero or more remaining
  segments.
- `(group)/` directories are transparent groups; they never appear in the URL.
- Static routes take precedence over dynamic matches.

**Special files** contribute extra behavior through the route tree:

- `_app.tsx` — the outer document shell (`<html>`, `<head>`, `<body>`); the
  deepest one in the tree wins.
- `_layout.tsx` — wraps pages in its directory and below; layouts nest from the
  routes root down to the matched route.
- `_middleware.ts` — applies to routes below it (see [Middleware](#middleware)).
- `_error.tsx` (alias `_500.tsx`) — renders route errors.
- `_404.tsx` — handles unmatched paths under its directory subtree.

Two files outside `routes/` configure the project rather than the route tree:
`server.ts` is your Hono app, and `client/main.ts` is the default client entry.
The `public/` directory is the third: it is where static files the app serves
unchanged live.

Directories named `_components/` and `_islands/` are excluded from route
discovery, so you can co-locate reusable components with a route branch and
import them by relative path.

A component becomes an island when it lives in `islands/` or a route-local
`_islands/` directory and is used by a page.

Standalone island modules are loaded when their server-rendered root is within
200 pixels of the viewport, then hydrated. Until that point the HTML is visible
but its island behavior is not active. If `IntersectionObserver` is unavailable
or the island has no observable element, Hum activates it eagerly. An island
whose markup is owned by a partial or a page-level reactive element is loaded
eagerly so its enclosing Preact tree can be restored.

### Head tags and SEO

Fresh's `head` injection mechanism is fairly complex; Hum improves on it. `head`
is exported by each route file and can be a JSX fragment or a function that
receives the route props; it overrides the defaults from `_app.tsx` by tag.

```tsx
export const head = define.head(<title>Home</title>); // `define` is just a helper for type checking

export function head({ params }: RouteProps) {
  return <title>Blog {params.id}</title>;
}
```

### handlers and forms

Export a `handlers` object keyed by HTTP method. Each handler receives the raw
Hono `Context` and can either return a `Response` or render the page in the same
file with `page(data)`. When no `handlers` is defined, the default-exported view
is rendered.

```tsx
import { define, page, type Handlers } from "@humjs/core";

export const handlers: Handlers = {
  GET: async (c) => {
    const post = await loadPost(c.req.param("id"));
    return page({ post });
  },
  POST: async (c) => {
    const form = await c.req.formData();
    await savePost(form);
    return c.redirect("/blog");
  },
};

export default define.page<{ post: { title: string } }>(({ data }) => (
  <article><h1>{data.post.title}</h1></article>
));
```

### Middleware

`_middleware.ts` is a directory-scoped mount point for Hono middleware: the
default export is a [Hono middleware](https://hono.dev/docs/guides/middleware),
and the directory the file lives in decides where it runs. It applies to Hum
file routes in that directory and below, parent middleware is inherited, and the
chain runs from the routes root down to the matched route, wrapping the route's
`handlers` and its default view. It also wraps the `_404` render for unmatched
paths under its directory, so a branch guard covers typos in that branch too. It
does not apply to Hono API routes declared in `server.ts`.

```ts
// routes/admin/_middleware.ts
import { define } from "@humjs/core";

export default define.middleware(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) {
    return c.redirect("/login"); // returning a Response short-circuits
  }
  c.set("user", session.user);
  await next();
});
```

For app-wide or URL-prefix policy, register Hono middleware with `app.use()` in
`server.ts` instead. That is the general alternative: it wraps both Hum pages and
Hono API routes, and a path pattern selects what it applies to. Reach for
`_middleware.ts` only when the policy belongs to a branch of Hum's route tree,
such as a URL-transparent `(group)/` directory, which a Hono path pattern cannot
express.

```ts
// server.ts
const app = new Hono();

app.use("/api/*", cors());
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  c.header("x-response-time", `${(performance.now() - start).toFixed(1)}ms`);
});

export default app;
```

Hum is built on Hono, and the Vite plugin registers Hum after `server.ts`.
Because of that, API errors raised by Hono are still handled by the app's
`onError`, while Hum errors render `_error.tsx`.

### Client navigation and Partial

See the
[Fresh documentation](https://usefresh.dev/docs/advanced/partials) directly. You
can also compare Hum's [documentation](https://hum.runasp.net/docs/partials) and
its [source](./packages/docs/routes/docs/partials/[[topic]].tsx).

The opt-in attribute is `data-hum-client-nav`; setting it to `"false"` switches
client navigation off for that subtree.

### Page-level reactivity

A page-level facet is a signal or a handler bound to a single node of the page's
markup. A signal written into the markup is bound in the browser without a
component of your own: render it as a child and it stays a live text node, pass it
as a prop and the matching DOM property follows it, and point a handler at it to
write back.
The server renders the value into that response—so it may come from the
request—and the client revives its own copy from the payload. State that has to
survive a re-render, hooks, and anything else a component instance owns is still
island work.

```tsx
import { signal } from "@preact/signals";
import { add, setFromProp } from "@humjs/core/events";

export default function Checkout() {
  const tickets = signal(2);

  return (
    <form>
      <button type="button" onClick={add(tickets, -1, { min: 1, max: 8 })}>−</button>
      <output>{tickets}</output>
      <button type="button" onClick={add(tickets, 1, { min: 1, max: 8 })}>+</button>
      <input type="number" value={tickets} onInput={setFromProp(tickets, "value")} />
    </form>
  );
}
```

A handler is rebuilt in the browser, so it travels as a factory name plus the
arguments it was called with; a closure cannot be serialized and throws at render
time. `@humjs/core/events` ships `add(signal, delta, options)`,
`setValue(signal, value)`, `toggle(signal)` and `setFromProp(signal, key)`; a
handler of your own is a factory created with `defineFactory(name, fn)`.

```ts
// client/factories.ts — imported by client/main.ts as well, so the browser has it
import { defineFactory } from "@humjs/core/events";
import type { Signal } from "@preact/signals";

/** Resets both options at once; each built-in factory drives one signal. */
export const resetOrder = defineFactory(
  "resetOrder",
  (
    tickets: Signal<number>,
    giftWrap: Signal<boolean>,
    defaults: { tickets: number; giftWrap: boolean },
  ) =>
    () => {
      tickets.value = defaults.tickets;
      giftWrap.value = defaults.giftWrap;
    },
);
```

The name is what travels to the client, so keep it unique and stable. Import the
module that defines the factory from the client entry or from an island—otherwise
the page throws
`Hum: the handler factory "…" is not registered on the client`.

See Hum's [documentation](https://hum.runasp.net/docs/facets) and its
[source](./packages/docs/routes/docs/facets.tsx).

### Streaming

Streaming SSR is an optional advanced capability. In some cases `handlers` may
need to load slow data, which means nothing is returned until that data is
ready — hardly ideal. Streaming rendering can be enabled through an optional
config.

```tsx
import {
  createResource,
  define,
  page,
  Suspense, // a wrapper around Preact's Suspense component and error boundary
  type Resource,
} from "@humjs/core";

type PageData = { profile: Resource<{ name: string }> };

export const config = define.config({ streaming: true }); // config

export const handlers = define.handlers({
  GET: (c) => page({
    profile: createResource(loadProfile(c.req.param("id"))),
  }),
});

export default define.page<PageData>(({ data }) => (
  <Suspense
    resource={data.profile}
    fallback={<p>Loading profile…</p>} // shown while the resource is pending
    errorFallback={(error) => ( // the resource rejected or a child threw
      <p role="alert">Could not load: {String(error)}</p>
    )}
  >
    {(profile) => <ProfilePanel profile={profile} />}
  </Suspense>
));
```
