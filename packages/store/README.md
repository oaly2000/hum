# Hum Supply

A working digital-goods store that exercises Hum's SSG, SSR, partial navigation,
CSS Modules, shared signals, islands, Hono handlers, and production asset publishing.
Payments use the official `creem` TypeScript SDK in **test mode only**.

## Run locally

From the repository root, install dependencies and build the workspace:

```sh
pnpm install
```

Configure test products before building the app. With the Creem CLI already logged
in to a test account, run:

```sh
pnpm --filter hum-store setup:creem --from-cli
pnpm build:pkgs
pnpm --filter hum-store dev
```

Open <http://localhost:3001>. Use this hostname consistently: cookie and CSRF
checks use `STORE_ORIGIN`. The setup command saves `.env.local`, creates a random
Better Auth secret, provisions three test products and a CLI-mode webhook endpoint,
and prints a `creem listen --webhook ... --forward-to ...` command. Run that printed
command in a second terminal to forward signed events to `/api/webhooks/creem`.
It reuses the endpoint whose signing secret is in `.env.local`.

The setup command can also read `CREEM_API_KEY` from the environment. Existing
product IDs are reused; it saves progress after each remote resource creation.
Only this explicit setup command reads the CLI configuration. The application
reads its own environment variables, never the CLI's credential file.

Alternatively, copy `.env.example` to `.env.local`, provide a random auth secret,
test key, three product IDs and a webhook signing secret yourself. Product prices
must match `services/catalog.ts`. Use exclusive tax, USD, one-time products.

Create an account with an email and a password of at least 12 characters. Purchase
one product, complete the Creem sandbox checkout, and return to the store. The
result page waits for webhook confirmation; the **Check payment status** form can
also reconcile a completed checkout through the server. Downloads appear in the
account library after payment is verified. Delivered Markdown files are sample
content, explicitly described as such on the product page.

The default database is `.data/store.sqlite`, relative to the package working
directory. It survives application restarts and builds. `.env.local`, the database,
and browser screenshots are ignored by Git. Do not put them in `public/`.

## Build and start

```sh
pnpm --filter hum-store build
pnpm --filter hum-store start
```

Deploy `dist/`, installed production dependencies, and the application manifest
and lockfile. The build copies private delivery files to `dist/resources/`;
only `dist/public/` is served statically. Use a persistent absolute
`STORE_DATABASE` path in deployments. Set `STORE_ORIGIN` to the actual origin and
keep `BETTER_AUTH_SECRET` stable. The server defaults to port 3001 on loopback;
set `HOST=0.0.0.0` behind a deployment proxy when needed.

For a reachable test deployment, create an HTTP-mode Creem webhook endpoint for
`checkout.completed`, `refund.created`, and `dispute.created`, set its secret,
and stop using the local CLI endpoint. No live keys are accepted by this example.

The homepage is anonymous SSG. Product search and detail pages are SSR; account,
login, order, and payment-result responses are `private, no-store`. Product pages
create a fresh form order ID, so they deliberately remain SSR. Only explicitly
declared islands and interaction factories generate browser application code.

## Payment consistency

- The server chooses provider product IDs and checks current prices before
  creating checkout. The same order form reuses its existing checkout.
- A success redirect never grants access. Signed events or an authenticated
  server-side reconciliation must confirm the provider order first.
- Checkout/customer/product/user/quantity/currency and amount checks precede
  fulfillment. Valid provider discount amounts are taken into account.
- Event IDs are unique. Payment, customer mapping, and download rights commit in
  one SQLite transaction. Failed events remain available for reprocessing.
- Successful refunds and disputes revoke that order's rights; later checkout
  events cannot reactivate a revoked order. A reversal arriving before payment
  is saved as failed for retry. Other valid purchases of the same product retain
  access. For this sample, any successful refund revokes the affected purchase.
- Customer portal links use the authenticated user's stored customer mapping.
  Download URLs perform an authorization check on every request.

After building, reconcile outstanding checkouts and retry failed events with:

```sh
pnpm --filter hum-store reconcile
```

This example uses single-process SQLite and an in-process checkout submission
guard. Before running multiple application instances, introduce a durable checkout
creation lease and the corresponding database coordination. Interrupted provider
requests retain a local pending order; a request ID correlates retries but is not
treated as a guarantee of provider idempotency.

## Verification

```sh
pnpm typecheck
pnpm test:fast
pnpm exec vitest run --project integration packages/store/tests/integration/production.test.ts
pnpm --filter hum-store test:browser
```

Browser checks require a running store. They use headless Edge on Windows and
Playwright Chromium elsewhere (`pnpm --filter hum-store exec playwright install chromium`).
They exercise partial filtering/history, shared quantity signals, account
registration/sign-out, mobile overflow, and JavaScript-disabled forms. They create
a synthetic local QA account and save screenshots under `.data/preview/`. Use a
separate `STORE_DATABASE` when you want to isolate QA data.

Subscription billing, ISG product pages, Workers deployment, multi-product carts,
and a product-management UI are subsequent milestones. Real-money deployment
also needs verified email ownership and account recovery, a production mail
provider, production payment configuration, and operational backup/reconciliation.
