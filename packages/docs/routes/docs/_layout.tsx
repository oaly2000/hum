import type { ComponentChildren } from "preact";
import type { RouteProps } from "@humjs/core";

/**
 * Sidebar entries, in reading order, labelled with each guide's own title. The
 * list is a column on wide screens and collapses behind one toggle on narrow
 * ones, so the labels no longer have to fit a horizontal strip.
 */
const GUIDES = [
  { href: "/docs/routing", label: "Routing and rendering" },
  { href: "/docs/hono", label: "Hono and Hum middleware" },
  { href: "/docs/handlers", label: "Route handlers" },
  { href: "/docs/partials", label: "Partial page updates" },
  { href: "/docs/facets", label: "Page-level reactivity" },
  { href: "/docs/streaming", label: "Experimental streaming" },
];

export default function DocsLayout({
  children,
  url,
}: RouteProps & { children?: ComponentChildren }) {
  const currentPath = url.pathname;

  return (
    <div class="min-h-screen bg-[#fbfcf8] text-[#17211b]">
      <header class="border-b border-[#e7ecdf] bg-white/80">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" class="flex items-center gap-3" aria-label="Hum home">
            <span class="grid size-9 place-items-center rounded-xl bg-[#d8f36a] text-lg font-black">
              夯
            </span>
            <span class="text-lg font-extrabold tracking-tight">Hum</span>
            <span class="ml-1 border-l border-[#dce3d8] pl-3 text-sm font-medium text-[#758076]">
              Guides
            </span>
          </a>
          <a
            href="/"
            class="rounded-full px-4 py-2 text-sm font-semibold text-[#657168] transition hover:bg-[#f0f5e8] hover:text-[#17211b]"
          >
            Back to home <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <div class="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16 lg:py-14">
        <aside class="lg:sticky lg:top-8 lg:self-start">
          {/*
            Narrow screens keep the whole guide list behind one toggle. A
            checkbox does that without shipping client script, and the list
            follows it through `peer-checked`; from `lg` up the list is always
            visible and the toggle is gone.
          */}
          <input id="docs-nav" type="checkbox" class="peer sr-only" />
          <label
            for="docs-nav"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#e3eadb] bg-white px-3 py-2.5 text-sm font-semibold text-[#465348] transition peer-checked:border-[#9cba69] peer-checked:text-[#45651c] peer-focus-visible:ring-2 peer-focus-visible:ring-[#9cba69]/40 lg:hidden"
          >
            Guides
            <span aria-hidden="true" class="text-[#879185]">▾</span>
          </label>
          <p class="mb-3 hidden px-3 text-xs font-bold uppercase tracking-[0.16em] text-[#879185] lg:block">
            Guides
          </p>
          <nav class="mt-2 hidden flex-col gap-2 peer-checked:flex lg:mt-0 lg:flex">
            {GUIDES.map((guide) => (
              <a
                key={guide.href}
                href={guide.href}
                aria-current={currentPath === guide.href ? "page" : undefined}
                class={[
                  "rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  currentPath === guide.href
                    ? "bg-[#edf6d8] text-[#45651c]"
                    : "text-[#657168] hover:bg-white hover:text-[#17211b]",
                ].join(" ")}
              >
                {guide.label}
              </a>
            ))}
          </nav>
        </aside>
        <main class="min-w-0 max-w-3xl pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
