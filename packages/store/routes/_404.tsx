export default function NotFound() {
  return (
    <section class="shell empty-state">
      <p class="eyebrow">404 / A LITTLE OFF THE PATH</p>
      <h1>Nothing on this shelf.</h1>
      <p>Let's find you something good instead.</p>
      <a class="button primary" href="/products">
        Back to the collection ↗
      </a>
    </section>
  );
}
import { define } from "@humjs/core";
export const head = define.head(
  <title>Nothing on this shelf — Hum Supply</title>,
);
