import { define, page, Partial, type RouteProps } from "@hum/core";
import { CodeBlock } from "../../_components/CodeBlock.js";

export const head = <title>Partials — Hum Guides</title>;

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
  batch?: number;
  hasMore?: boolean;
}

export const handlers = define.handlers({
  POST: async (c) => {
    const form = await c.req.formData();
    const batch = Number(form.get("batch"));
    if (!Number.isInteger(batch) || batch < 1) {
      return c.text("Invalid batch number.", 400);
    }

    const start = batch * LOAD_MORE_BATCH_SIZE;
    return page({
      props: {
        batch,
        hasMore: start + LOAD_MORE_BATCH_SIZE < LOAD_MORE_ITEMS.length,
      },
    });
  },
});

const partialExample = `import { Partial } from "@hum/core";

export default function SearchPage({ url }) {
  const query = url.searchParams.get("q") ?? "";

  return (
    <div f-client-nav>
      <form action="/search" method="get">
        <input name="q" />
        <button>Search</button>
      </form>

      <Partial name="results">
        <SearchResults query={query} />
      </Partial>
    </div>
  );
}`;

const linkExample = `<div f-client-nav>
  <a href="/catalog?page=1">Previous</a>
  <a href="/catalog?page=2">Next</a>

  <Partial name="items">
    <ProductList page={page} />
  </Partial>
</div>`;

const topics: Record<string, string> = {
  start: "Pick a topic to update just this panel.",
  handlers: "Handlers let a route answer HTTP requests or load data for its page.",
  islands: "Islands hydrate interactive components while the rest stays HTML.",
  routing: "File-based routes turn your routes directory into URLs.",
};

