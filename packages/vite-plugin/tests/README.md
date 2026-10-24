# Vite plugin tests

The tests in this directory exercise discovery, source slicing, generated module
contents and plugin hooks without running a Vite server or application build.
The `integration/` directory runs actual development servers and production
builds. Its build suites cover output layout, server entries, Vite extensions,
page generation and styles separately. `islands.test.ts` checks the declaration
pipeline and emitted client metadata; it does not run a browser.

Use `helpers/project.ts` for disposable projects with workspace dependency
resolution and explicit Preact JSX settings. `helpers/build.ts` adds the default
route/public files and builds those projects. File creation and build failures
remove their temporary directory; successful callers own cleanup in `finally`
or a suite teardown.

Only read-only default artifact checks share a build through `beforeAll` and
`afterAll`. Tests that rewrite sources, move output, import an app or change
build options keep their own fixture.

- `pnpm test:fast` runs fast tests across all packages.
- `pnpm test:integration` runs all integration tests.
- `pnpm test` runs both projects.
- `pnpm exec vitest run --project integration packages/vite-plugin/tests/integration/build_styles.test.ts`
  runs one focused build suite.

Run `pnpm build:pkgs` first when workspace package sources have changed. The
separate `pnpm test:standalone` check builds the documentation app and validates
deployment after moving its output, without `node_modules`.
