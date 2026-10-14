import { describe, expect, it } from "vitest";

import * as core from "../src/mod.js";
import * as shared from "../src/shared.js";

describe("public entry points", () => {
  it("keeps browser-safe exports out of the framework entry point", () => {
    expect("IS_BROWSER" in core).toBe(false);
    expect("Partial" in core).toBe(false);
    expect("asset" in core).toBe(false);
  });

  it("exposes shared helpers from the shared entry point", () => {
    expect(typeof shared.IS_BROWSER).toBe("boolean");
    expect(typeof shared.Partial).toBe("function");
    expect(typeof shared.asset).toBe("function");
  });

  it("exports the single client asset base and the runtime URL", () => {
    // The Vite plugin re-exports both, so they have to stay on the framework
    // entry point and the runtime URL has to stay derived from the base.
    expect(core.ASSETS_BASE).toBe("/_hum");
    expect(core.RUNTIME_URL).toBe(`${core.ASSETS_BASE}/runtime.js`);
  });
});
