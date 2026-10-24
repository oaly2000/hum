# Core tests

- `render_*.test.tsx` exercise HTTP rendering by feature: document/head,
  islands, handlers, errors, partials and streaming. Each suite supplies its
  own routes to `helpers/render_app.ts`; only the document shell, layout and
  error pages are shared.
- `partials_server.test.tsx` checks partial payload capture without a DOM.
  The other `partials_*.test.tsx` suites cover client replacement, cached
  responses, navigation races and stylesheet loading in Happy DOM.
- `runtime_boot.test.tsx` owns boot lifecycle regressions.
- `facets*.test.tsx` and `islands.test.tsx` cover serialization and interaction
  behavior below the HTTP layer.

`helpers/ssr.ts` creates vnodes within the request's render context and returns
one serialized payload graph. Keep revival explicit in assertions that check
shared signal identity. `helpers/client.ts` provides task flushing and cleanup;
client suites call `setupClientCleanup()` to dispose the current manager and
restore DOM, globals, spies and timers.

Import order is part of `facets_hook_order.test.tsx`'s contract. Keep that file
independent of shared setup imports. Suites modeling an application loading Hum
before signals must retain that order, including through helper imports.

Run all core tests with `pnpm exec vitest run packages/core/tests`.
