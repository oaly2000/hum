import { describe, expect, it } from "vitest";

import * as core from "../src/mod.js";
import * as client from "../src/client.js";
import * as build from "../src/build.js";

describe("public entry points", () => {
  it("keeps browser-safe exports out of the framework entry point", () => {
    expect("IS_BROWSER" in core).toBe(false);
    expect("Partial" in core).toBe(false);
    expect("asset" in core).toBe(false);
    expect("defineIsland" in core).toBe(false);
    expect("defineFactory" in core).toBe(false);
  });

  it("exposes all application client APIs from one entry", () => {
    expect(typeof client.IS_BROWSER).toBe("boolean");
    for (const name of ["Partial", "asset", "defineIsland", "defineFactory", "add", "setValue", "toggle", "setFromProp"] as const) {
      expect(typeof client[name]).toBe("function");
      expect(name in core).toBe(false);
    }
  });

  it("exports the single client asset base and the runtime URL", () => {
    // The Vite plugin consumes these through the build contract.
    expect(build.ASSETS_BASE).toBe("/_hum");
    expect(build.RUNTIME_URL).toBe(`${build.ASSETS_BASE}/runtime.js`);
    expect("ASSETS_BASE" in core).toBe(false);
    expect("RUNTIME_URL" in core).toBe(false);
  });
});