export default function PartialsPage({
  url,
  batch,
  hasMore = true,
}: PartialsPageProps) {
  const topic = url.searchParams.get("topic") ?? "start";
  const initialItems = LOAD_MORE_ITEMS.slice(0, LOAD_MORE_BATCH_SIZE);
  const appendedItems = batch === undefined
    ? []
    : LOAD_MORE_ITEMS.slice(
      batch * LOAD_MORE_BATCH_SIZE,
      (batch + 1) * LOAD_MORE_BATCH_SIZE,
    );

  return (
    <article>
      <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
        Guides / Navigation
      </p>
      <h1 class="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
        Partial page updates
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Use partials to fetch a new page while replacing, appending, or
        prepending only named regions of the current document.
      </p>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Mark a region and opt in to client navigation
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Wrap the content to update in a <code>Partial</code> with a stable,
        unique name. Add <strong class="font-bold">f-client-nav</strong> to an ancestor to intercept
        same-origin links and GET/POST forms inside it. Matching partials from
        the fetched page are applied without replacing the surrounding shell.
      </p>
      <CodeBlock code={partialExample} />
      <p class="mt-4 leading-7 text-[#657168]">
        Keep the partial name consistent between responses. A normal full-page
        navigation still works when client navigation is not enabled.
      </p>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Links and forms
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        Links inside an opted-in region navigate without a full reload. GET and
        POST forms are also supported; other form methods use normal browser
        submission. Add <code>f-partial</code> to a link or form when you want
        to fetch a different URL than the one used for the visible navigation
        or form action.
      </p>
      <CodeBlock code={linkExample} />
      <div class="mt-5 rounded-2xl border border-[#e3eadb] bg-[#f4f8ec] p-5 leading-7 text-[#556450]">
        For a smaller opt-in area, put <strong class="font-bold">f-client-nav</strong> only on the
        wrapper containing the links/forms that should use partial navigation.
        Set <code>f-client-nav={"{false}"}</code> to opt out inside an enabled
        ancestor.
      </div>

      <h2 class="mt-12 text-2xl font-extrabold tracking-tight">
        Choose how new content is applied
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        The default mode replaces the region’s contents. Use append or prepend
        for feeds and lists; the existing DOM children are retained and new
        content is added at the selected edge.
      </p>
      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <ModeCard mode="replace" description="Replace the current region contents (default)." />
        <ModeCard mode="append" description="Add the fetched content after existing children." />
        <ModeCard mode="prepend" description="Add the fetched content before existing children." />
      </div>
      <CodeBlock
        code={`<Partial name="messages" mode="append">
  <MessageList messages={newMessages} />
</Partial>`}
      />
      <p class="mt-4 leading-7 text-[#657168]">
        A “load more” interaction can submit a form, render only the next
        batch in an append partial, and replace a separate partial containing
        the form button.
      </p>
      <CodeBlock
        code={`export const handlers = define.handlers({
  POST: async (c) => {
    const form = await c.req.formData();
    const batch = Number(form.get("batch"));
    return page({ props: { batch } });
  },
});

<div f-client-nav>
  <Partial name="items" mode={batch ? "append" : "replace"}>
    <ItemList items={itemsForBatch} />
  </Partial>
  <Partial name="load-more">
    <form method="post" action="/items">
      <input type="hidden" name="batch" value={nextBatch} />
      <button>Load more</button>
    </form>
  </Partial>
</div>`}
      />
      <p class="mt-4 leading-7 text-[#657168]">
        If a response does not contain any partial regions, Hum falls back to a
        full navigation. The URL and browser history stay in sync, and Back /
        Forward restores the prior page state.
      </p>

      <section class="mt-12 rounded-3xl border border-[#e3eadb] bg-white p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.14em] text-[#759a37]">
          Try it
        </p>
        <h2 class="mt-2 text-xl font-extrabold">Update one region</h2>
        <p class="mt-2 leading-7 text-[#657168]">
          These links change the URL and replace only the matching partial.
          The surrounding panel stays in place.
        </p>
        <div class="mt-5">
          <nav f-client-nav aria-label="Choose a topic" class="flex flex-wrap gap-2">
            <TopicLink topic="start" label="Start" />
            <TopicLink topic="handlers" label="Handlers" />
            <TopicLink topic="islands" label="Islands" />
            <TopicLink topic="routing" label="Routing" />
          </nav>
          {batch === undefined
            ? (
              <Partial name="topic">
                <div class="mt-4 min-h-24 rounded-2xl bg-[#f1f6e9] p-5">
                  <p class="text-xs font-bold uppercase tracking-[0.14em] text-[#759a37]">
                    Current topic
                  </p>
                  <p class="mt-2 font-semibold text-[#34432f]">
                    {topics[topic] ?? "That topic is not available."}
                  </p>
                </div>
              </Partial>
            )
            : null}
        </div>
      </section>

      <section class="mt-8 rounded-3xl border border-[#e3eadb] bg-white p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.14em] text-[#759a37]">
          Append mode demo
        </p>
        <h2 class="mt-2 text-xl font-extrabold">Load more items</h2>
        <p class="mt-2 leading-7 text-[#657168]">
          Submit the form to fetch the next two items. The list appends them;
          only the form area is replaced.
        </p>
        <div f-client-nav class="mt-5">
          <Partial name="load-more-items" mode={batch === undefined ? "replace" : "append"}>
            <ol class="space-y-3">
              {(batch === undefined ? initialItems : appendedItems).map((item, index) => {
                const itemNumber = (batch ?? 0) * LOAD_MORE_BATCH_SIZE + index + 1;
                return (
                  <li
                    key={itemNumber}
                    class="flex items-start gap-3 rounded-2xl bg-[#f4f8ec] p-4 text-sm leading-6 text-[#465348]"
                  >
                    <span class="grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-[#638b27]">
                      {itemNumber}
                    </span>
                    {item}
                  </li>
                );
              })}
            </ol>
          </Partial>
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
                      class="rounded-xl bg-[#17211b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#2e4033]"
                    >
                      Load more
                    </button>
                  </form>
                )
                : (
                  <p class="rounded-xl bg-[#eff8d6] px-4 py-3 text-sm font-semibold text-[#45651c]">
                    You’ve reached the end of the list.
                  </p>
                )}
            </div>
          </Partial>
        </div>
      </section>

      <p class="mt-12 border-t border-[#e3eadb] pt-6 text-sm text-[#788279]">
        Previous: <a class="font-semibold text-[#587d26] hover:underline" href="/docs/handlers">Route handlers →</a>
      </p>
    </article>
  );
}

function TopicLink({ topic, label }: { topic: string; label: string }) {
  return (
    <a
      href={`/docs/partials/${topic}`}
      f-partial={`/docs/partials?topic=${topic}`}
      class="rounded-full border border-[#dce3d8] px-4 py-2 text-sm font-semibold text-[#59645b] transition hover:border-[#9cba69] hover:bg-white hover:text-[#45651c] aria-[current]:text-[#45651c] aria-[current]:border-[#9cba69] aria-[current]:bg-white"
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
    <div class="rounded-2xl border border-[#e7ecdf] bg-white p-4">
      <code class="font-bold text-[#587d26]">{mode}</code>
      <p class="mt-2 text-sm leading-6 text-[#657168]">{description}</p>
    </div>
  );
}
