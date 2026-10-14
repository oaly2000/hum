# create-hum

Scaffolds new applications with the Hum framework.

```bash
pnpm dlx create-hum my-app
pnpm dlx create-hum my-worker --template cloudflare
pnpm dlx create-hum --list
```

Templates:

- `basic` — a Hono server on Node, started with `node dist/server.js`.
- `cloudflare` — a Cloudflare Worker whose build publishes its client assets
  through the Worker's static asset binding (`wrangler deploy`).

Documentation, source code, and issue tracking are available in the
[Hum repository](https://github.com/oaly2000/hum).
