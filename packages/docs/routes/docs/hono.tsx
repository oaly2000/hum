import { define, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(
  <title>Hono and Hum middleware — Hum Guides</title>,
);

const honoMiddlewareExample = `// server.ts — the Hono app this documentation runs on
import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  c.header("x-powered-by", "Hum + Hono");
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;`;

const humMiddlewareExample = `// routes/admin/_middleware.ts
import { define } from "@humjs/core";

// The default export is a Hono middleware. The directory this file lives in
// decides which Hum routes it wraps.
export default define.middleware(async (c, next) => {
  if (!(await isSignedIn(c))) return c.redirect("/login");
  await next();
});`;

export default function HonoGuide(_props: RouteProps) {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Hono and Hum middleware
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Hum mounts its file routes onto the Hono app exported by{" "}
        <code>server.ts</code>. Both middleware systems run in the same request
        pipeline, but their scopes are different.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Hono middleware: app and URL scope
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Register Hono middleware on the app before Hum is mounted. It runs for
        matching Hono API routes and Hum requests; a path pattern lets you
        select which requests it wraps. For example, app-wide middleware can
        provide shared headers or logging, while an API prefix can be protected
        independently of pages. This is that file for this site—every response
        you have loaded carries its <code>x-powered-by</code>{" "}
        header, including the{" "}
        <a
          class="font-semibold text-[#587d26] hover:underline"
          href="/api/health"
        >
          /api/health
        </a>{" "}
        endpoint it also declares.
      </p>
      <CodeBlock code={honoMiddlewareExample} />

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Hum middleware: a directory-scoped mount point
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        A Hum <code>_middleware.ts</code>{" "}
        is a mount point for a Hono middleware, scoped by the directory it lives
        in: it applies to Hum file routes in that directory and descendants.
        Parent middleware is inherited, and the chain runs from the routes root
        toward the matched route. It also wraps that route’s handlers and the{" "}
        <code>_404</code>{" "}
        render for unmatched paths under the same directory, but it does not
        apply to Hono API routes declared in <code>server.ts</code>.
      </p>
      <CodeBlock code={humMiddlewareExample} />
      <p class="mt-4 leading-7 text-[#657168]">
        This site has none, so the difference is easy to see: the header above
        is added by Hono middleware and appears on every response, while a{" "}
        <code>_middleware.ts</code> in <code>routes/docs/</code> would only run
        for the guide pages below it—never for <code>/api/health</code>.
      </p>

      <div class="mt-6 rounded-2xl border border-[#e3eadb] bg-[#f4f8ec] p-5 leading-7 text-[#556450]">
        Reach for <code>app.use()</code> in <code>server.ts</code> first: it is
        the general alternative and covers both Hum pages and Hono API routes by
        path pattern. Use <code>_middleware.ts</code>{" "}
        only when the policy belongs to a branch of Hum’s route tree—for example
        a URL-transparent <code>(group)/</code> directory, which a path pattern
        cannot express. A request matching both passes through Hono middleware
        first, then the Hum route middleware. Either can short-circuit by
        returning a <code>Response</code>.
      </div>
    </article>
  );
}
