import type { Order } from "../../services/database.js";
import { findProduct, priceLabel } from "../../services/catalog.js";
import { OrderStatus } from "../_islands/OrderStatus.js";

export function OrderDetail({ order }: { order: Order }) {
  const product = findProduct(order.product_slug);
  const waiting =
    order.status === "pending" || order.status === "checkout_created";
  return (
    <div class="order-detail">
      <span class="receipt-mark" aria-hidden="true">
        {order.status === "paid" ? "✓" : waiting ? "◎" : "↩"}
      </span>
      <p class="eyebrow">
        {order.status === "paid"
          ? "A GOOD CHOICE"
          : waiting
            ? "ONE MOMENT"
            : "ORDER UPDATE"}
      </p>
      <h1>
        {order.status === "paid"
          ? "It's yours. Make something good."
          : waiting
            ? "A good thing is on its way."
            : order.status === "expired"
              ? "This checkout has expired."
              : "This purchase is no longer active."}
      </h1>
      <p class="intro">
        {product?.name} · {order.units} {order.units === 1 ? "copy" : "copies"}{" "}
        · {priceLabel(order.amount, order.currency)} before applicable tax
      </p>
      {order.status === "paid" && (
        <a class="button primary" href={`/api/downloads/${order.product_slug}`}>
          Download your digital edition ↓
        </a>
      )}
      {order.status === "expired" && (
        <a class="button primary" href={`/products/${order.product_slug}`}>
          Start a new order ↗
        </a>
      )}
      {waiting && (
        <>
          <OrderStatus orderId={order.id} />
          <form action={`/api/orders/${order.id}/reconcile`} method="post">
            <button class="button secondary">Check payment status ↻</button>
          </form>
          {order.checkout_url && (
            <a class="text-link resume-checkout" href={order.checkout_url}>
              Return to secure checkout ↗
            </a>
          )}
        </>
      )}
      <p class="receipt-id">Order {order.id}</p>
      <a class="text-link" href="/account">
        Back to your library ↗
      </a>
    </div>
  );
}
