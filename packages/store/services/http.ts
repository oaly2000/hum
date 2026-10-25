import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { readFile } from "node:fs/promises";
import { findProduct } from "./catalog.js";
import type { Store } from "./store.js";

export function safeReturnTo(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : "/account";
}

export function createStoreApi(store: Store) {
  const app = new Hono<{
    Variables: { storeUser: { id: string; email: string } };
  }>();
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/session/"))
      c.header("Cache-Control", "private, no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      c.req.path !== "/api/webhooks/creem"
    ) {
      if (c.req.header("origin") !== store.origin)
        throw new HTTPException(403, {
          message: "Please submit this form from the store.",
        });
    }
    await next();
  });
  app.on(["GET", "POST"], "/api/auth/*", (c) => store.auth.handler(c.req.raw));

  // HTML forms work without a client auth SDK. Better Auth still owns hashing, sessions and cookies.
  app.post("/session/:action", async (c) => {
    const form = await c.req.formData();
    const action = c.req.param("action");
    const returnTo = safeReturnTo(form.get("returnTo"));
    if (!["sign-in", "sign-up", "sign-out"].includes(action))
      return c.notFound();
    const endpoint = action === "sign-out" ? "sign-out" : `${action}/email`;
    const body =
      action === "sign-out"
        ? {}
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
            ...(action === "sign-up"
              ? { name: String(form.get("name") ?? "").trim() }
              : {}),
          };
    const headers = new Headers(c.req.raw.headers);
    headers.set("Content-Type", "application/json");
    headers.delete("content-length");
    const response = await store.auth.handler(
      new Request(`${store.origin}/api/auth/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      const reason = response.status === 429 ? "slow-down" : "credentials";
      return c.redirect(
        `/login?mode=${action === "sign-up" ? "register" : "login"}&error=${reason}&returnTo=${encodeURIComponent(returnTo)}`,
        303,
      );
    }
    const result = new Headers({
      Location: action === "sign-out" ? "/" : returnTo,
      "Cache-Control": "private, no-store",
    });
    for (const cookie of response.headers.getSetCookie())
      result.append("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers: result });
  });

  app.post("/api/webhooks/creem", async (c) => {
    if (!process.env.CREEM_WEBHOOK_SECRET)
      throw new HTTPException(503, {
        message: "Webhook endpoint is not configured.",
      });
    if (Number(c.req.header("content-length") ?? 0) > 1_048_576)
      throw new HTTPException(413);
    const raw = await c.req.text();
    if (raw.length > 1_048_576) throw new HTTPException(413);
    let event;
    try {
      event = await store.payments.verify(raw, c.req.raw.headers);
    } catch {
      throw new HTTPException(400, {
        message: "Invalid webhook signature or payload.",
      });
    }
    store.checkout.processEvent(event);
    return c.json({ received: true });
  });

  app.use("/api/*", async (c, next) => {
    const session = await store.auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) {
      if (c.req.method === "GET")
        throw new HTTPException(401, { message: "Sign in to continue." });
      if (c.req.path === "/api/checkout") {
        const form = await c.req.formData();
        const product = findProduct(String(form.get("product")));
        return c.redirect(
          `/login?returnTo=${encodeURIComponent(product ? `/products/${product.slug}` : "/products")}`,
          303,
        );
      }
      return c.redirect("/login?returnTo=%2Fproducts", 303);
    }
    c.set("storeUser", session.user);
    await next();
  });

  app.post("/api/checkout", async (c) => {
    const user = c.get("storeUser");
    const form = await c.req.formData();
    const url = await store.checkout.buy(
      user,
      String(form.get("product")),
      Number(form.get("units")),
      String(form.get("orderId")),
    );
    return c.redirect(url, 303);
  });
  app.get("/api/orders/:id/status", (c) => {
    const user = c.get("storeUser");
    const order = store.repo.order(c.req.param("id"));
    if (!order || order.user_id !== user.id) throw new HTTPException(404);
    return c.json({ status: order.status });
  });
  app.post("/api/orders/:id/reconcile", async (c) => {
    const user = c.get("storeUser");
    const order = store.repo.order(c.req.param("id"));
    if (!order || order.user_id !== user.id) throw new HTTPException(404);
    await store.checkout.reconcile(order.id);
    return c.redirect(`/account/orders/${order.id}`, 303);
  });
  app.post("/api/billing/portal", async (c) => {
    const user = c.get("storeUser");
    const customerId = store.repo.customer(user.id);
    if (!customerId)
      throw new HTTPException(404, {
        message:
          "Your billing portal becomes available after your first purchase.",
      });
    const url = new URL(await store.payments.portal(customerId));
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "creem.io" || url.hostname.endsWith(".creem.io"))
    )
      throw new Error("Unexpected billing destination.");
    return c.redirect(url.href, 303);
  });
  app.get("/api/downloads/:slug", async (c) => {
    const user = c.get("storeUser");
    const product = findProduct(c.req.param("slug"));
    if (!product || !store.repo.canDownload(user.id, product.slug))
      throw new HTTPException(404);
    const contents = await readFile(
      new URL(`../resources/${product.filename}`, import.meta.url),
    );
    c.header(
      "Content-Disposition",
      `attachment; filename="${product.filename}"`,
    );
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(contents);
  });
  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 502;
    const message =
      error instanceof HTTPException
        ? error.message
        : "The service is temporarily unavailable. Please try again.";
    if (
      c.req.method === "POST" &&
      c.req.path !== "/api/webhooks/creem" &&
      c.req.header("accept")?.includes("text/html")
    ) {
      return c.redirect(`/checkout/problem?code=${status}`, 303);
    }
    return c.json({ error: message }, status);
  });
  return app;
}
