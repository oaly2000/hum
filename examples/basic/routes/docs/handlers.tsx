import { define, page, Partial, type RouteProps } from "@hum/core";
import { CodeBlock } from "../_components/CodeBlock.js";

interface HandlerPageProps extends RouteProps {
  notice?: string;
}

export const head = <title>Route handlers — Hum Guides</title>;

export const handlers = define.handlers({
  GET: () => page(),
  POST: async (c) => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return page({
      props: {
        notice: name ? `Welcome, ${name}!` : "Please enter a name.",
      },
    });
  },
});

const handlerExample = `import { define, page } from "@hum/core";

export const handlers = define.handlers({
  GET: async (c) => {
    const post = await loadPost(c.req.param("id"));
    return page({ props: { post } });
  },
  POST: async (c) => {
    const form = await c.req.formData();
    await savePost(form);
    return c.redirect("/blog");
  },
});

export default function PostPage({ post }) {
  return <article><h1>{post.title}</h1></article>;
}`;

const directResponseExample = `export const handlers = {
  GET: (c) => c.json({ status: "ok" }),
  POST: (c) => c.text("Saved", 201),
};`;

export default function HandlersPage({ notice }: HandlerPageProps) {
  return (
    <article>
      <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
        Guides / Requests
      </p>
      <h1 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        Route handlers
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Handle a request with Hono’s context, then either return a response
        directly or render this route’s page with data.
      </p>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Load data and render the page
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Export a <code class="rounded bg-white px-1.5 py-0.5 text-sm">handlers</code>{" "}
        object keyed by HTTP method. Import{" "}
        <code class="rounded bg-white px-1.5 py-0.5 text-sm">page</code>{" "}
        from <code class="rounded bg-white px-1.5 py-0.5 text-sm">@hum/core</code>{" "}
        to render the same file’s default component. The handler receives the
        unmodified Hono context.
      </p>
      <CodeBlock code={handlerExample} language="typescript" />
      <ul class="mt-4 list-disc space-y-2 pl-6 leading-7 text-[#657168]">
        <li>
          Values in <code>props</code> are merged into the page component’s
          route props.
        </li>
        <li>
          Use <code>status</code> to set the rendered HTML response status.
        </li>
        <li>
          A <code>HEAD</code> request uses the <code>HEAD</code> handler, or
          falls back to <code>GET</code> when one is not defined.
        </li>
      </ul>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Return a response directly
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Handlers can use Hono helpers such as <code>c.json()</code>,{" "}
        <code>c.text()</code>, and <code>c.redirect()</code>. If a handler
        returns a <code>Response</code>, Hum sends it without rendering the
        page.
      </p>
      <CodeBlock code={directResponseExample} language="typescript" />
      <p class="mt-4 leading-7 text-[#657168]">
        If the selected handler returns nothing, Hum falls through to the
        default page render. If a route declares handlers but does not handle a
        non-GET/HEAD method, Hum responds with <code>405 Method Not Allowed</code>.
      </p>

      <section class="mt-12 rounded-3xl border border-[#e3eadb] bg-white p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.14em] text-[#759a37]">
          Try it
        </p>
        <h2 class="mt-2 text-xl font-extrabold">A form handled on the server</h2>
        <p class="mt-2 leading-7 text-[#657168]">
          This form submits to the page’s <code>POST</code> handler. The
          handler reads the form data and renders the page again with a message.
        </p>
        <form f-client-nav method="post" action="/docs/handlers" class="mt-5 flex flex-col gap-3 sm:flex-row">
          <label class="sr-only" for="handler-name">Your name</label>
          <input
            id="handler-name"
            name="name"
            required
            placeholder="Your name"
            class="min-w-0 flex-1 rounded-xl border border-[#dce3d8] bg-[#fbfcf8] px-4 py-3 outline-none transition focus:border-[#91b94d] focus:ring-2 focus:ring-[#91b94d]/20"
          />
          <button
            type="submit"
            class="rounded-xl bg-[#17211b] px-5 py-3 font-bold text-white transition hover:bg-[#2e4033]"
          >
            Send request
          </button>
        </form>
        <Partial name="welcome">
          { notice && <p class="mt-4 rounded-xl bg-[#eff8d6] px-4 py-3 font-semibold text-[#45651c]">{notice}</p> }
        </Partial>
      </section>

      <p class="mt-12 border-t border-[#e3eadb] pt-6 text-sm text-[#788279]">
        Next: <a class="font-semibold text-[#587d26] hover:underline" href="/docs/partials">Partial page updates →</a>
      </p>
    </article>
  );
}
