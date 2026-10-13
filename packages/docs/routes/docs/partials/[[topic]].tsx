import { define, page, type RouteProps } from "@humjs/core";
import { Partial } from "@humjs/core/shared";
import { CodeBlock } from "../../_components/CodeBlock.js";

export const head = define.head(
  <title>Partial page updates — Hum Guides</title>,
);

const LOAD_MORE_ITEMS = [
  "Append new content without replacing what is already on screen.",
  "Keep the request and rendering on the server.",
  "Update the load-more control independently from the list.",
  "Stop offering more items when the collection is complete.",
  "No client-side island is needed for this interaction.",
  "The growing list remains ordinary HTML.",
];
const LOAD_MORE_BATCH_SIZE = 2;

interface PartialsPageProps extends RouteProps {
  data: {
    batch?: number;
    hasMore?: boolean;
  };
}

export const handlers = define.handlers({
  GET: () => page({ hasMore: true }),
  POST: async (c) => {
    const form = await c.req.formData();
    const batch = Number(form.get("batch"));
    if (!Number.isInteger(batch) || batch < 1) {
      return c.text("Invalid batch number.", 400);
    }

    const start = batch * LOAD_MORE_BATCH_SIZE;
    return page({
      batch,
      hasMore: start + LOAD_MORE_BATCH_SIZE < LOAD_MORE_ITEMS.length,
    });
  },
});

const partialExample = `// routes/docs/partials/[[topic]].tsx — the first demo on this page
import { Partial } from "@humjs/core/shared";

export default function PartialsPage({ url }) {
  const topic = url.searchParams.get("topic") ?? "start";

  return (
    <div data-hum-client-nav>
      <a href="/docs/partials/handlers" data-hum-partial="/docs/partials?topic=handlers">
        Handlers
      </a>

      <Partial name="topic">
        <p>{topics[topic]}</p>
      </Partial>
    </div>
  );
}`;

const linkExample = `// the link navigates to /docs/partials/handlers, but the fetch
// that updates the "topic" region asks for /docs/partials?topic=handlers
<a href="/docs/partials/handlers" data-hum-partial="/docs/partials?topic=handlers">
  Handlers
</a>`;

const loadMoreExample = `// handlers: what the "Load more" form below submits to
export const handlers = define.handlers({
  GET: () => page({ hasMore: true }),
  POST: async (c) => {
    const form = await c.req.formData();
    const batch = Number(form.get("batch"));
    const start = batch * LOAD_MORE_BATCH_SIZE;

    return page({
      batch,
      hasMore: start + LOAD_MORE_BATCH_SIZE < LOAD_MORE_ITEMS.length,
    });
  },
});

// one region appends the new items, the other replaces the form
<div data-hum-client-nav>
  <Partial name="load-more-items" mode={batch === undefined ? "replace" : "append"}>
    {itemsForBatch.map((item) => <li>{item}</li>)}
  </Partial>

  <Partial name="load-more-control">
    <form method="post" action="/docs/partials">
      <input type="hidden" name="batch" value={nextBatch} />
      <button>Load more</button>
    </form>
  </Partial>
</div>`;

const topics: Record<string, string> = {
  start: "Pick a topic to update just this panel.",
  handlers:
    "Handlers let a route answer HTTP requests or load data for its page.",
  islands: "Islands hydrate interactive components while the rest stays HTML.",
  routing: "File-based routes turn your routes directory into URLs.",
};

