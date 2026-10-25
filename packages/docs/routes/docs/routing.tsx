import { define, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(
  <title>Routing and rendering — Hum Guides</title>,
);

const routeTreeExample = `routes/
  _app.tsx          the document shell
  _error.tsx        route errors
  _404.tsx          unmatched paths
  index.tsx         /
  docs/
    _layout.tsx     the guides sidebar
    routing.tsx     /docs/routing
    handlers.tsx    /docs/handlers
    facets.tsx
    streaming.tsx
    partials/
      [[topic]].tsx /docs/partials and /docs/partials/<topic>
  _components/
    CodeBlock.tsx   view component, not a route
  _islands/
    Counter.tsx     the island on the home page
`;

const islandExample = `// routes/_islands/Counter.tsx
import { defineIsland } from "@humjs/core/client";
import { useSignal } from "@preact/signals";

export default defineIsland(({ start = 0 }: { start?: number }) => {
  const count = useSignal(start);
  return <button onClick={() => count.value++}>{count}</button>;
});

// routes/index.tsx — the counter on the home page
import Counter from "./_islands/Counter.js";

<Counter start={3} />`;

const middlewareExample = `import { define } from "@humjs/core";

// routes/admin/_middleware.ts — a Hono middleware mounted for this directory
export default define.middleware(async (c, next) => {
  const session = await getSession(c.req.raw);
  if (!session) return c.redirect("/login");
  c.set("user", session.user);
  await next();
});`;

export default function RoutingGuide(_props: RouteProps) {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Routing and rendering
      </h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Hum discovers routes from files. Special files add document shells,
        layouts, middleware, error pages, and not-found pages to the route tree.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">Route files</h2>
      <p class="mt-3 leading-7 text-muted">
        Route files become URLs from their relative paths. This is the tree of
        the site you are reading: the guide pages come from{" "}
        <code>docs/</code>, and the page you are on now is the optional segment{" "}
        <code>docs/partials/[[topic]].tsx</code>. Parenthesized directories are
        transparent groups; bracket syntax marks dynamic, optional, and catch-all
        segments.
      </p>
      <CodeBlock code={routeTreeExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Files in a route directory normally become routes. Put reusable view
        components in a nearby <code>_components/</code>{" "}
        directory to keep them out of route discovery while still importing them
        with a relative path, for example{" "}
        <code>import Author from "./_components/Author.js"</code>.
      </p>
      <ul class="mt-4 list-disc space-y-2 pl-6 leading-7 text-muted">
        <li>
          <code>[id].tsx</code> matches one dynamic path segment.
        </li>
        <li>
          <code>[[lang]].tsx</code> is an optional single segment.
        </li>
        <li>
          <code>[...slug].tsx</code> matches zero or more remaining segments.
        </li>
        <li>
          Static routes take precedence over dynamic matches.
        </li>
      </ul>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Layouts and special files
      </h2>
      <p class="mt-3 leading-7 text-muted">
        <code>_app.tsx</code> provides the outer document,
        <code>_layout.tsx</code> wraps routes in its directory,
        <code>_middleware.ts</code> mounts Hono middleware for routes below it,
        <code>_error.tsx</code> renders route errors, and
        <code>_404.tsx</code>{" "}
        handles unmatched paths in its directory subtree. More-specific layouts,
        middleware, and error/not-found pages apply within their route branch.
      </p>
      <CodeBlock code={middlewareExample} />
      <p class="mt-4 leading-7 text-muted">
        Guarding an admin branch is the usual reason to add one, because the
        directory the file lives in is its scope. For app-wide or URL-prefix
        policy use <code>app.use()</code> in <code>app.ts</code> instead—the
        general alternative. This site has no <code>_middleware.ts</code>; the
        middleware it does run is Hono middleware in <code>app.ts</code>,
        covered in the{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/hono"
        >
          next guide
        </a>.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        HTML first, islands by choice
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Pages and components render to HTML on the server. Export a module-level{" "}
        <code>defineIsland(Component)</code>{" "}
        declaration from a browser-safe module to register an island. Hum generates
        its ID and client registration automatically; used islands hydrate in the
        browser. You can keep declarations in <code>_components/</code>,{" "}
        <code>_islands/</code>, or elsewhere in the project. Directory placement
        alone does not register a component.
      </p>
      <CodeBlock code={islandExample} />

      <p class="mt-12 border-t border-line pt-6 text-sm text-muted">
        Next:{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/hono"
        >
          Hono integration and deployment →
        </a>
      </p>
    </article>
  );
}
