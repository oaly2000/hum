# @humjs/vite-plugin

Vite integration for Hum applications. The plugin discovers routes and islands
through Vite's module graph, runs SSR with HMR during development, and emits the
production client assets and server entry.

For a complete project setup, use
[`create-hum`](https://www.npmjs.com/package/create-hum) or follow the
[getting started guide](https://hum.runasp.net/docs/getting-started).

## Install

```sh
npm install @humjs/core @humjs/vite-plugin hono preact
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

## Options

All options are optional. Paths are relative to the Vite project root unless
noted.

| Option | Default | Purpose |
| --- | --- | --- |
| `root` | Vite root | Project root directory. |
| `routesDir` | `"routes"` | Route-file directory. |
| `islandsDir` | `"islands"` | Global island directory. Route-local `_islands/` directories are also discovered. |
| `outDir` | `"dist"` | Production output directory. |
| `basePath` | `"/"` | URL path prefix for the application. |
| `clientEntry` | `"client/main.ts"` | Optional client entry, commonly used to import global CSS or client event factories. |
| `verbose` | `false` | Log discovered route/island information and build island chunks. |

Example:

```ts
export default defineConfig({
  plugins: [
    hum({
      routesDir: "src/routes",
      islandsDir: "src/islands",
      clientEntry: "src/client/main.ts",
      outDir: "build",
    }),
  ],
});
```

The configured `clientEntry` should import global CSS and any client-side event
factories used by server-rendered page facets. The plugin includes its CSS in
development responses and production assets.

## Development and production

Run `vite` for development and `vite build` for production. In development,
Vite handles module transforms, SSR, HMR, and project `public/` files. In a
production build, Hum emits `<outDir>/server.js`, `<outDir>/package.json`, and
`<outDir>/public/`; the latter contains Hum's client assets under `/_hum` and
the project's public files.

If `server.ts` default-exports a Hono app, Hum mounts file routes on that app.
An optional `start(app)` export is called by the generated Node server entry
after mounting, for apps that start their own listener. Without `start`, the
generated entry exports the app for a platform that calls its `fetch` handler.
For example, the Cloudflare scaffold uses that form. See the
[Hono and deployment guide](https://hum.runasp.net/docs/hono).

The server build bundles npm dependencies; it does not serve `public/` by
itself. Node applications can mount static serving (as the basic scaffold
does), or a reverse proxy/CDN/platform binding can serve the output's `public/`
directory.

## Common checks

- If a route or island is missing, verify it is under the configured directory
  and follows Hum's [file naming rules](https://hum.runasp.net/docs/routing).
- If global styles are missing, confirm the CSS is imported by the configured
  client entry.
- If a page uses client event factories, make sure their module is imported by
  the client entry or an island so the browser registers them.
- To diagnose discovery and build output, set `verbose: true`.

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).
