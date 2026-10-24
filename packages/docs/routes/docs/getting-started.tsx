import { define, type RouteProps } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const head = define.head(
  <title>Getting started — Hum Guides</title>,
);

const installExample = `npm create hum@latest my-app
cd my-app
npm install
npm run dev`;

const pageExample = `// routes/index.tsx
import Counter from "../islands/Counter.js";

export default function Home() {
  return (
    <main>
      <h1>Welcome to my app</h1>
      <p>This page is rendered as HTML on the server.</p>
      <Counter start={0} />
    </main>
  );
}`;

const buildExample = `npm run build
npm start`;

const islandExample = `// components/Counter.tsx — no special directory required
import { defineIsland } from "@humjs/core/shared";
import { useSignal } from "@preact/signals";

export const Counter = defineIsland(({ start = 0 }: { start?: number }) => {
  const count = useSignal(start);
  return <button onClick={() => count.value++}>{count}</button>;
});`;

export default function GettingStarted(_props: RouteProps) {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Getting started
      </h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Create a Hum app, start it locally, and make your first change. The
        default template is a Node.js app built with Vite, Preact, and Hono.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Create and run the app
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Use Node.js 20.19 or later (or 22.12 or later). The scaffold uses npm by
        default; pnpm and other package managers work too.
      </p>
      <CodeBlock code={installExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Open the local URL printed by Vite. The starter page is in{" "}
        <code>routes/index.tsx</code>; edit its title or markup and save to see
        the change with HMR.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Add an island
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Pages render to HTML on the server. To add browser-side component state
        or event handlers, export a component declared with <code>defineIsland</code>{" "}
        and import it into a route. Hum generates its ID and client registration;
        no special directory or client-entry import is needed. For example:
      </p>
      <CodeBlock code={islandExample} language="typescript" />
      <p class="mt-3 leading-7 text-muted">
        The generated template already includes a default-exported island in{" "}
        <code>islands/Counter.tsx</code>:
      </p>
      <CodeBlock code={pageExample} language="typescript" />
      <p class="mt-3 leading-7 text-muted">
        Only the island is hydrated in the browser; the rest of the page remains
        server-rendered HTML. For an interaction that does not need component
        state, see the{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/facets"
        >
          page-level reactivity guide
        </a>.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Build and serve
      </h2>
      <p class="mt-3 leading-7 text-muted">
        The basic template compiles the server app to ESM modules and bundles
        client assets into <code>dist/</code>. npm dependencies stay external.
        Build and run the Node server with:
      </p>
      <CodeBlock code={buildExample} language="bash" />
      <p class="mt-3 leading-7 text-muted">
        Deploy <code>dist/</code> with the application's package manifest and
        lockfile, and install its production dependencies. For a build that runs
        without <code>node_modules</code>, set <code>standalone: true</code> in
        the Hum plugin options; dependencies must support bundling. The
        Cloudflare template selects this mode.
      </p>
      <p class="mt-3 leading-7 text-muted">
        The server listens on port <code>3000</code> by default; set{" "}
        <code>PORT</code> to change it. The{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/hono"
        >
          Hono guide
        </a>{" "}
        explains middleware and API routes.
      </p>

      <p class="mt-12 border-t border-line pt-6 text-sm text-muted">
        Next:{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/routing"
        >
          Routing and rendering →
        </a>
      </p>
    </article>
  );
}
