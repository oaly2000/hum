# @humjs/vite-plugin

## 0.0.3

### Patch Changes

- Serve the user client entry at the runtime URL in development, so the modules
  that register handler factories are evaluated in the browser, and tag injected
  dev stylesheets with `data-vite-dev-id` so Vite adopts that element instead of
  injecting a duplicate copy.
- Updated dependencies
  - @humjs/core@0.1.0

## 0.0.2

### Patch Changes

- Move packages to the `@humjs` scope and publish them to npm with Trusted Publishing.
- Updated dependencies
  - @humjs/core@0.0.2
