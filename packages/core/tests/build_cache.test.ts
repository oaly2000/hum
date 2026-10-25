import { describe, expect, it } from "vitest";

import type { ProdManifest } from "../src/build/registry.js";
import { BuildCache } from "../src/server/build_cache.js";
import { ASSETS_BASE } from "../src/server/config.js";
import type { HumManifest } from "../src/types.js";

// Asset paths are relative to `assetsBase`, the URL Hum publishes them under,
// so no path here knows what the output directory is called on disk.
const PROD: ProdManifest = {
  buildId: "abc123",
  assetsBase: "/_hum",
  clientEntry: "assets/runtime.js",
  islands: {
    Counter: {
      file: "assets/Counter.js",
      css: ["assets/Counter.css"],
    },
  },
  entryAssets: ["assets/entry.css"],
};

const manifest: HumManifest = {
  routes: [],
  islands: [
    {
      name: "Counter",
      exportName: "default",
      file: "islands/Counter.tsx",
      load: async () => ({ default: () => null }),
    },
  ],
};

describe("BuildCache", () => {
  it("uses the production assets when it is not in dev mode", async () => {
    const cache = new BuildCache(false);
    await cache.load({ ...manifest, prod: PROD });

    expect(cache.clientEntry).toBe("/_hum/assets/runtime.js");
    expect(cache.entryAssets).toEqual(["/_hum/assets/entry.css"]);
    expect(cache.buildId).toBe("abc123");
    expect(cache.getIsland("Counter")?.clientUrl).toBe(
      "/_hum/assets/Counter.js",
    );
    expect(cache.getIsland("Counter")?.css).toEqual([
      "/_hum/assets/Counter.css",
    ]);
  });

  it("addresses the assets through the recorded URL, not the output directory", async () => {
    // The output directory can be `dist`, `wwwroot` or anything else: only the
    // URL the build recorded reaches the client.
    const cache = new BuildCache(false);
    await cache.load({ ...manifest, prod: { ...PROD, assetsBase: "/wwwroot/" } });

    expect(cache.clientEntry).toBe("/wwwroot/assets/runtime.js");
    expect(cache.getIsland("Counter")?.clientUrl).toBe(
      "/wwwroot/assets/Counter.js",
    );
  });

  it("falls back to /_hum for a build that records no URL", async () => {
    // The URL Hum publishes its client assets under is a constant, not a
    // derived path: the configuration's `outDir` names the build directory and
    // never reaches a client URL, so the fallback is the same for every project.
    const cache = new BuildCache(false);
    await cache.load({
      ...manifest,
      prod: { ...PROD, assetsBase: undefined as unknown as string },
    });

    expect(cache.clientEntry).toBe("/_hum/assets/runtime.js");
    expect(cache.getIsland("Counter")?.clientUrl).toBe("/_hum/assets/Counter.js");
  });

  it("addresses the dev runtime under the framework base", async () => {
    // There is no configuration that moves the assets, so the dev client entry
    // stays under `ASSETS_BASE` no matter which build the cache later loads.
    const cache = new BuildCache(true);
    await cache.load({ ...manifest, prod: { ...PROD, assetsBase: "/cdn/hum" } });

    expect(cache.clientEntry).toBe(`${ASSETS_BASE}/runtime.js`);
  });

  it("ignores the production assets in dev mode", async () => {
    // The modules are served straight from Vite in dev, so a build that carries
    // assets must not make it point at hashed chunks that no longer exist.
    const cache = new BuildCache(true);
    await cache.load({ ...manifest, prod: PROD });

    expect(cache.clientEntry).not.toBe(PROD.clientEntry);
    expect(cache.buildId).toBe("dev");
    expect(cache.entryAssets).toEqual([]);
    expect(cache.getIsland("Counter")?.clientUrl).toBe("/islands/Counter.tsx");
  });
});
