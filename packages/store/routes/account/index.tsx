import { define, page } from "@humjs/core";
import { getStore } from "../../services/store.js";
import { findProduct, priceLabel } from "../../services/catalog.js";
import type { Order } from "../../services/database.js";

export const head = define.head(<title>Your library — Hum Supply</title>);
export const handlers = define.handlers({
  GET: async (c) => {
    const store = await getStore();
    const session = await store.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) return c.redirect("/login", 303);
    return page({
      name: session.user.name,
      orders: store.repo.orders(session.user.id),
      hasCustomer: !!store.repo.customer(session.user.id),
    });
  },
});
export default define.page<{
  name: string;
  orders: Order[];
  hasCustomer: boolean;
}>(({ data }) => (
  <>
    <h1>A few good things, {data.name.split(" ")[0]}.</h1>
    <p class="intro">Everything you've picked up, right where you left it.</p>
    {data.orders.length ? (
      <div class="order-list">
        {data.orders.map((order) => (
          <article class="order-row" key={order.id}>
            <div>
              <span class={`order-dot ${order.status}`} />
              <a href={`/account/orders/${order.id}`}>
                <strong>
                  {findProduct(order.product_slug)?.name ?? order.product_slug}
                </strong>
                <small>
                  {new Date(order.created_at).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}{" "}
                  · Quantity {order.units}
                </small>
              </a>
            </div>
            <span class="order-status">
              {order.status.replaceAll("_", " ")}
            </span>
            <span>{priceLabel(order.amount, order.currency)}</span>
            {order.status === "paid" ? (
              <a
                class="text-link"
                href={`/api/downloads/${order.product_slug}`}
              >
                Download ↓
              </a>
            ) : (
              <a class="text-link" href={`/account/orders/${order.id}`}>
                View order ↗
              </a>
            )}
          </article>
        ))}
      </div>
    ) : (
      <div class="empty-state">
        <span class="empty-flower">✳</span>
        <h2>Your next good thing is out there.</h2>
        <p>
          Start with something small. It'll be waiting here when you need it.
        </p>
        <a class="button primary" href="/products">
          Explore the collection ↗
        </a>
      </div>
    )}
    {data.hasCustomer && (
      <form action="/api/billing/portal" method="post">
        <button class="button secondary">Manage billing in Creem ↗</button>
      </form>
    )}
  </>
));
