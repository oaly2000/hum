import { define, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(<title>Routing — Hum Guides</title>);

const routeTreeExample = `routes/
  _app.tsx
  _middleware.ts
  _layout.tsx
  index.tsx
  blog/
    [id].tsx
    _layout.tsx
    _404.tsx
    _components/
      Author.tsx
    _islands/
      Editor.tsx
`;

const islandExample = `import Editor from "./_islands/Editor.js";

export default function Article() {
  return <Editor initialText="Draft" />;
}`;

const middlewareExample = `import type { HumContext } from "@humjs/core";

export default async function auth(c: HumContext, next: () => Promise<void>) {
  const session = await getSession(c.req.raw);
  if (!session) {
    c.res = c.redirect("/login");
    return;
  }
  c.set("user", session.user);
  await next();
}`;

export default function RoutingGuide(_props: RouteProps) {
  return (
    <article>
      <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
        Guides / Structure
      </p>
      <h1 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        Routing and rendering
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Hum discovers routes from files. Special files add document shells,
        layouts, middleware, error pages, and not-found pages to the route tree.
      </p>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">Route files</h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Route files become URLs from their relative paths. Parenthesized
        directories are transparent groups; bracket syntax marks dynamic,
        optional, and catch-all segments.
      </p>
      <CodeBlock code={routeTreeExample} language="bash" />
      <p class="mt-3 leading-7 text-[#657168]">
        Files in a route directory normally become routes. Put reusable view
        components in a nearby <code>_components/</code>{" "}
        directory to keep them out of route discovery while still importing them
        with a relative path, for example{" "}
        <code>import Author from "./_components/Author.js"</code>.
      </p>
      <ul class="mt-4 list-disc space-y-2 pl-6 leading-7 text-[#657168]">
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

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Layouts and special files
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        <code>_app.tsx</code> provides the outer document,
        <code>_layout.tsx</code> wraps routes in its directory,
        <code>_middleware.ts</code> runs for routes below it,
        <code>_error.tsx</code> renders route errors, and
        <code>_404.tsx</code>{" "}
        handles unmatched paths in its directory subtree. More-specific layouts,
        middleware, and error/not-found pages apply within their route branch.
      </p>
      <CodeBlock code={middlewareExample} />

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        HTML first, islands by choice
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Pages and components render to HTML on the server. A component becomes
        interactive when it is discovered under <code>islands/</code>{" "}
        or a route-local <code>_islands/</code>{" "}
        directory and used by a page; only those island bundles hydrate in the
        browser. Route-local islands are useful for interactive components only
        used by one route branch.
      </p>
      <CodeBlock code={islandExample} />

      <p class="mt-12 border-t border-[#e3eadb] pt-6 text-sm text-[#788279]">
        Next:{" "}
        <a
          class="font-semibold text-[#587d26] hover:underline"
          href="/docs/hono"
        >
          Hono integration and deployment →
        </a>
      </p>
    </article>
  );
}
