import { define } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const config = define.config({ render: { mode: "ssg" } });
export const head = define.head(<title>SSR, SSG and ISG — Hum Guides</title>);

const modes = `// routes/posts/[slug].tsx
export const config = define.config({
  render: { mode: "ssg", slugs: ["hello", "getting-started"] },
});

// For request-time generation and updates, replace render with:
// { mode: "isg", revalidate: 60, slugs: ["hello"] }`;

const entry = `import { createPageService, mountHum } from "@humjs/core";
import { config } from "virtual:hum/build";

const pages = createPageService();
await mountHum(app, { ...config, pages });

// A Worker can let its execution context own background regeneration:
// createPageService({
//   background: (task, c) => c.executionCtx.waitUntil(task),
// });`;

export default function GenerationGuide() {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">SSR, SSG and ISG</h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Pages default to SSR. Select a mode in the page’s <code>define.config</code>:
        SSG generates at build time, while ISG can generate missing pages and
        update expired output. This guide itself is generated during the build.
      </p>
      <CodeBlock code={modes} />
      <p class="mt-4 leading-7 text-muted">
        A parameter-free SSG route is generated automatically. Dynamic SSG routes
        require a <code>slugs</code> array; an empty array generates no pages.
        For one parameter, entries may be slug values or full paths. Multiple
        parameters require full paths such as <code>/en/posts/hello</code>.
        Invalid, duplicate or shadowed paths fail the build. SSG paths outside
        the table return 404.
      </p>
      <p class="mt-4 leading-7 text-muted">
        ISG uses the table as an optional pre-generation list. Missing paths
        generate on their first request. Set <code>fallback: false</code> to
        restrict the route to its table. <code>revalidate</code> is a positive
        lifetime in seconds. Concurrent generation requests in one service are
        combined; a failed update keeps the previous version.
      </p>
      <h2 class="mt-12 text-xl font-extrabold">Application setup</h2>
      <CodeBlock code={entry} />
      <p class="mt-4 leading-7 text-muted">
        The default service stores generated ISG pages in memory for the life of
        the process. Pass a <code>store</code> with <code>get(key)</code> and
        <code>set(key, page)</code> for shared persistence. Writes must atomically
        publish a complete page; keys include the build ID. Coordination between
        different server instances belongs to that adapter.
      </p>
      <p class="mt-4 leading-7 text-muted">
        Without a background executor, expired pages update before the response.
        With one, the response uses the old version while the executor owns the
        update. Full HTML and Partial responses are published together from the
        same render, preserving shared signals and island props.
      </p>
      <h2 class="mt-12 text-xl font-extrabold">Build and request behavior</h2>
      <p class="mt-4 leading-7 text-muted">
        Configure <code>hum({"{ devEntry: \"app.ts\", prerenderOrigin: \"https://example.com\" }"})</code>.
        The build loads the compiled app module without starting the Node
        listener. Route configuration is evaluated in Node; build-time handlers must work there
        without deployment-only bindings. The canonical origin defaults to
        <code> http://localhost</code>.
      </p>
      <p class="mt-4 leading-7 text-muted">
        Static modes generate public pages with a fresh GET request, without
        cookies, authorization or query parameters. Application middleware wraps
        each request; directory middleware and page handlers run during
        generation. Keep personalized pages and request-specific guards on SSR.
        Responses with cookies, varying representations, private cache controls
        or a status other than 200 cannot be generated. Streaming remains an
        SSR option. Non-GET methods continue through the normal handler chain.
      </p>
      <p class="mt-4 leading-7 text-muted">
        Development always renders fresh output. Production embeds generated
        pages in the generated Hum build module and serves them through Hono.
        Standalone builds bundle that module with the server; ordinary builds
        keep it in the ESM module tree alongside the compiled app. Neither mode
        discovers page files at runtime. Pure static hosting is not provided by
        this output format.
      </p>
    </article>
  );
}
