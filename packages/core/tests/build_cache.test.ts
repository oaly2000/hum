import { describe, expect, it } from "vitest";

import { BuildCache, ProdManifest } from "../src/build_cache.js";
import type { HumManifest,  } from "../src/types.js";

const prod: ProdManifest = {
  buildId: "abc123",
  clientEntry: "/_hum/client/assets/runtime.js",
  islands: {
    Counter: { url: "/_hum/client/assets/Counter.js", css: [] },
  },
  entryAssets: [],
};

const manifest: HumManifest = {
  routes: [],
  islands: [
    {
      name: "Counter",
      exportName: "default",
      file: "islands/Counter.tsx",
      absPath: "/app/islands/Counter.tsx",
      load: async () => ({ default: () => null }),
    },
  ],
};

describe("BuildCache", () => {
  it("uses the production manifest when it is not in dev mode", async () => {
    const cache = new BuildCache(false);
    await cache.load(manifest, prod);

    expect(cache.clientEntry).toBe(prod.clientEntry);
    expect(cache.buildId).toBe("abc123");
    expect(cache.getIsland("Counter")?.clientUrl).toBe(
      "/_hum/client/assets/Counter.js",
    );
  });

  it("ignores a stale production manifest in dev mode", async () => {
    // A leftover `_hum/manifest.json` from an earlier build must not make the
    // dev server point at hashed assets that no longer exist.
    const cache = new BuildCache(true);
    await cache.load(manifest, prod);

    expect(cache.clientEntry).not.toBe(prod.clientEntry);
    expect(cache.buildId).toBe("dev");
    expect(cache.getIsland("Counter")?.clientUrl).toBe("/islands/Counter.tsx");
  });
});
