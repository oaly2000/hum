# Hum Repository Guide

This file is for coding agents working on the Hum repository. User-facing setup
and framework usage documentation lives in [README.md](./README.md).

## Repository

Hum is a Node.js ESM islands SSR framework built with Preact, Hono, and Vite.
Keep the framework's core contract intact: render pages to HTML on the server,
and ship client JavaScript only for explicitly registered islands.

## Package Map

- `packages/core` (`@hum/core`): file-route discovery and matching, Hono request
  handling, SSR, island markers/props, client runtime, and shared framework
  types.
- `packages/vite-plugin` (`@hum/vite-plugin`): Vite integration, development
  SSR/HMR, island/client entry generation, asset and CSS handling, and
  production client/server builds.
- `packages/create-hum` (`create-hum`): project scaffolder and its templates in
  `templates/basic`.
- `packages/docs`: documentation site and integration example exercising the
  public framework APIs.

When changing behavior that crosses package boundaries, update every affected
surface: core runtime, Vite development and production paths, the scaffold, and
the example where applicable.

## Architecture Notes

- Routes are derived from files under `routes/`. Special files such as
  `_app.tsx`, `_layout.tsx`, `_middleware.ts`, `_error.tsx`, and `_404.tsx`
  contribute behavior through the route tree.
- Route handlers use Hono's `Context`. `page(data, options)` associates business
  data and an optional response status with the current request through
  request-local context; view data is passed under the `data` prop.
  `define.page<Data>()` types the view without mixing business data into
  framework route props. Avoid adding framework-specific fields to Hono's
  context.
- Server rendering identifies registered islands and emits markers plus
  serialized props. The client runtime discovers those markers and hydrates the
  corresponding island bundles.
- The Vite plugin has distinct dev and production paths. Keep module handling,
  island/runtime entry generation, styles, and emitted asset metadata consistent
  between them.
- Hum renders its own HTML document rather than relying on a Vite `index.html`.
  Global client CSS must be reachable from the configured client entry and
  included in both development responses and production assets.
- The Vite plugin defaults its optional user client entry to `client/main.ts`;
  keep that default, the scaffold, and example projects in sync when changing
  client-entry conventions.
- If a project has `server.ts`, it default-exports a configured Hono app. The
  Vite plugin calls `mountHum(app, config)` after loading it. Hum mounts file
  routes directly onto that app, takes ownership of the app-level 404 handler,
  and does not replace the app-level `onError`: Hum route failures render
  `_error`, while Hono API failures use the user's Hono error handler. Register
  app middleware before routes so it wraps those routes; Vite owns the dev
  listener and HMR, and the production entry starts the exported app.
- `createApp(config)` remains the standalone convenience API. Keep it as a
  wrapper around `mountHum(app, config)` so both paths share routing behavior.
- Production server builds bundle npm dependencies into relocatable ESM chunks.
  Preserve relative output structure and verify the built `_hum/` tree runs from
  a different directory without `node_modules`.

## Development and Validation

Requires Node.js 20 or later and pnpm.

```bash
pnpm install
pnpm typecheck       # TypeScript across workspace packages
pnpm test            # Vitest test suite
pnpm build:pkgs      # Build package outputs
pnpm dev             # Build packages and run the documentation site
pnpm build           # Build packages and production documentation site
pnpm start           # Run the built example server
pnpm test:standalone  # Build and run the artifact without node_modules
```

Prefer focused package tests while iterating, then run the relevant workspace
checks for changes that cross package boundaries. Do not commit generated
`dist/` output unless a package explicitly tracks it.

## Change Practices

- Preserve existing user-facing behavior unless the requested change requires
  otherwise; cover intentional behavior changes with tests.
- Add tests for changes to routing, SSR/island serialization, partial/client
  navigation, Vite build output, and scaffolding.
- Keep the scaffold aligned with the supported Vite plugin and framework APIs.
  Verify changes by generating a project when template contents or copying
  behavior changes.
- Keep documentation in `README.md` focused on using Hum. Put repository
  architecture and agent-oriented development guidance here.
