import { useSignal } from "@preact/signals";

/** Interactive counter: everything around it stays static HTML. */
export default function Counter({ start = 0 }: { start?: number }) {
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
}
