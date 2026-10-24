import { h } from "preact";
import { expect, it } from "vitest";

import { createApp, defineBuild } from "../src/mod.js";

it("creates a working app from the registered build with the default document shell", async () => {
  defineBuild({
    prod: null,
    islands: [],
    routes: [{
      file: "routes/index.tsx",
      kind: "route",
      urlPath: "/",
      load: async () => ({ default: () => h("main", null, "hello") }),
    }],
  });

  const app = await createApp({ dev: true });
  const response = await app.request("http://localhost/");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain("<html");
  expect(html).toContain("<head");
  expect(html).toContain("<body");
  expect(html).toContain("<main>hello</main>");
});
