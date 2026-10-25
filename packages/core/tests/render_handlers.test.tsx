import { h } from "preact";

import { describe, expect, it } from "vitest";

import { define, page } from "../src/mod.js";

import type { RouteProps } from "../src/types.js";
import { createRenderApp } from "./helpers/render_app.js";

function FormPage() {
  return h(
    "form",
    { method: "post", action: "/form" },
    h("input", { name: "name" }),
  );
}

const PageView = define.page<
  {
    extra?: string;
    params?: { id: string };
  } | undefined
>(
  function PageView(
    props: RouteProps & {
      data: { extra?: string; params?: { id: string } } | undefined;
    },
  ) {
    return h(
      "div",
      { id: "page-view" },
      `extra: ${props.data?.extra ?? "none"}; ` +
        `route param: ${props.params.id ?? "none"}; ` +
        `data param: ${props.data?.params?.id ?? "none"}`,
    );
  },
);

const { app, get } = await createRenderApp([
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
    file: "routes/page-fn.tsx",
    kind: "route",
    urlPath: "/page-fn",
    load: async () => ({
      default: PageView,
      head: define.head<{ extra: string }>(({ data }) =>
        h("title", null, data.extra)),
      handlers: {
        GET: async () => {
          const extra = await Promise.resolve("from-handler");
          return page({
            extra,
            params: { id: "from-data" },
          }, { status: 202 });
        },
      },
    }),
  },
  {
    file: "routes/page-fallthrough.tsx",
    kind: "route",
    urlPath: "/page-fallthrough",
    load: async () => ({
      default: PageView,
      handlers: {
        GET: () => {
          // Returning nothing falls through to the page component.
        },
      },
    }),
  },
]);

describe("handlers", () => {
  it("renders the page for GET when no handler is defined", async () => {
    const html = await get("/form");
    expect(html).toContain('name="name"');
  });

  it("lets handlers answer the request", async () => {
    const res = await app.request("http://localhost/form", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=hum",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("posted:hum");
  });

  it("answers 405 for unsupported methods", async () => {
    const res = await app.request("http://localhost/form", {
      method: "DELETE",
    });
    expect(res.status).toBe(405);
  });

  it("gives handlers a page() function to render their own view", async () => {
    const res = await app.request("http://localhost/page-fn");
    const html = await res.text();

    expect(res.status).toBe(202);
    // The handler's data reached the page component...
    expect(html).toContain("extra: from-handler");
    expect(html).toContain("<title>from-handler</title>");
    expect(html).toContain("route param: none; data param: from-data");
    // ...and the result is still a full document.
    expect(html).toContain('<div id="page-view">');
    expect(html).toContain('<div id="layout">');
    expect(html).toContain('<html lang="en">');
  });

  it("falls through to the view when a handler returns nothing", async () => {
    const html = await get("/page-fallthrough");
    expect(html).toContain('<div id="page-view">');
    expect(html).toContain("extra: none");
  });
});
