import { describe, expect, it } from "vitest";

import { BuildCache, ProdManifest } from "../src/build_cache.js";
import type { HumManifest } from "../src/types.js";

// Paths are relative to the output directory; `assetsBase` carries the URL the
// directory is served from, which is independent of its name on disk.
const prod: ProdManifest = {
  buildId: "abc123",
  assetsBase: "/_hum",
  clientEntry: "client/assets/runtime.js",
  islands: {
    Counter: {
      file: "client/assets/Counter.js",
      css: ["client/assets/Counter.css"],
    },
  },
  entryAssets: ["client/assets/entry.css"],
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

    expect(cache.clientEntry).toBe("/_hum/client/assets/runtime.js");
    expect(cache.entryAssets).toEqual(["/_hum/client/assets/entry.css"]);
    expect(cache.buildId).toBe("abc123");
    expect(cache.getIsland("Counter")?.clientUrl).toBe(
      "/_hum/client/assets/Counter.js",
    );
    expect(cache.getIsland("Counter")?.css).toEqual([
      "/_hum/client/assets/Counter.css",
    ]);
  });

  it("addresses the assets through the manifest URL, not the output directory name", async () => {
    // The output directory can be renamed or moved on the deploy machine, so
    // only the URL stored in the manifest may reach the client.
    const cache = new BuildCache(false);
    await cache.load(
      manifest,
      { ...prod, assetsBase: "/wwwroot/" },
    );

    expect(cache.clientEntry).toBe("/wwwroot/client/assets/runtime.js");
    expect(cache.getIsland("Counter")?.clientUrl).toBe(
      "/wwwroot/client/assets/Counter.js",
    );
  });

  it("ignores a stale production manifest in dev mode", async () => {
    // A leftover `_hum/manifest.json` from an earlier build must not make the
    // dev server point at hashed assets that no longer exist.
    const cache = new BuildCache(true);
    await cache.load(manifest, prod);

    expect(cache.clientEntry).not.toBe(prod.clientEntry);
    expect(cache.buildId).toBe("dev");
    expect(cache.entryAssets).toEqual([]);
    expect(cache.getIsland("Counter")?.clientUrl).toBe("/islands/Counter.tsx");
  });
});
