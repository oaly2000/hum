import {
  createResource,
  define,
  page,
  type Resource,
  Suspense,
} from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";

export const config = define.config({ streaming: true });

interface DemoData {
  message: string;
}

interface StreamingPageData {
  demo: Resource<DemoData>;
  renderError: Resource<void>;
}

async function loadDemoData(): Promise<DemoData> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { message: "The delayed server data has arrived." };
}

export const handlers = define.handlers({
  GET: () =>
    page({
      demo: createResource(loadDemoData()),
      renderError: createResource(loadDemoData()),
    }),
});

export const head = define.head(
  <title>Experimental streaming — Hum Guides</title>,
);

const resourceExample =
  `// routes/docs/streaming.tsx — the two demos above
import { createResource, define, page, Suspense, type Resource } from "@humjs/core";

type DemoData = { message: string };
type PageData = { demo: Resource<DemoData>; renderError: Resource<void> };

async function loadDemoData(): Promise<DemoData> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { message: "The delayed server data has arrived." };
}

export const config = define.config({ streaming: true });

export const handlers = define.handlers({
  GET: () =>
    page({
      demo: createResource(loadDemoData()),
      renderError: createResource(loadDemoData()),
    }),
});

export default define.page<PageData>(({ data }) => (
  <>
    <Suspense
      resource={data.demo}
      fallback={<p role="status">Loading server data…</p>}
      errorFallback={<p role="alert">Could not load server data.</p>}
    >
      {(demo) => <ResourceDemo data={demo} />}
    </Suspense>

    <Suspense
      resource={data.renderError}
      fallback={<p role="status">Loading server data…</p>}
      errorFallback={(error) => <p role="alert">Error caught: {String(error)}</p>}
    >
      {() => <BrokenRenderDemo />}
    </Suspense>
  </>
));`;

function ResourceDemo({ data }: { data: DemoData }) {
  return (
    <p class="font-semibold text-accent-strong" aria-live="polite">
      {data.message}
    </p>
  );
}

function BrokenRenderDemo(): never {
  throw new Error("Intentional render error.");
}

export default define.page<StreamingPageData>(({ data }) => {
  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Experimental streaming
      </h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Streaming SSR is an opt-in escape hatch for routes that benefit from
        sending the page shell before suspended content is ready. Routes without
        streaming enabled keep Hum’s normal complete-document rendering.
      </p>

      <section class="mt-8 rounded-2xl border border-line bg-surface-2 p-5">
        <h2 class="text-lg font-extrabold">Live resource demo</h2>
        <p class="mt-2 text-sm leading-6 text-muted">
          This message is resolved by a server request started in this route’s
          handler. The page shell streams first; the resource arrives after a
          short delay.
        </p>
        <div class="mt-4 rounded-xl bg-surface px-4 py-3">
          <Suspense
            resource={data.demo}
            fallback={<p role="status">Loading server data…</p>}
            errorFallback={<p role="alert">Could not load server data.</p>}
          >
            {(demo) => <ResourceDemo data={demo} />}
          </Suspense>
        </div>
      </section>

      <section class="mt-5 rounded-2xl border border-danger-line bg-danger-bg p-5">
        <h2 class="text-lg font-extrabold">Component render error demo</h2>
        <p class="mt-2 text-sm leading-6 text-muted">
          This resource resolves successfully, then its child deliberately
          throws while rendering. The boundary should show its error fallback.
        </p>
        <div class="mt-4 rounded-xl bg-surface px-4 py-3">
          <Suspense
            resource={data.renderError}
            fallback={<p role="status">Loading server data…</p>}
            errorFallback={(error) => (
              <p role="alert" class="font-semibold text-danger">
                Error caught: {String(error)}
              </p>
            )}
          >
            {() => <BrokenRenderDemo />}
          </Suspense>
        </div>
      </section>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Enable it for one route
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Set <code>streaming: true</code> in the route’s config, then use Hum’s
        {" "}
        <code>Suspense</code>{" "}
        with a resource. It shows the pending fallback first, renders the
        resource value when ready, or displays the error fallback if loading
        fails. The code below is the whole route behind the demos above.
      </p>

      <CodeBlock code={resourceExample} language="typescript" />

      <p class="mt-5 leading-7 text-muted">
        The handler starts the request and passes a stable resource to the page.
        <code>resource.read()</code>{" "}
        returns the value when ready or suspends while pending. If it rejects,
        Hum’s <code>Suspense</code>{" "}
        handles pending and rejected states in one place.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Share requests across route layers
      </h2>
      <p class="mt-3 leading-7 text-muted">
        For data owned by a directory, register it in that directory’s
        {" "}
        <code>_middleware.ts</code>{" "}
        with a typed key. Descendant layouts and pages can retrieve the
        request-scoped resource without passing it through every route:
      </p>
      <CodeBlock
        code={`        // routes/admin/_components/resources.ts
import { createResourceKey } from "@humjs/core";
export const accountKey = createResourceKey<Account>("admin.account");

// routes/admin/_middleware.ts
import { registerResource, type HumMiddleware } from "@humjs/core";
        import { accountKey } from "./_components/resources.js";
const middleware: HumMiddleware = async (c, next) => {
  registerResource(accountKey, () => loadAccount(c));
  await next();
};
export default middleware;

// routes/admin/_layout.tsx
import { getResource, Suspense } from "@humjs/core";
import type { ComponentChildren } from "preact";
import { accountKey } from "./_components/resources.js";
export default function AdminLayout(
  { children }: { children?: ComponentChildren },
) {
  return (
    <Suspense resource={getResource(accountKey)} fallback={<p>Loading…</p>}>
      {(account) => <section>{account.name}{children}</section>}
    </Suspense>
  );
}`}
        language="typescript"
      />
      <p class="mt-3 leading-7 text-muted">
        Resources are isolated per request. Registering the same key twice in
        one request throws instead of silently replacing the first value.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Early-stage limitations
      </h2>
      <ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-muted">
        <li>
          This uses Preact’s early-stage Web Streams SSR implementation and is
          experimental.
        </li>
        <li>
          Once streaming begins, the HTTP status and response headers can no
          longer be changed.
        </li>
        <li>
          Hum’s <code>Suspense</code>{" "}
          renders its configured error fallback if a resource rejects or a
          child component throws while rendering inside that boundary.
        </li>
        <li>
          Errors outside a Hum <code>Suspense</code>{" "}
          boundary are not handled by that boundary. If they happen after the
          shell starts streaming, Hum cannot replace the response or route it to
          the <code>_error</code>{" "}
          page; the stream may fail. Put potentially failing streamed content
          inside a boundary with an appropriate error fallback.
        </li>
        <li>
          Use it selectively and verify the behavior with your own suspended
          components before relying on it.
        </li>
      </ul>

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
