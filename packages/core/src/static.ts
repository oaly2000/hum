import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

import type { MiddlewareHandler } from "hono";

import type { ResolvedConfig } from "./config.js";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Serves the files the production build wrote into the out dir.
 *
 * This is the fallback that makes a built app runnable on its own. In front of
 * a real deployment these requests are normally answered by a reverse proxy or
 * a CDN, so the handler stays deliberately small: no compression, no range
 * requests, no directory index.
 */
export function staticAssetHandler(config: ResolvedConfig): MiddlewareHandler {
  const base = join(config.root, config.outDir);
  return async (c, next) => {
    const prefix = `/${config.outDir}/`;
    const url = new URL(c.req.url);
    if (!url.pathname.startsWith(prefix)) return await next();

    const rel = url.pathname.slice(prefix.length);
    const target = normalize(join(base, rel));
    if (!target.startsWith(base)) {
      return c.text("Forbidden", 403);
    }

    try {
      const data = await readFile(target);
      const type = CONTENT_TYPES[extname(target)] ??
        "application/octet-stream";
      c.header("Content-Type", type);
      // Asset file names are content hashed, so they can never go stale.
      if (rel.includes("/assets/")) {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      }
      return c.body(data);
    } catch {
      return c.text("Not Found", 404);
    }
  };
}
