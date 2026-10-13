import { signal } from "@preact/signals";
import { add, setFromProp } from "@humjs/core/events";
import { define } from "@humjs/core";
import { CodeBlock } from "../_components/CodeBlock.js";
import { resetOrder } from "../../client/factories.js";

export const head = define.head(
  <title>Page-level reactivity — Hum Guides</title>,
);

const MAX_TICKETS = 8;

const checkoutExample = `import { signal } from "@preact/signals";
import { add, setFromProp } from "@humjs/core/events";

export default function Checkout() {
  const tickets = signal(2);

  return (
    <form>
      <button type="button" onClick={add(tickets, -1, { min: 1, max: 8 })}>−</button>
      <output>{tickets}</output>
      <button type="button" onClick={add(tickets, 1, { min: 1, max: 8 })}>+</button>

      <input
        type="number"
        value={tickets}
        onInput={setFromProp(tickets, "value")}
      />
    </form>
  );
}`;

const customFactoryExample = `// client/factories.ts — imported by client/main.ts as well
import { defineFactory } from "@humjs/core/events";
import type { Signal } from "@preact/signals";

/** Resets both options at once; each built-in factory drives one signal. */
export const resetOrder = defineFactory(
  "resetOrder",
  (
    tickets: Signal<number>,
    giftWrap: Signal<boolean>,
    defaults: { tickets: number; giftWrap: boolean },
  ) =>
    () => {
      tickets.value = defaults.tickets;
      giftWrap.value = defaults.giftWrap;
    },
);`;

