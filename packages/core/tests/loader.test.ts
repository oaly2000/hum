import { describe, expect, it } from "vitest";

import { RouteLoadError } from "../src/server/error.js";
import { ModuleLoader, type ModuleSource } from "../src/server/loader.js";

function source(
  file: string,
  impl: () => Promise<Record<string, unknown>>,
): ModuleSource {
  return { file, load: impl };
}

describe("ModuleLoader", () => {
  it("imports a module once in production and re-imports it in dev", async () => {
    let calls = 0;
    const src = source("routes/index.tsx", async () => {
      calls++;
      return { default: () => null };
    });

    const prod = new ModuleLoader(false);
    await prod.load(src);
    await prod.load(src);
    expect(calls).toBe(1);

    // Dev re-imports per request so HMR invalidated modules are picked up.
    const dev = new ModuleLoader(true);
    await dev.load(src);
    await dev.load(src);
    expect(calls).toBe(3);
  });

  it("wraps a failing import in a RouteLoadError", async () => {
    const boom = new Error("Cannot find module './missing.js'");
    const src = source("routes/broken.tsx", async () => {
      throw boom;
    });

    const err = await new ModuleLoader(false).load(src).catch((
      e: unknown,
    ) => e);

    expect(err).toBeInstanceOf(RouteLoadError);
    const wrapped = err as RouteLoadError;
    expect(wrapped.message).toContain("routes/broken.tsx");
    expect(wrapped.message).toContain("Cannot find module './missing.js'");
    // The original error stays reachable, so nothing is lost for debugging.
    expect(wrapped.cause).toBe(boom);
  });

  it("does not cache a failed import", async () => {
    let calls = 0;
    const src = source("routes/broken.tsx", async () => {
      calls++;
      throw new Error("nope");
    });
    const loader = new ModuleLoader(false);

    await loader.load(src).catch(() => {});
    await loader.load(src).catch(() => {});
    expect(calls).toBe(2);
  });

  it("drops cached modules on clear()", async () => {
    let calls = 0;
    const src = source("routes/index.tsx", async () => {
      calls++;
      return {};
    });
    const loader = new ModuleLoader(false);

    await loader.load(src);
    loader.clear();
    await loader.load(src);
    expect(calls).toBe(2);
  });
});
