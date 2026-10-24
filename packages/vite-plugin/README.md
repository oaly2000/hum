# @humjs/vite-plugin

Vite integration for Hum applications. The plugin discovers routes and islands
through Vite's module graph, runs SSR with HMR during development, and emits the
production client assets and server entry.

For a complete project setup, use
[`create-hum`](https://www.npmjs.com/package/create-hum) or follow the
[getting started guide](https://hum.runasp.net/docs/getting-started).

## Install

```sh
npm install @humjs/core @humjs/vite-plugin @hono/node-server hono preact
npm install --save-dev vite
```

Add the plugin to `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { hum } from "@humjs/vite-plugin";

export default defineConfig({
  plugins: [hum()],
});
```

Hum renders its own document and does not use Vite's `index.html`.
Export `defineIsland(Component)` declarations from `@humjs/core/shared` at module
scope in browser-safe project modules. Hum generates IDs from the project-relative
module path and declaration binding, discovers declarations through Vite metadata
globs, and builds their client modules without a manual client-entry import.
Named/default exports and multiple declarations per file are supported. Source
metadata excludes dependencies, `.hum/`, the output and public directories, and
`tests/`, `__tests__/`, `*.test.*` and `*.spec.*`. Moving a declaration or renaming
its binding changes its ID; editing its body or re-exporting it does not.
`defineIsland` must be the outer declaration call; wrap a memoized component with
`defineIsland(memo(Component))`, rather than wrapping the declaration in `memo`.

Projects without `server.ts` receive a generated Node listener, which requires
`@hono/node-server` in the application's production dependencies.

## Options

All options are optional. Paths are relative to the Vite project root unless
noted.

| Option | Default | Purpose |
| --- | --- | --- |
| `root` | Vite root | Project root directory. |
| `routesDir` | `"routes"` | Route-file directory. |
| `outDir` | `"dist"` | Production output directory. |
| `standalone` | `false` | Bundle server dependencies for deployment without `node_modules`. By default, emit ESM modules with npm dependencies external. |
| `serverEntry` | `"server.ts"` | Production application entry. Its exports and top-level code are preserved. |
| `devEntry` | `serverEntry` | App module for development and prerendering; must default-export a mounted Hono app without starting a listener. |
| `prerenderOrigin` | `"http://localhost"` | Canonical origin for build-time SSG/ISG generation. |
| `basePath` | `"/"` | URL path prefix for the application. |
| `clientEntry` | `"client/main.ts"` | Optional client entry, commonly used to import global CSS or client event factories. |
| `verbose` | `false` | Log discovered route/island information and build island chunks. |

Example:

```ts
export default defineConfig({
  plugins: [
    hum({
      routesDir: "src/routes",
      clientEntry: "src/client/main.ts",
      outDir: "build",
    }),
  ],
});
```

The configured `clientEntry` should import global CSS and any client-side event
factories used by server-rendered page facets. The plugin includes its CSS in
development responses and production assets.

To precompile supported static Preact JSX subtrees for server rendering, add
[`@humjs/preact-ssr-precompile`](../preact-ssr-precompile) to your project and
add it to `vite.config.ts` before `hum()`:

```ts
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

export default defineConfig({
  plugins: [preactSsrPrecompile(), ...hum()],
});
```

Hum forwards configured user transform hooks to its internal production server
build without replaying the plugins' other lifecycle hooks. The precompile
transform runs for server rendering; the client build keeps the regular JSX
runtime for hydration. The precompiler automatically preserves likely
interactive facet elements. It requires Node.js 22.18 or later.
Precompiled keyed elements serialize their keys as `data-hum-key` attributes
for Hum's client reviver.

## Development and production

Run `vite` for development and `vite build` for production. In development,
Vite handles module transforms, SSR, HMR, and project `public/` files. In a
production build, Hum emits `<outDir>/server.js`, `<outDir>/package.json`, and
`<outDir>/public/`; the latter contains Hum's client assets under `/_hum` and
the project's public files.

Create the Hono app in `app.ts`, register middleware and API routes, then call
`await mountHum(app, config)` using `config` from `virtual:hum/build`. Export the
app as the module's default. A Node `server.ts` imports this app and calls
`serve()` directly; configure `hum({ devEntry: "app.ts" })` so development and
prerendering load the app without starting its listener. Hum preserves the
production entry as written. See the
[Hono guide](https://hum.runasp.net/docs/hono).

The default server build emits an ESM module tree, preserving application paths
such as `app.js` and `routes/index.js`; Hum's generated modules live under
`_generated/`. npm dependencies stay external. Deploy this tree with the
application's production dependencies, installed using its package manifest and
lockfile. The output's `package.json` only marks ESM and is not a dependency
manifest. Node loads native addons and package resources from the installed
packages as usual. Application files loaded through runtime-computed paths and
other runtime resources must also be included in the deployment.

Select `hum({ standalone: true })` to bundle server dependencies into a relocatable
ESM `server.js` that runs without `node_modules`. Dependencies must support bundling.
The Cloudflare scaffold selects this mode and exports its mounted Hono app from
`server.ts` for the platform to call. Both modes use the same client build and
page-generation pipeline; prerendering loads the compiled app in Node.

Hum does not serve `public/` by itself. Node applications can mount static
serving (as the basic scaffold does), or a reverse proxy/CDN/platform binding
can serve the output's `public/` directory.

## Common checks

- If a route is missing, verify it is under the configured routes directory
  and follows Hum's [file naming rules](https://hum.runasp.net/docs/routing).
- If an island is missing, export a module-level `defineIsland(Component)`
  declaration in a browser-safe source module. Directory placement does not
  register islands.
- If global styles are missing, confirm the CSS is imported by the configured
  client entry.
- If a page uses client event factories, make sure their module is imported by
  the client entry or an island so the browser registers them.
- To diagnose discovery and build output, set `verbose: true`.

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).