export default function PartialsPage({
  url,
  data,
}: PartialsPageProps) {
  const batch = data.batch;
  const hasMore = data.hasMore ?? true;
  const topic = url.searchParams.get("topic") ?? "start";
  const initialItems = LOAD_MORE_ITEMS.slice(0, LOAD_MORE_BATCH_SIZE);
  const appendedItems = batch === undefined ? [] : LOAD_MORE_ITEMS.slice(
    batch * LOAD_MORE_BATCH_SIZE,
    (batch + 1) * LOAD_MORE_BATCH_SIZE,
  );

  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Partial page updates
      </h1>
      <p class="mt-5 text-lg leading-8 text-muted">
        Use partials to fetch a new page while replacing, appending, or
        prepending only named regions of the current document.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Mark a region and opt in to client navigation
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Wrap the content to update in a <code>Partial</code>{" "}
        with a stable, unique name. Add{" "}
        <strong class="font-bold">data-hum-client-nav</strong>{" "}
        to an ancestor to intercept same-origin links and GET/POST forms inside
        it. Matching partials from the fetched page are applied without
        replacing the surrounding shell.
      </p>
      <CodeBlock code={partialExample} />
      <p class="mt-4 leading-7 text-muted">
        Keep the partial name consistent between responses. A normal full-page
        navigation still works when client navigation is not enabled.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Links and forms
      </h2>
      <p class="mt-3 leading-7 text-muted">
        Links inside an opted-in region navigate without a full reload. GET and
        POST forms are also supported; other form methods use normal browser
        submission. Add <code>data-hum-partial</code>{" "}
        to a link or form when you want to fetch a different URL than the one
        used for the visible navigation or form action.
      </p>
      <CodeBlock code={linkExample} />
      <div class="mt-5 rounded-2xl border border-line bg-surface-2 p-5 leading-7 text-muted">
        For a smaller opt-in area, put{" "}
        <strong class="font-bold">data-hum-client-nav</strong>{" "}
        only on the wrapper containing the links/forms that should use partial
        navigation. Set <code>data-hum-client-nav={"{false}"}</code>{" "}
        to opt out inside an enabled ancestor.
      </div>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Choose how new content is applied
      </h2>
      <p class="mt-3 leading-7 text-muted">
        The default mode replaces the region’s contents. Use append or prepend
        for feeds and lists; the existing DOM children are retained and new
        content is added at the selected edge. The second demo below does both:
        the list region appends the next batch while the region holding the form
        is replaced, so the button can move from “Load more” to the end of the
        list.
      </p>
      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <ModeCard
          mode="replace"
          description="Replace the current region contents (default)."
        />
        <ModeCard
          mode="append"
          description="Add the fetched content after existing children."
        />
        <ModeCard
          mode="prepend"
          description="Add the fetched content before existing children."
        />
      </div>
      <CodeBlock code={loadMoreExample} />
      <p class="mt-4 leading-7 text-muted">
        If a response does not contain any partial regions, Hum falls back to a
        full navigation. The URL and browser history stay in sync, and Back /
        Forward restores the prior page state.
      </p>

      <section class="mt-12 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.16em] text-accent">
          Try it
        </p>
        <h2 class="mt-2 text-lg font-extrabold">Update one region</h2>
        <p class="mt-2 leading-7 text-muted">
          These links change the URL and replace only the matching partial. The
          surrounding panel stays in place.
        </p>
        <div class="mt-5">
          <nav
            data-hum-client-nav
            aria-label="Choose a topic"
            class="flex flex-wrap gap-2"
          >
            <TopicLink topic="start" label="Start" />
            <TopicLink topic="handlers" label="Handlers" />
            <TopicLink topic="islands" label="Islands" />
            <TopicLink topic="routing" label="Routing" />
          </nav>
          {batch === undefined
            ? (
              <Partial name="topic">
                <div class="mt-4 min-h-24 rounded-2xl bg-surface-2 p-5">
                  <p class="text-xs font-bold uppercase tracking-[0.16em] text-accent">
                    Current topic
                  </p>
                  <p class="mt-2 font-semibold text-fg-soft">
                    {topics[topic] ?? "That topic is not available."}
                  </p>
                </div>
              </Partial>
            )
            : null}
        </div>
      </section>

      <section class="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.16em] text-accent">
          Append mode demo
        </p>
        <h2 class="mt-2 text-lg font-extrabold">Load more items</h2>
        <p class="mt-2 leading-7 text-muted">
          Submit the form to fetch the next two items. The list appends them;
          only the form area is replaced.
        </p>
        <div data-hum-client-nav class="mt-5">
          <ol class="space-y-3">
            <Partial
              name="load-more-items"
              mode={batch === undefined ? "replace" : "append"}
            >
              {(batch === undefined ? initialItems : appendedItems).map(
                (item, index) => {
                  const itemNumber = (batch ?? 0) * LOAD_MORE_BATCH_SIZE +
                    index + 1;
                  return (
                    <li
                      key={itemNumber}
                      class="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-fg-soft"
                    >
                      <span class="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-accent">
                        {itemNumber}
                      </span>
                      {item}
                    </li>
                  );
                },
              )}
            </Partial>
          </ol>
          <Partial name="load-more-control">
            <div class="mt-4">
              {hasMore
                ? (
                  <form method="post" action="/docs/partials">
                    <input
                      type="hidden"
                      name="batch"
                      value={batch === undefined ? 1 : batch + 1}
                    />
                    <button
                      type="submit"
                      class="rounded-xl bg-code px-5 py-3 text-sm font-bold text-white transition hover:bg-fg-hover"
                    >
                      Load more
                    </button>
                  </form>
                )
                : (
                  <p class="rounded-xl bg-accent-bg px-4 py-3 text-sm font-semibold text-accent-strong">
                    You’ve reached the end of the list.
                  </p>
                )}
            </div>
          </Partial>
        </div>
      </section>

      <p class="mt-12 border-t border-line pt-6 text-sm text-muted">
        Previous:{" "}
        <a
          class="font-semibold text-accent hover:underline"
          href="/docs/handlers"
        >
          Route handlers →
        </a>
      </p>
    </article>
  );
}

function TopicLink({ topic, label }: { topic: string; label: string }) {
  return (
    <a
      href={`/docs/partials/${topic}`}
      data-hum-partial={`/docs/partials?topic=${topic}`}
      class="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:bg-surface hover:text-accent-strong aria-[current]:text-accent-strong aria-[current]:border-accent aria-[current]:bg-surface"
    >
      {label}
    </a>
  );
}

function ModeCard(
  { mode, description }: {
    mode: "replace" | "append" | "prepend";
    description: string;
  },
) {
  return (
    <div class="rounded-2xl border border-line bg-surface p-4">
      <code class="font-bold text-accent">{mode}</code>
      <p class="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}
