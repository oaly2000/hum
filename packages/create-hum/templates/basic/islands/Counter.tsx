import { useSignal } from "@preact/signals";

/** Interactive island: everything around it stays static HTML. */
export default function Counter({ start = 0 }: { start?: number }) {
  const count = useSignal(start);

  return (
    <div class="counter">
      <button type="button" onClick={() => count.value--}>-</button>
      <output>{count.value}</output>
      <button type="button" onClick={() => count.value++}>+</button>
    </div>
  );
}
