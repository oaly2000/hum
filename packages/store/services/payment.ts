import { Creem } from "creem";
import { constructWebhookEventEntity } from "creem/webhooks";

export interface Checkout {
  id: string;
  checkoutUrl?: string;
  status?: string;
  product?: unknown;
  units?: number;
  order?: unknown;
  customer?: unknown;
  metadata?: unknown;
}
export interface PaymentGateway {
  product(
    id: string,
  ): Promise<{ id: string; price: number; currency: string; status?: string }>;
  checkout(input: {
    productId: string;
    units: number;
    successUrl: string;
    requestId: string;
    metadata: Record<string, string>;
    email: string;
  }): Promise<Checkout>;
  retrieve(id: string): Promise<Checkout>;
  portal(customerId: string): Promise<string>;
  verify(
    raw: string,
    headers: Headers,
  ): Promise<{ id: string; eventType: string; object: unknown }>;
}

export function createPayments(
  apiKey: string,
  webhookSecret: string,
): PaymentGateway {
  if (apiKey && !apiKey.startsWith("creem_test_"))
    throw new Error("Hum Store currently supports Creem test keys only.");
  const creem = new Creem({ apiKey, serverURL: "https://test-api.creem.io" });
  return {
    product: (id) => creem.products.get(id),
    checkout: ({ email, ...input }) =>
      creem.checkouts.create({ ...input, customer: { email } }),
    retrieve: (id) => creem.checkouts.retrieve(id),
    portal: async (customerId) =>
      (await creem.customers.generateBillingLinks({ customerId }))
        .customerPortalLink,
    verify: async (raw, headers) => {
      if (!webhookSecret) throw new Error("Webhook secret is not configured.");
      return constructWebhookEventEntity(raw, headers, {
        secret: webhookSecret,
      });
    },
  };
}
