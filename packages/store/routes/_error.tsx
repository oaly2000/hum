export default function ErrorPage() {
  return (
    <section class="shell empty-state">
      <p class="eyebrow">A SMALL INTERRUPTION</p>
      <h1>Let's give it another moment.</h1>
      <p>
        We couldn't load this page. Your purchases are safe in your library.
      </p>
      <a class="button secondary" href="/account">
        Visit your library ↗
      </a>
    </section>
  );
}
import { define } from "@humjs/core";
export const head = define.head(
  <title>A small interruption — Hum Supply</title>,
);
