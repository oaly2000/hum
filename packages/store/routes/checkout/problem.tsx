import { define } from "@humjs/core";

export const head = define.head(
  <title>A small interruption — Hum Supply</title>,
);
export default define.page(({ url }) => {
  const code = url.searchParams.get("code");
  const message =
    code === "409"
      ? "The product or order has changed. Reload its page before trying again."
      : code === "403"
        ? "Please submit your purchase from this store's product page."
        : code === "400"
          ? "Check your product and quantity, then try again."
          : "Checkout is temporarily unavailable. Please give it a moment and try again.";
  return (
    <section class="shell empty-state">
      <p class="eyebrow">A SMALL INTERRUPTION</p>
      <h1>Let's try that again.</h1>
      <p>{message}</p>
      <p>
        If you've already paid, check your library before starting another
        order.
      </p>
      <a class="button primary" href="/account">
        Check your library ↗
      </a>
      <p>
        <a class="text-link" href="/products">
          Back to the collection ↗
        </a>
      </p>
    </section>
  );
});
