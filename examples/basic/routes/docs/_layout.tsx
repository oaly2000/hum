import type { ComponentChildren } from "preact";
import type { RouteProps } from "@hum/core";

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
      <div class="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:py-14">
        <aside class="lg:sticky lg:top-8 lg:self-start">
          <p class="mb-3 px-3 text-xs font-bold uppercase tracking-[0.16em] text-[#879185]">
            Guides
          </p>
          <nav class="flex gap-2 overflow-x-auto lg:flex-col">
            <a
              href="/docs/routing"
              aria-current={currentPath === "/docs/routing"
                ? "page"
                : undefined}
              class={[
                "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                currentPath === "/docs/routing"
                  ? "bg-[#edf6d8] text-[#45651c]"
                  : "text-[#657168] hover:bg-white hover:text-[#17211b]",
              ].join(" ")}
            >
              Routing
            </a>
            <a
              href="/docs/hono"
              aria-current={currentPath === "/docs/hono" ? "page" : undefined}
              class={[
                "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                currentPath === "/docs/hono"
                  ? "bg-[#edf6d8] text-[#45651c]"
                  : "text-[#657168] hover:bg-white hover:text-[#17211b]",
              ].join(" ")}
            >
              Middleware
            </a>
            <a
              href="/docs/handlers"
              aria-current={currentPath === "/docs/handlers"
                ? "page"
                : undefined}
              class={[
                "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                currentPath === "/docs/handlers"
                  ? "bg-[#edf6d8] text-[#45651c]"
                  : "text-[#657168] hover:bg-white hover:text-[#17211b]",
              ].join(" ")}
            >
              Route handlers
            </a>
            <a
              href="/docs/partials"
              aria-current={currentPath === "/docs/partials"
                ? "page"
                : undefined}
              class={[
                "shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                currentPath === "/docs/partials"
                  ? "bg-[#edf6d8] text-[#45651c]"
                  : "text-[#657168] hover:bg-white hover:text-[#17211b]",
              ].join(" ")}
            >
              Partials
            </a>
          </nav>
        </aside>
        <main class="min-w-0 max-w-3xl pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
