# create-hum

Scaffolds new applications with the Hum framework.

```bash
pnpm dlx create-hum my-app
pnpm dlx create-hum my-worker --template cloudflare
pnpm dlx create-hum --list
```

Templates:

- `basic` — a Hono server compiled to ESM modules, started with
  `node dist/server.js` alongside installed production dependencies.
- `cloudflare` — a Cloudflare Worker whose build publishes its client assets
  through the Worker's static asset binding (`wrangler deploy`), using
  `standalone: true` to bundle server dependencies.

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).
