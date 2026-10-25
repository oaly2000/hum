import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { openDatabase, StoreRepository } from "../services/database.js";
import { CheckoutService } from "../services/checkout.js";
import {
  createPayments,
  type Checkout,
  type PaymentGateway,
} from "../services/payment.js";
import { createAuth } from "../services/auth.js";
import { createStoreApi, safeReturnTo } from "../services/http.js";

const origin = "http://localhost:3001";
const secret = "test-webhook-secret";
const user = { id: "user-a", email: "a@example.com" };
let repo: StoreRepository;
let payments: PaymentGateway;
let service: CheckoutService;

beforeEach(() => {
  vi.stubEnv("CREEM_WEBHOOK_SECRET", secret);
  repo = new StoreRepository(openDatabase(":memory:"));
  payments = {
    product: vi.fn(async () => ({
      id: "prod_a",
      price: 2900,
      currency: "USD",
      status: "active",
    })),
    checkout: vi.fn(async () => ({
      id: "ch_a",
      checkoutUrl: "https://test.creem.io/checkout/ch_a",
    })),
    retrieve: vi.fn(),
    portal: vi.fn(async () => "https://creem.io/portal/customer"),
    verify: createPayments("creem_test_fixture", secret).verify,
  };
  service = new CheckoutService(repo, payments, origin, {
    "launch-kit": "prod_a",
  });
});
afterEach(() => {
  repo.db.close();
  vi.unstubAllEnvs();
});

function completed(id: string, checkoutId = "ch_a"): Checkout {
  return {
    id: checkoutId,
    status: "completed",
    product: "prod_a",
    customer: "cust_a",
    units: 1,
    metadata: { orderId: id, userId: user.id },
    order: { id: "ord_a", status: "paid", amount: 2900, currency: "USD" },
  };
}

describe("commerce state", () => {
  it("reuses a checkout on a repeated form submission and rejects changed parameters", async () => {
    const id = randomUUID();
    const url = await service.buy(user, "launch-kit", 1, id);
    expect(await service.buy(user, "launch-kit", 1, id)).toBe(url);
    expect(payments.checkout).toHaveBeenCalledTimes(1);
    await expect(service.buy(user, "launch-kit", 2, id)).rejects.toThrow(
      "reload",
    );
    await expect(
      service.buy({ ...user, id: "other" }, "launch-kit", 1, id),
    ).rejects.toThrow("reload");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
  });

  it("rejects invalid quantities and stale prices before creating a checkout", async () => {
    for (const units of [0, 9, 1.5, NaN])
      await expect(service.buy(user, "launch-kit", units)).rejects.toThrow(
        "valid product",
      );
    vi.mocked(payments.product).mockResolvedValue({
      id: "prod_a",
      price: 3000,
      currency: "USD",
    });
    await expect(service.buy(user, "launch-kit", 1)).rejects.toThrow(
      "price or availability",
    );
    expect(payments.checkout).not.toHaveBeenCalled();
  });

  it("blocks overlapping checkout requests for the same order", async () => {
    const id = randomUUID();
    let release!: () => void;
    vi.mocked(payments.product).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { id: "prod_a", price: 2900, currency: "USD" };
    });
    const pending = service.buy(user, "launch-kit", 1, id);
    await expect(service.buy(user, "launch-kit", 1, id)).rejects.toThrow(
      "already being created",
    );
    release();
    await pending;
    expect(payments.checkout).toHaveBeenCalledTimes(1);
  });

  it("commits payment and access atomically, deduplicates events, and preserves revocations", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    const event = {
      id: "evt_paid",
      eventType: "checkout.completed",
      object: completed(id),
    };
    expect(service.processEvent(event)).toBe("processed");
    expect(service.processEvent(event)).toBe("duplicate");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(true);
    expect(repo.customer(user.id)).toBe("cust_a");
    service.processEvent({
      id: "evt_refund",
      eventType: "refund.created",
      object: { order: "ord_a", status: "succeeded" },
    });
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
    service.processEvent({ ...event, id: "evt_late_paid" });
    expect(repo.order(id)?.status).toBe("refunded");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
  });

  it("records an early reversal as failed and can retry after payment arrives", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    const refund = {
      id: "evt_refund",
      eventType: "refund.created",
      object: { order: "ord_a", status: "succeeded" },
    };
    expect(() => service.processEvent(refund)).toThrow("before the original");
    expect(
      repo.db
        .prepare("SELECT status FROM store_webhook_events WHERE id = ?")
        .get(refund.id)?.status,
    ).toBe("failed");
    service.processEvent({
      id: "evt_paid",
      eventType: "checkout.completed",
      object: completed(id),
    });
    service.processEvent(refund);
    expect(repo.order(id)?.status).toBe("refunded");
  });

  it("rolls back malformed payment events without granting access", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    const checkout = completed(id);
    for (const malformed of [
      { ...checkout, product: "prod_other" },
      { ...checkout, metadata: { orderId: id, userId: "other" } },
      { ...checkout, units: 2 },
      { ...checkout, order: { ...(checkout.order as object), amount: 1 } },
    ]) {
      expect(() =>
        service.processEvent({
          id: randomUUID(),
          eventType: "checkout.completed",
          object: malformed,
        }),
      ).toThrow();
    }
    expect(repo.order(id)?.status).toBe("checkout_created");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
  });

  it("reconciles through a server-side checkout lookup", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    vi.mocked(payments.retrieve).mockResolvedValue(completed(id));
    await service.reconcile(id);
    expect(repo.order(id)?.status).toBe("paid");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(true);
  });

  it("marks an expired provider checkout without granting access", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    vi.mocked(payments.retrieve).mockResolvedValue({
      id: "ch_a",
      status: "expired",
    });
    await service.reconcile(id);
    expect(repo.order(id)?.status).toBe("expired");
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
    await expect(service.buy(user, "launch-kit", 1, id)).rejects.toThrow(
      "new order",
    );
  });

  it("does not revoke a pending refund and does not reassign another user's customer", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    service.processEvent({
      id: "evt_paid",
      eventType: "checkout.completed",
      object: completed(id),
    });
    service.processEvent({
      id: "evt_pending_refund",
      eventType: "refund.created",
      object: { order: "ord_a", status: "pending" },
    });
    expect(repo.canDownload(user.id, "launch-kit")).toBe(true);
    const other = { id: "user-other", email: "other@example.com" };
    const otherId = randomUUID();
    vi.mocked(payments.checkout).mockResolvedValue({
      id: "ch_other",
      checkoutUrl: "https://test.creem.io/checkout/ch_other",
    });
    await service.buy(other, "launch-kit", 1, otherId);
    const checkout = {
      ...completed(otherId, "ch_other"),
      metadata: { orderId: otherId, userId: other.id },
      order: { ...(completed(otherId).order as object), id: "ord_other" },
    };
    expect(() =>
      service.processEvent({
        id: "evt_other",
        eventType: "checkout.completed",
        object: checkout,
      }),
    ).toThrow();
    expect(repo.customer(user.id)).toBe("cust_a");
    expect(repo.customer(other.id)).toBeUndefined();
    expect(repo.canDownload(other.id, "launch-kit")).toBe(false);
    expect(repo.order(otherId)?.status).toBe("checkout_created");
  });
});

