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
server.ts        Hono app with middleware and API routes
vite.config.ts   plugins: [hum(), tailwindcss()]
```

Projects use Vite for dev/build, and the build output can be run directly with
`node _hum/server/server.js`.

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
- `server.ts` — your Hono app (not under `routes/`).
- `client/main.ts` — the default client entry.

Directories named `_components/` and `_islands/` are excluded from route
discovery, so you can co-locate reusable components with a route branch and
import them by relative path.

A component becomes an island when it lives in `islands/` or a route-local
`_islands/` directory and is used by a page.

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
import { define, page, type Handlers } from "@hum/core";

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

A Hum `_middleware.ts` only applies to Hum file routes in its directory and
below. Parent middleware is inherited and the chain runs from the routes root
down to the matched route; it also wraps that route's handlers.

```ts
// routes/admin/_middleware.ts
import { define } from "@hum/core";

export default define.middleware(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) {
    c.res = c.redirect("/login"); // short-circuit
    return;
  }
  c.set("user", session.user);
  await next();
});
```

Hum is built on Hono, and the Vite plugin registers Hum after `server.ts`.
Because of that, API errors raised by Hono are still handled by the app's
`onError`, while Hum errors render `_error.tsx`.

### Client navigation and Partial

See the
[Fresh documentation](https://usefresh.dev/docs/advanced/partials) directly. You
can also compare Hum's [documentation](https://hum.runasp.net/docs/partials) and
its [source](./packages/docs/routes/docs/partials/[[topic]].tsx).

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
} from "@hum/core";

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
