import { h } from "preact";

import { describe, expect, it } from "vitest";

import { Partial } from "../src/runtime/shared.js";
import { createRenderApp } from "./helpers/render_app.js";

function PartialsPage() {
  return h(
    "div",
    { id: "partials" },
    h(
      "div",
      { "data-hum-client-nav": true },
      h("a", { href: "/" }, "go home"),
    ),
    h(Partial, { name: "list" }, h("ul", null, h("li", null, "one"))),
  );
}

const { get } = await createRenderApp([
  {
    file: "routes/partials.tsx",
    kind: "route",
    urlPath: "/partials",
    load: async () => ({ default: PartialsPage }),
  },
]);

describe("partials", () => {
  it("adds partial markers and reports client nav usage", async () => {
    const html = await get("/partials");
    expect(html).toContain("<!--hum:partial:list:0:-->");
    expect(html).toContain("<!--/hum:partial-->");
    expect(html).toContain('data-hum-client-nav="true"');
  });

  it("emits the partial state script for partial requests", async () => {
    const html = await get("/partials?_hum_partial=true");
    expect(html).toContain('id="__HUM_STATE__"');
    expect(html).not.toContain("import { boot }");
  });
});
