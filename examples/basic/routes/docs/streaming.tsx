import { createResource, define, page, type Resource } from "@hum/core";
import { lazy, Suspense } from "preact/compat";
import { CodeBlock } from "../_components/CodeBlock.js";

export const config = define.config({ streaming: true });

interface DemoData {
  message: string;
}

interface StreamingPageData {
  demo: Resource<DemoData>;
}

async function loadDemoData(): Promise<DemoData> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { message: "The delayed server data has arrived." };
}

export const handlers = define.handlers({
  GET: () => page({ demo: createResource(loadDemoData()) }),
});

export const head = define.head(
  <title>Experimental streaming — Hum Guides</title>,
);

const LazyCodeBlock = lazy(() => import("./_components/LazyCodeBlock.js"));

const resourceExample =
  `import { createResource, define, page, type Resource } from "@hum/core";
import { Suspense } from "preact/compat";

type Profile = { name: string };
type PageData = { profile: Resource<Profile> };

export const handlers = define.handlers({
  GET: (c) => page({
    profile: createResource(loadProfile(c.req.param("id"))),
  }),
});

function ProfilePanel({ profile }: PageData) {
  const data = profile.read();
  return <p>{data.name}</p>;
}

export const config = define.config({ streaming: true });

export default define.page<PageData>(({ data }) => (
  <Suspense fallback={<p>Loading profile…</p>}>
    {data && <ProfilePanel profile={data.profile} />}
  </Suspense>
));`;

function ResourceDemo({ resource }: { resource: Resource<DemoData> }) {
  const data = resource.read();
  return (
    <p class="font-semibold text-[#45651c]" aria-live="polite">
      {data.message}
    </p>
  );
}

export default define.page<StreamingPageData>(({ data }) => {
  return (
    <article>
      <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
        Guides / Rendering
      </p>
      <h1 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        Experimental streaming
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Streaming SSR is an opt-in escape hatch for routes that benefit from
        sending the page shell before suspended content is ready. Routes without
        streaming enabled keep Hum’s normal complete-document rendering.
      </p>

      <section class="mt-8 rounded-2xl border border-[#dce8c8] bg-[#f4f8ec] p-5">
        <h2 class="text-lg font-extrabold">Live resource demo</h2>
        <p class="mt-2 text-sm leading-6 text-[#657168]">
          This message is resolved by a server request started in this route’s
          handler. The page shell streams first; the resource arrives after a
          short delay.
        </p>
        <div class="mt-4 rounded-xl bg-white px-4 py-3">
          <Suspense fallback={<p role="status">Loading server data…</p>}>
            {data && <ResourceDemo resource={data.demo} />}
          </Suspense>
        </div>
      </section>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Enable it for one route
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Set <code>streaming: true</code> in the route’s config and use{" "}
        <code>Suspense</code> from{" "}
        <code>preact/compat</code>. Its fallback is sent with the initial shell;
        when the suspended subtree resolves, Preact streams its replacement.
      </p>

      <CodeBlock code={resourceExample} language="typescript" />

      <p class="mt-5 leading-7 text-[#657168]">
        The handler starts the request and passes a stable resource to the page.
        <code>profile.read()</code>{" "}
        returns the value when ready, throws the pending promise to suspend, or
        throws the rejection reason. Do not create the resource during component
        rendering; create it once per request in the handler.
      </p>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Early-stage limitations
      </h2>
      <ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-[#657168]">
        <li>
          This uses Preact’s early-stage Web Streams SSR implementation and is
          experimental.
        </li>
        <li>
          Once streaming begins, the HTTP status and response headers can no
          longer be changed.
        </li>
        <li>
          Errors from a rejected Suspense promise are not reliably propagated by
          the current renderer.
        </li>
        <li>
          Use it selectively and verify the behavior with your own suspended
          components before relying on it.
        </li>
      </ul>

      <p class="mt-12 border-t border-[#e3eadb] pt-6 text-sm text-[#788279]">
        Next:{" "}
        <a
          class="font-semibold text-[#587d26] hover:underline"
          href="/docs/partials"
        >
          Partial page updates →
        </a>
      </p>
    </article>
  );
});
