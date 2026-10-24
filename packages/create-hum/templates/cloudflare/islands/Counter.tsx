import { useSignal } from "@preact/signals";
import { defineIsland } from "@humjs/core/shared";

/** Interactive island: everything around it stays static HTML. */
function Counter({ start = 0 }: { start?: number }) {
  const count = useSignal(start);

  return (
    <div class="counter">
      <button type="button" onClick={() => count.value--}>-</button>
      <output>{count.value}</output>
      <button type="button" onClick={() => count.value++}>+</button>
    </div>
  );
}

export default defineIsland(Counter);
