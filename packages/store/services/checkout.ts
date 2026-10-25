import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { findProduct } from "./catalog.js";
import type { StoreRepository } from "./database.js";
import type { PaymentGateway, Checkout } from "./payment.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function entityId(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : typeof record(value).id === "string"
      ? (record(value).id as string)
      : undefined;
}

export class CheckoutService {
  private readonly inFlight = new Map<string, Promise<string>>();
  constructor(
    readonly repo: StoreRepository,
    readonly payments: PaymentGateway,
    readonly origin: string,
    readonly productIds: Record<string, string | undefined>,
  ) {}

  async buy(
    user: { id: string; email: string },
    slug: string,
    units: number,
    id: string = randomUUID(),
  ) {
    const key = `${user.id}:${id}`;
    if (this.inFlight.has(key))
      throw new HTTPException(409, {
        message:
          "This checkout is already being created. Please wait a moment.",
      });
    const pending = this.createCheckout(user, slug, units, id);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async createCheckout(
    user: { id: string; email: string },
    slug: string,
    units: number,
    id: string,
  ) {
    const product = findProduct(slug);
    if (
      !product ||
      !Number.isInteger(units) ||
      units < 1 ||
      units > 8 ||
      !/^[a-f0-9-]{36}$/i.test(id)
    ) {
      throw new HTTPException(400, {
        message: "Choose a valid product and a quantity between 1 and 8.",
      });
    }
    const productId = this.productIds[slug];
    if (!productId)
      throw new HTTPException(503, {
        message: "This product is not available for checkout yet.",
      });
    let order = this.repo.order(id);
    if (
      order &&
      (order.user_id !== user.id ||
        order.product_slug !== slug ||
        order.units !== units)
    ) {
      throw new HTTPException(409, {
        message: "Please reload the product page before trying again.",
      });
    }
    if (order?.status === "paid") return `${this.origin}/account/orders/${id}`;
    if (
      order?.status === "refunded" ||
      order?.status === "disputed" ||
      order?.status === "expired"
    )
      throw new HTTPException(409, {
        message: "Start a new order from the product page.",
      });
    if (order?.checkout_url) return order.checkout_url;

    const current = await this.payments.product(productId);
    if (
      current.price !== product.price ||
      current.currency.toUpperCase() !== product.currency ||
      current.status === "archived"
    ) {
      throw new HTTPException(409, {
        message:
          "This product's price or availability has changed. Please try again later.",
      });
    }
    const now = Date.now();
    this.repo.db
      .prepare(
        `INSERT OR IGNORE INTO store_orders
      (id,user_id,product_slug,product_id,units,amount,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        user.id,
        slug,
        productId,
        units,
        current.price * units,
        current.currency.toUpperCase(),
        now,
        now,
      );
    // A stable request ID also allows the provider to correlate retries after a network interruption.
    const checkout = await this.payments.checkout({
      productId,
      units,
      requestId: id,
      email: user.email,
      successUrl: `${this.origin}/checkout/result?order=${id}`,
      metadata: { orderId: id, userId: user.id },
    });
    const url = new URL(checkout.checkoutUrl ?? "");
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "creem.io" || url.hostname.endsWith(".creem.io"))
    ) {
      throw new Error("Unexpected checkout destination.");
    }
    this.repo.db
      .prepare(
        `UPDATE store_orders SET checkout_id = ?, checkout_url = ?,
      status = CASE WHEN status = 'pending' THEN 'checkout_created' ELSE status END, updated_at = ? WHERE id = ?`,
      )
      .run(checkout.id, url.href, Date.now(), id);
    return url.href;
  }

  applyCheckout(checkout: Checkout) {
    const metadata = record(checkout.metadata);
    const id = typeof metadata.orderId === "string" ? metadata.orderId : "";
    const order = this.repo.order(id);
    if (!order || metadata.userId !== order.user_id)
      throw new Error("Checkout does not match a local order.");
    if (order.checkout_id && checkout.id !== order.checkout_id)
      throw new Error("Checkout ID mismatch.");
    if (entityId(checkout.product) !== order.product_id)
      throw new Error("Checkout product mismatch.");
    const providerOrder = record(checkout.order);
    // Checkout owns quantity; the provider's order total may additionally include tax.
    if (
      providerOrder.status !== "paid" ||
      String(providerOrder.currency).toUpperCase() !== order.currency ||
      (checkout.units ?? 1) !== order.units ||
      typeof providerOrder.amount !== "number" ||
      providerOrder.amount + Number(providerOrder.discountAmount ?? 0) <
        order.amount
    ) {
      throw new Error("Order payment details do not match.");
    }
    const providerOrderId = entityId(checkout.order);
    const customerId = entityId(checkout.customer);
    if (!providerOrderId || !customerId)
      throw new Error("Missing provider order or customer.");
    if (order.status === "refunded" || order.status === "disputed") return;
    this.repo.db
      .prepare(
        `UPDATE store_orders SET status = 'paid', checkout_id = ?, provider_order_id = ?,
      customer_id = ?, updated_at = ? WHERE id = ?`,
      )
      .run(checkout.id, providerOrderId, customerId, Date.now(), id);
    this.repo.db
      .prepare(
        "INSERT OR REPLACE INTO store_entitlements(order_id,user_id,product_slug,active) VALUES (?,?,?,1)",
      )
      .run(id, order.user_id, order.product_slug);
    this.repo.db
      .prepare(
        "INSERT INTO store_customers(user_id,customer_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id",
      )
      .run(order.user_id, customerId);
  }

  processEvent(event: { id: string; eventType: string; object: unknown }) {
    const payload = JSON.stringify(event);
    try {
      return this.repo.transaction(() => {
        const existing = this.repo.db
          .prepare("SELECT status FROM store_webhook_events WHERE id = ?")
          .get(event.id);
        if (existing?.status === "processed") return "duplicate";
        if (event.eventType === "checkout.completed")
          this.applyCheckout(event.object as Checkout);
        if (
          (event.eventType === "refund.created" &&
            record(event.object).status === "succeeded") ||
          event.eventType === "dispute.created"
        ) {
          const object = record(event.object);
          const providerOrderId = entityId(object.order);
          if (!providerOrderId)
            throw new Error("Missing order reference on reversal.");
          const order = this.repo.db
            .prepare("SELECT * FROM store_orders WHERE provider_order_id = ?")
            .get(providerOrderId) as unknown as { id: string } | undefined;
          // Retry if the reversal arrived before its checkout event.
          if (!order)
            throw new Error("Reversal arrived before the original order.");
          this.repo.db
            .prepare(
              "UPDATE store_orders SET status = ?, updated_at = ? WHERE id = ?",
            )
            .run(
              event.eventType === "refund.created" ? "refunded" : "disputed",
              Date.now(),
              order.id,
            );
          this.repo.db
            .prepare(
              "UPDATE store_entitlements SET active = 0 WHERE order_id = ?",
            )
            .run(order.id);
        }
        this.repo.db
          .prepare(
            "INSERT OR REPLACE INTO store_webhook_events(id,type,status,payload,created_at) VALUES (?,?,'processed',?,?)",
          )
          .run(event.id, event.eventType, payload, Date.now());
        return "processed";
      });
    } catch (error) {
      this.repo.db
        .prepare(
          "INSERT OR REPLACE INTO store_webhook_events(id,type,status,payload,error,created_at) VALUES (?,?,'failed',?,?,?)",
        )
        .run(
          event.id,
          event.eventType,
          payload,
          error instanceof Error ? error.message : "Processing failed",
          Date.now(),
        );
      throw error;
    }
  }

  async reconcile(id: string) {
    const order = this.repo.order(id);
    if (!order?.checkout_id || order.status !== "checkout_created") return;
    const checkout = await this.payments.retrieve(order.checkout_id);
    if (checkout.status === "completed")
      this.repo.transaction(() => this.applyCheckout(checkout));
    if (checkout.status === "expired")
      this.repo.db
        .prepare(
          "UPDATE store_orders SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'checkout_created'",
        )
        .run(Date.now(), id);
  }
}
