import { define, page, Partial, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

type HandlerPageData = { notice: string };
type HandlerPageProps = RouteProps & { data: HandlerPageData };

export const head = define.head(<title>Route handlers — Hum Guides</title>);

export const handlers = define.handlers({
  GET: () => page({ notice: "" }),
  POST: async (c) => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return page({
      notice: name ? `Welcome, ${name}!` : "Please enter a name.",
    });
  },
});

const handlerExample = `// The code behind the form at the bottom of this page.
import { define, page, Partial } from "@humjs/core";

export const handlers = define.handlers({
  GET: () => page({ notice: "" }),
  POST: async (c) => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return page({
      notice: name ? \`Welcome, \${name}!\` : "Please enter a name.",
    });
  },
});

export default define.page<{ notice: string }>(({ data }) => (
  <form method="post" action="/docs/handlers" data-hum-client-nav>
    <input name="name" required />
    <Partial name="welcome">
      {data.notice && <p>{data.notice}</p>}
    </Partial>
  </form>
));`;

const directResponseExample = `// server.ts of this site, reachable at /api/health
app.get("/api/health", (c) => c.json({ status: "ok" }));`;

export default define.page<HandlerPageData>(({ data }: HandlerPageProps) => {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Route handlers
      </h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Handle a request with Hono’s context, then either return a response
        directly or render this route’s page with data.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Load data and render the page
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Export a{" "}
        <code class="rounded bg-surface px-1.5 py-0.5 text-sm">handlers</code>
        {" "}
        object keyed by HTTP method. Import{" "}
        <code class="rounded bg-surface px-1.5 py-0.5 text-sm">page</code> from
        {" "}
        <code class="rounded bg-surface px-1.5 py-0.5 text-sm">@humjs/core</code>
        {" "}
        to render the same file’s default component. The handler receives the
        unmodified Hono context.
      </p>
      <CodeBlock code={handlerExample} language="typescript" />
      <ul class="mt-4 list-disc space-y-2 pl-6 leading-7 text-muted">
        <li>
          The first argument becomes the view’s <code>data</code> prop.
        </li>
        <li>
          Pass <code>{`{ status: 201 }`}</code>{" "}
          as the second argument to set the HTML response status.
        </li>
        <li>
          A <code>HEAD</code> request uses the <code>HEAD</code>{" "}
          handler, or falls back to <code>GET</code> when one is not defined.
        </li>
      </ul>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Return a response directly
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Handlers can use Hono helpers such as <code>c.json()</code>,{" "}
        <code>c.text()</code>, and{" "}
        <code>c.redirect()</code>. If a handler returns a{" "}
        <code>Response</code>, Hum sends it without rendering the page.
      </p>
      <CodeBlock code={directResponseExample} language="typescript" />
      <p class="mt-4 leading-7 text-muted">
        That endpoint is live on this site:{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/api/health"
        >
          /api/health →
        </a>
      </p>
      <p class="mt-4 leading-7 text-muted">
        If the selected handler returns nothing, Hum falls through to the
        default page render. If a route declares handlers but does not handle a
        non-GET/HEAD method, Hum responds with{" "}
        <code>405 Method Not Allowed</code>.
      </p>

      <section class="mt-12 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.16em] text-accent">
          Try it
        </p>
        <h2 class="mt-2 text-lg font-extrabold">
          A form handled on the server
        </h2>
        <p class="mt-2 leading-7 text-muted">
          This form submits to the page’s <code>POST</code>{" "}
          handler. The handler reads the form data and renders the page again
          with a message.
        </p>
        <form
          data-hum-client-nav
          method="post"
          action="/docs/handlers"
          class="mt-5 flex flex-col gap-3 sm:flex-row"
        >
          <label class="sr-only" for="handler-name">Your name</label>
          <input
            id="handler-name"
            name="name"
            required
            placeholder="Your name"
            class="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            class="rounded-xl bg-fg px-5 py-3 font-bold text-bg transition hover:bg-fg-hover"
          >
            Send request
          </button>
        </form>
        <Partial name="welcome">
          {data.notice && (
            <p class="mt-4 rounded-xl bg-accent-bg px-4 py-3 font-semibold text-accent-strong">
              {data.notice}
            </p>
          )}
        </Partial>
      </section>

      <p class="mt-12 border-t border-line pt-6 text-sm text-muted">
        Next:{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/partials"
        >
          Partial page updates →
        </a>
      </p>
    </article>
  );
});
