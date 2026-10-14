import { define } from "@humjs/core";
import Counter from "../islands/Counter.js";

export const head = define.head(<title>{{name}}</title>);

export default function Home() {
  return (
    <section class="mx-auto max-w-3xl space-y-6 p-8">
      <h1 class="text-3xl font-bold">{{name}}</h1>
      {/* Only this island ships JavaScript; the rest stays static HTML. */}
      <Counter start={0} />
    </section>
  );
}
