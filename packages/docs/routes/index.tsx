import styles from "./index.module.css";
import ThemeToggle from "./_components/ThemeToggle.js";
import { SyntaxCode } from "./_components/CodeBlock.js";
import { useSignal } from "@preact/signals";
import { defineIsland } from "@humjs/core/client";

export const head = (
  <>
    <title>Hum — HTML first. Interactive by choice.</title>
    <meta
      name="description"
      content="Hum is a small, fast web framework for building HTML-first apps with Preact islands."
    />
  </>
);

const heroExample = `import Counter from "./_islands/Counter.js";

export default function Home() {
  return (
    <main>
      <h1>HTML first. Interactive by choice.</h1>
      <Counter start={3} />
    </main>
  );
}`;

const Counter = defineIsland(function({ start = 0 }: { start?: number }) {
  const count = useSignal(start);

  return (
    <div class="flex items-center gap-4">
      <button
        class="grid size-11 place-items-center rounded-xl border border-white/15 bg-white/10 text-xl font-bold transition hover:bg-white/20"
        type="button"
        onClick={() => count.value--}
        aria-label="Decrease count"
      >
        −
      </button>
      <output class="min-w-10 text-center text-3xl font-extrabold tabular-nums">
        {count.value}
      </output>
      <button
        class="grid size-11 place-items-center rounded-xl bg-brand text-xl font-bold text-brand-fg transition hover:bg-[#e4fa91]"
        type="button"
        onClick={() => count.value++}
        aria-label="Increase count"
      >
        +
      </button>
    </div>
  );
})


