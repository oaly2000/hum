import { define, page } from "@humjs/core";
import { getStore } from "../../services/store.js";
import type { Order } from "../../services/database.js";
import { OrderDetail } from "../_components/OrderDetail.js";

export const head = define.head(<title>Your purchase — Hum Supply</title>);
export const handlers = define.handlers({
  GET: async (c) => {
    c.header("Cache-Control", "private, no-store");
    const store = await getStore();
    const session = await store.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    const id = c.req.query("order") ?? "";
    if (!session)
      return c.redirect(
        `/login?returnTo=${encodeURIComponent(`/checkout/result?order=${id}`)}`,
        303,
      );
    const order = store.repo.order(id);
    if (!order || order.user_id !== session.user.id) return c.notFound();
    return page({ order });
  },
});
export default define.page<{ order: Order }>(({ data }) => (
  <section class="shell result-page">
    <OrderDetail order={data.order} />
  </section>
));
