import { define, type RouteProps } from "@hum/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(
  <title>Hono and Hum middleware — Hum Guides</title>,
);

const honoMiddlewareExample = `// server.ts
app.use("*", async (c, next) => {
  // Runs for matching Hono APIs and Hum routes.
  await next();
});`;

const humMiddlewareExample = `// routes/admin/_middleware.ts
import { define } from "@hum/core";

export default define.middleware(async (c, next) => {
  // Runs only for Hum routes in this directory and its descendants.
  await next();
});`;

export default function HonoGuide(_props: RouteProps) {
  return (
    <article>
      <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
        Guides / Server
      </p>
      <h1 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        Hono and Hum middleware
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Hum mounts its file routes onto the Hono app exported by{" "}
        <code>server.ts</code>. Both middleware systems run in the same request
        pipeline, but their scopes are different.
      </p>

      <h2 class="mt-10 text-2xl font-extrabold tracking-tight">
        Hono middleware: app and URL scope
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Register Hono middleware on the app before Hum is mounted. It runs for
        matching Hono API routes and Hum requests; a path pattern lets you
        select which requests it wraps. For example, app-wide middleware can
        provide shared headers or logging, while an API prefix can be protected
        independently of pages.
      </p>
      <CodeBlock code={honoMiddlewareExample} />

      <h2 class="mt-10 text-2xl font-extrabold tracking-tight">
        Hum middleware: file-route scope
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        A Hum <code>_middleware.ts</code>{" "}
        applies only to Hum file routes in its directory and descendants. Parent
        middleware is inherited, and the chain runs from the routes root toward
        the matched route. It also wraps that route’s handlers, but it does not
        apply to Hono API routes declared in <code>server.ts</code>.
      </p>
      <CodeBlock code={humMiddlewareExample} />

      <div class="mt-6 rounded-2xl border border-[#e3eadb] bg-[#f4f8ec] p-5 leading-7 text-[#556450]">
        Use Hono middleware when the policy is about the Hono app or URL
        prefixes; use <code>_middleware.ts</code>{" "}
        when it belongs to a branch of Hum’s route tree. A request matching both
        passes through Hono middleware first, then the Hum route middleware.
        Either can short-circuit by not calling <code>next()</code>.
      </div>
    </article>
  );
}