export default function Home() {
  return (
    <main class={`${styles.page} bg-bg text-fg`}>
      <header class="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" class="flex items-center gap-3" aria-label="Hum home">
          <span class="grid size-10 place-items-center rounded-2xl bg-brand text-xl font-black text-brand-fg shadow-sm">
            夯
          </span>
          <span class="text-xl font-extrabold tracking-tight">Hum</span>
        </a>
        <nav class="flex items-center gap-3 text-sm font-semibold sm:gap-7">
          <a
            class="hidden text-muted transition hover:text-fg sm:inline"
            href="/docs/getting-started"
          >
            Guides
          </a>
          <a
            class="rounded-full border border-line px-4 py-2 transition hover:border-fg sm:px-5"
            href="https://github.com/"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <section class="relative isolate">
        <div
          aria-hidden="true"
          class="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_50%_0%,var(--hum-glow-1)_0%,var(--hum-glow-2)_35%,var(--hum-bg)_78%)]"
        />
        <div class="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-32 lg:pt-24">
          <div class="max-w-2xl">
            <p class="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface-70 px-4 py-2 text-sm font-semibold text-accent-strong shadow-sm">
              <span class="size-2 rounded-full bg-[#89b931]"></span>
              A fresh take on server-rendered apps
            </p>
            <h1 class="text-balance text-5xl font-black leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              HTML first.
              <br />
              <span class="text-accent">Interactive</span> by choice.
            </h1>
            <p class="mt-7 max-w-xl text-lg leading-8 text-muted sm:text-xl">
              Build fast, thoughtful web experiences with Preact, file-based
              routing, and islands that only wake up when you need them.
            </p>
            <div class="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="#start"
                class="rounded-full bg-fg px-6 py-3.5 font-bold text-bg shadow-lg shadow-elevation transition hover:-translate-y-0.5 hover:bg-fg-hover"
              >
                Get started <span aria-hidden="true">→</span>
              </a>
              <a
                href="/docs/getting-started"
                class="rounded-full px-6 py-3.5 font-bold text-fg-soft transition hover:bg-surface-70"
              >
                Explore Hum
              </a>
            </div>
            <p class="mt-9 text-sm font-medium text-muted">
              Hono <span class="mx-2 text-faint">·</span> Preact
              <span class="mx-2 text-faint">·</span> Vite
            </p>
          </div>

          <div class="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div
              aria-hidden="true"
              class="absolute -right-6 -top-8 size-28 rounded-full bg-[#d7f15e] blur-2xl sm:-right-3"
            />
            <div
              aria-hidden="true"
              class="absolute -bottom-10 -left-8 size-36 rounded-full bg-[#b8e4a0] blur-3xl"
            />
            <div class="relative rotate-1 rounded-[2rem] border border-line bg-surface-80 p-3 shadow-[0_30px_100px_-35px_rgba(36,65,34,0.35)] backdrop-blur">
              <div class="overflow-hidden rounded-[1.45rem] bg-code text-[#e8f1e8]">
                <div class="flex items-center gap-2 border-b border-white/10 px-5 py-4">
                  <span class="size-2.5 rounded-full bg-[#ff786b]"></span>
                  <span class="size-2.5 rounded-full bg-[#f3c95d]"></span>
                  <span class="size-2.5 rounded-full bg-[#83c86f]"></span>
                  <span class="ml-3 text-xs font-medium text-[#8e9c8f]">
                    routes/index.tsx
                  </span>
                </div>
                <pre class="overflow-x-auto p-6 font-mono text-sm leading-6 text-[#e8f1e8] sm:p-8">
                  <SyntaxCode code={heroExample} language="typescript" />
                </pre>
                <div class="flex items-center justify-between border-t border-white/10 bg-white/[0.04] px-6 py-4 text-xs">
                  <span class="text-[#9eaa9f]">Server-rendered by default</span>
                  <span class="flex items-center gap-2 text-[#bce979]">
                    <span class="size-1.5 rounded-full bg-[#bce979]"></span>
                    Ready in 34ms
                  </span>
                </div>
              </div>
            </div>
            <div class="absolute -bottom-7 right-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold shadow-xl shadow-elevation sm:-right-7">
              <span class="mr-2 text-accent">✳</span>{" "}
              Just the JavaScript you need
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        class="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"
      >
        <div class="mx-auto max-w-2xl text-center">
          <p class="text-sm font-bold uppercase tracking-[0.18em] text-accent">
            Small by design
          </p>
          <h2 class="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Less shipped. More enjoyed.
          </h2>
          <p class="mt-5 text-lg leading-8 text-muted">
            Start with a complete page. Add client-side behavior only to the
            pieces that benefit from it.
          </p>
        </div>

        <div class="mt-12 grid gap-4 md:grid-cols-3">
          <article class="rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation">
            <span class="grid size-12 place-items-center rounded-2xl bg-accent-bg text-2xl text-accent">
              ◉
            </span>
            <h3 class="mt-6 text-xl font-extrabold">HTML, up front</h3>
            <p class="mt-3 leading-7 text-muted">
              Pages render on the server and arrive ready to read. Keep the
              browser payload focused on what matters.
            </p>
            <a
              class="mt-5 inline-flex font-bold text-accent hover:underline"
              href="/docs/handlers"
            >
              Read about handlers <span class="ml-2" aria-hidden="true">→</span>
            </a>
          </article>
          <article class="rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation">
            <span class="grid size-12 place-items-center rounded-2xl bg-accent-bg text-2xl text-[#38845a]">
              ✳
            </span>
            <h3 class="mt-6 text-xl font-extrabold">Islands, on purpose</h3>
            <p class="mt-3 leading-7 text-muted">
              Hydrate individual Preact components when a little interaction
              makes the experience better.
            </p>
            <a
              class="mt-5 inline-flex font-bold text-accent hover:underline"
              href="/docs/partials"
            >
              Explore partials <span class="ml-2" aria-hidden="true">→</span>
            </a>
          </article>
          <article class="rounded-3xl border border-line bg-surface p-7 shadow-sm shadow-elevation">
            <span class="grid size-12 place-items-center rounded-2xl bg-[#fff2d8] text-2xl text-[#b47d21]">
              ↗
            </span>
            <h3 class="mt-6 text-xl font-extrabold">A familiar toolkit</h3>
            <p class="mt-3 leading-7 text-muted">
              Build with file-based routes, Hono, Preact, and Vite—tools that
              feel right at home in the modern web.
            </p>
          </article>
        </div>
      </section>

      <section id="demo" class="px-5 py-12 sm:px-8 sm:py-20">
        <div class="mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2rem] bg-code p-7 text-white sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16">
          <div>
            <p class="text-sm font-bold uppercase tracking-[0.18em] text-[#b8df73]">
              A tiny island
            </p>
            <h2 class="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Try the interactive bit.
            </h2>
            <p class="mt-5 max-w-lg leading-7 text-[#c0cbc0]">
              This counter is hydrated in your browser. Everything else on this
              page stays plain, server-rendered HTML.
            </p>
          </div>
          <div class="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.06] p-7">
            <span class="mb-5 text-sm font-medium text-[#aebaae]">
              Count something
            </span>
            <Counter start={3} />
            <span class="mt-5 text-xs text-[#89978a]">
              Only this little island needs JavaScript.
            </span>
          </div>
        </div>
      </section>

      <section
        id="start"
        class="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8 sm:py-28"
      >
        <p class="text-sm font-bold uppercase tracking-[0.18em] text-accent">
          Your next project starts here
        </p>
        <h2 class="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
          Keep it simple.
          <br class="hidden sm:block" /> Make it feel alive.
        </h2>
        <p class="mt-5 text-lg text-muted">
          Create a Hum app and make the web yours.
        </p>
        <p class="mt-5 text-sm font-semibold text-accent">
          <a class="hover:underline" href="/docs/handlers">Route handlers</a>
          <span class="mx-3 text-faint">·</span>
          <a class="hover:underline" href="/docs/partials">Partial updates</a>
        </p>
        <div class="mx-auto mt-8 flex w-fit max-w-full items-center gap-4 rounded-2xl bg-code px-5 py-4 text-left font-mono text-sm text-[#e7f1e4] shadow-xl shadow-elevation sm:px-7">
          <span class="select-none text-[#8eab71]">$</span>
          <code class="overflow-x-auto whitespace-nowrap">
            npm create hum@latest
          </code>
          <span class="select-none text-[#9bc96a]">↵</span>
        </div>
      </section>

      <footer class="border-t border-line">
        <div class="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <a href="/" class="font-extrabold tracking-tight text-fg">
            hum<span class="text-accent">.</span>
          </a>
          <p>Built for the parts of the web that should stay simple.</p>
        </div>
      </footer>
    </main>
  );
}