export default function ReactivityPage() {
  // Created with the view: the server renders their value into this response,
  // and the client revives its own copy from the payload.
  const tickets = signal(2);
  const giftWrap = signal(false);

  return (
    <article>
      <h1 class="text-3xl font-black tracking-tight sm:text-4xl">
        Page-level reactivity
      </h1>
      <p class="mt-5 text-lg leading-8 text-[#657168]">
        Markup that comes alive in the browser without a component behind it is
        page-level reactivity. The unit is a facet: a signal or a handler bound to
        a single node of the page’s markup. A signal written as a child or as a
        prop, or a handler the browser rebuilds to write back to one, is all it
        takes—the machinery an island uses, applied to a single node.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        The same machinery as an island
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        An island is a marked DOM range, an index into a payload, and a Preact
        root rendered over that range. A facet is those three pieces with a
        smaller unit: one text node, or one element with its props and handlers.
        What you skip is declaring a component, and shipping a client module for
        it.
      </p>
      <ul class="mt-4 list-disc space-y-2 pl-6 leading-7 text-[#657168]">
        <li>
          <code>hum:signal</code> brackets a text node,{" "}
          <code>data-hum-signal</code> names the props to rebind, and{" "}
          <code>data-hum-handler</code> the handlers. All three
          carry payload indexes, exactly like <code>hum:island</code>, and the
          payload is embedded only when the page has something to revive.
        </li>
        <li>
          Hydration is scheduled for both, so nothing is live until the task
          after <code>boot</code> returns.
        </li>
        <li>
          What a facet cannot do is hold state. An island owns a component
          instance, which survives its region being re-rendered, while a
          page-level signal is revived from the payload of each response.
          Component state, hooks, or a value that has to stay live on the client
          are still island work.
        </li>
      </ul>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Bind a signal
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        As a child it renders its value on the server and stays a live text node;
        as a prop the matching DOM property follows the signal afterwards.
        Booleans work the same way, so a checkbox or a <code>details</code>{" "}
        element reflects its signal by itself.
      </p>
      <CodeBlock code={checkoutExample} />
      <p class="mt-4 leading-7 text-[#657168]">
        One <code>tickets</code>{" "}
        signal is behind the text, the field and both buttons, so a change from
        any of them updates the others. Creating it with the view is on purpose:
        the server renders its value into that response—so it may come from the
        request—and the client revives its own copy. Inside an island, where
        renders repeat, use <code>useSignal</code> instead.
      </p>

      <h2 class="mt-12 text-xl font-extrabold tracking-tight sm:text-2xl">
        Handlers come from factories
      </h2>
      <p class="mt-3 leading-7 text-[#657168]">
        A handler is rebuilt in the browser, so it travels as a factory name plus
        the arguments it was called with—a closure cannot be serialized and throws
        at render time. <code>@humjs/core/events</code> ships{" "}
        <code>add(signal, delta, options)</code>, <code>setValue</code>,{" "}
        <code>toggle</code> and <code>setFromProp(signal, key)</code>; a handler
        of your own is a factory too.
      </p>
      <CodeBlock code={customFactoryExample} />
      <p class="mt-4 leading-7 text-[#657168]">
        The <em>name</em> is what travels to the client, so keep it unique and
        stable, and import the module that defines the factory from the client
        entry or from an island—otherwise the browser has nothing to rebuild it
        with and the page throws{" "}
        <code>Hum: the handler factory … is not registered on the client</code>.
      </p>

      <section class="mt-12 rounded-3xl border border-[#e3eadb] bg-white p-6 sm:p-8">
        <p class="text-sm font-bold uppercase tracking-[0.16em] text-[#759a37]">
          Try it
        </p>
        <h2 class="mt-2 text-lg font-extrabold">
          A checkout made of facets
        </h2>
        <p class="mt-2 leading-7 text-[#657168]">
          Every control below is a facet on this page’s own markup. The quantity
          and the gift-wrap flag are signals; the controls call handlers that the
          browser rebuilt from the payload, including the custom factory behind
          Reset.
        </p>

        <div class="mt-6 flex flex-wrap items-center gap-6">
          <div class="flex items-center gap-3">
            <button
              type="button"
              aria-label="Remove one ticket"
              onClick={add(tickets, -1, { min: 1, max: MAX_TICKETS })}
              class="grid size-11 place-items-center rounded-xl border border-[#dce3d8] text-xl font-bold transition hover:bg-[#f4f8ec]"
            >
              −
            </button>
            <output class="min-w-12 text-center text-3xl font-extrabold tabular-nums">
              {tickets}
            </output>
            <button
              type="button"
              aria-label="Add one ticket"
              onClick={add(tickets, 1, { min: 1, max: MAX_TICKETS })}
              class="grid size-11 place-items-center rounded-xl bg-[#d8f36a] text-xl font-bold text-[#17211b] transition hover:bg-[#e4fa91]"
            >
              +
            </button>
          </div>

          <label class="flex items-center gap-2 text-sm font-semibold text-[#465348]">
            Tickets
            <input
              type="number"
              min="1"
              max={MAX_TICKETS}
              value={tickets}
              onInput={setFromProp(tickets, "value")}
              class="w-24 rounded-xl border border-[#dce3d8] bg-[#fbfcf8] px-3 py-2 outline-none transition focus:border-[#91b94d] focus:ring-2 focus:ring-[#91b94d]/20"
            />
          </label>

          <label class="flex items-center gap-2 text-sm font-semibold text-[#465348]">
            <input
              type="checkbox"
              checked={giftWrap}
              onChange={setFromProp(giftWrap, "checked")}
              class="size-5 accent-[#7fae3a]"
            />
            Gift wrap
          </label>

          <button
            type="button"
            onClick={resetOrder(tickets, giftWrap, {
              tickets: 2,
              giftWrap: false,
            })}
            class="rounded-xl border border-[#dce3d8] px-4 py-2 text-sm font-bold text-[#465348] transition hover:bg-[#f4f8ec]"
          >
            Reset
          </button>
        </div>
      </section>

      <p class="mt-12 border-t border-[#e3eadb] pt-6 text-sm text-[#788279]">
        Previous:{" "}
        <a
          class="font-semibold text-[#587d26] hover:underline"
          href="/docs/partials"
        >
          Partial page updates →
        </a>
      </p>
    </article>
  );
}
