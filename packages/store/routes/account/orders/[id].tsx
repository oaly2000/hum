import { define, page } from "@humjs/core";
import { getStore } from "../../../services/store.js";
import type { Order } from "../../../services/database.js";
import { OrderDetail } from "../../_components/OrderDetail.js";

export const head = define.head(<title>Your order — Hum Supply</title>);
export const handlers = define.handlers({
  GET: async (c) => {
    const store = await getStore();
    const session = await store.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    const order = store.repo.order(c.req.param("id") ?? "");
    if (!session || !order || order.user_id !== session.user.id)
      return c.notFound();
    return page({ order });
  },
});
export default define.page<{ order: Order }>(({ data }) => (
  <OrderDetail order={data.order} />
));