describe("HTTP boundaries", () => {
  it("validates real SDK signatures, rejects altered bodies, and never trusts the result URL", async () => {
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    const auth = await createAuth(
      repo.db,
      origin,
      "a-long-random-secret-only-for-tests-0123456789",
    );
    const app = createStoreApi({
      origin,
      repo,
      auth,
      payments,
      checkout: service,
    });
    const event = {
      id: "evt_real",
      eventType: "checkout.completed",
      created_at: Date.now(),
      object: {
        ...completed(id),
        mode: "test",
        object: "checkout",
        order: {
          ...(completed(id).order as object),
          mode: "test",
          object: "order",
          product: "prod_a",
          type: "onetime",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    };
    const raw = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    const invalid = await app.request("/api/webhooks/creem", {
      method: "POST",
      headers: { "creem-signature": signature },
      body: `${raw} `,
    });
    expect(invalid.status).toBe(400);
    expect(repo.canDownload(user.id, "launch-kit")).toBe(false);
    const valid = await app.request("/api/webhooks/creem", {
      method: "POST",
      headers: { "creem-signature": signature },
      body: raw,
    });
    expect(valid.status).toBe(200);
    expect(repo.canDownload(user.id, "launch-kit")).toBe(true);
    expect((await app.request(`/api/orders/${id}/status`)).status).toBe(401);
    expect((await app.request("/api/downloads/launch-kit")).status).toBe(401);
  });

  it("supports HTML registration, protects other users' orders, and gates downloads", async () => {
    const auth = await createAuth(
      repo.db,
      origin,
      "another-random-secret-only-for-tests-0123456789",
    );
    const app = createStoreApi({
      origin,
      repo,
      auth,
      payments,
      checkout: service,
    });
    const response = await app.request("/session/sign-up", {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({
        name: "A Builder",
        email: "builder@example.com",
        password: "long-test-password-123",
        returnTo: "/account",
      }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/account");
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.email).toBe("builder@example.com");
    const id = randomUUID();
    await service.buy(user, "launch-kit", 1, id);
    expect(
      (await app.request(`/api/orders/${id}/status`, { headers: { cookie } }))
        .status,
    ).toBe(404);
    expect(
      (await app.request("/api/downloads/launch-kit", { headers: { cookie } }))
        .status,
    ).toBe(404);
    const ownedId = randomUUID();
    vi.mocked(payments.checkout).mockResolvedValue({
      id: "ch_b",
      checkoutUrl: "https://test.creem.io/checkout/ch_b",
    });
    await service.buy(session!.user, "launch-kit", 1, ownedId);
    const checkout = {
      ...completed(ownedId, "ch_b"),
      metadata: { orderId: ownedId, userId: session!.user.id },
      order: { ...(completed(ownedId).order as object), id: "ord_b" },
    };
    service.processEvent({
      id: "evt_b",
      eventType: "checkout.completed",
      object: checkout,
    });
    const download = await app.request("/api/downloads/launch-kit", {
      headers: { cookie },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(await download.text()).toContain("Launch Kit");
    const crossSite = await app.request("/api/checkout", {
      method: "POST",
      headers: { origin: "https://other.example", cookie },
    });
    expect(crossSite.status).toBe(403);
    const signOut = await app.request("/session/sign-out", {
      method: "POST",
      headers: { origin, cookie },
      body: new URLSearchParams(),
    });
    expect(signOut.status).toBe(303);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();
  });

  it("keeps login return URLs local", () => {
    for (const path of [
      "https://other.example",
      "//other.example",
      "/\\other.example",
      "/\r\nother",
      "/\t/other.example",
    ])
      expect(safeReturnTo(path)).toBe("/account");
    expect(safeReturnTo("/products/launch-kit?q=1")).toBe(
      "/products/launch-kit?q=1",
    );
  });
});
