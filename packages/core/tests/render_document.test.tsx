import { Fragment, h } from "preact";

import { describe, expect, it } from "vitest";

import type { RouteProps } from "../src/types.js";

import { Home } from "./helpers/render_components.js";
import { createRenderApp } from "./helpers/render_app.js";

function FormPage() {
  return h(
    "form",
    { method: "post", action: "/form" },
    h("input", { name: "name" }),
  );
}

const { get } = await createRenderApp([
  {
    file: "routes/index.tsx",
    kind: "route",
    urlPath: "/",
    load: async () => ({
      default: Home,
      head: () => h("title", null, "Hum home"),
    }),
  },
  {
    file: "routes/form.tsx",
    kind: "route",
    urlPath: "/form",
    load: async () => ({
      default: FormPage,
      handlers: {
        POST: async (c: {
          req: { formData: () => Promise<FormData> };
          text: (body: string) => Response;
        }) => {
          const data = await c.req.formData();
          return c.text(`posted:${String(data.get("name"))}`);
        },
      },
    }),
  },
  {
    file: "routes/seo.tsx",
    kind: "route",
    urlPath: "/seo",
    load: async () => ({
      default: () => h("p", null, "seo page"),
      // `head` as a plain JSX fragment: no props needed.
      head: h(
        Fragment,
        null,
        h("title", null, "SEO"),
        h("meta", { name: "description", content: "static seo" }),
      ),
    }),
  },
  {
    file: "routes/blogs/[id].tsx",
    kind: "route",
    urlPath: "/blogs/[id]",
    load: async () => ({
      default: () => h("p", null, "blog"),
      // `head` as a function so it can use the matched params.
      head: (props: RouteProps) =>
        h("title", null, `Blog ${props.params.id}`),
    }),
  },
], ["Counter"]);

describe("head handling", () => {
  it("renders the page head into <head> and overrides the app head", async () => {
    const html = await get("/");
    expect(html).toContain("<title>Hum home</title>");
    expect(html).not.toContain("<title>default</title>");
    expect(html.indexOf("<title>Hum home</title>")).toBeLessThan(
      html.indexOf("</head>"),
    );
  });

  it("falls back to the app head when the route has none", async () => {
    const html = await get("/partials");
    expect(html).toContain("<title>default</title>");
  });

  it("supports head as a plain JSX fragment", async () => {
    const html = await get("/seo");
    expect(html).toContain("<title>SEO</title>");
    expect(html).toMatch(/name="description" content="static seo"/);
  });

  it("supports head as a function of the route props", async () => {
    expect(await get("/blogs/42")).toContain("<title>Blog 42</title>");
    expect(await get("/blogs/7")).toContain("<title>Blog 7</title>");
  });

  it("marks the active link", async () => {
    const html = await get("/");
    expect(html).toContain('aria-current="page"');
  });
});

describe("layouts and app shell", () => {
  it("wraps the page in the layout chain and app shell", async () => {
    const html = await get("/");
    expect(html).toContain('<div id="layout">');
    expect(html).toContain('<html lang="en">');
  });
});
