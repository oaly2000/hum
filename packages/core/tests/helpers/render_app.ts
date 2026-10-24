import { createApp, defineBuild } from "../../src/mod.js";
import type { HumManifest } from "../../src/types.js";
import { h } from "preact";
import { App, Layout, Counter, NestedIsland } from "./render_components.js";

/** Mount a document fixture with only the routes and islands a suite needs. */
export async function createRenderApp(
  routes: HumManifest["routes"],
  islands: Array<"Counter" | "NestedIsland"> = [],
) {
  const components = { Counter, NestedIsland };
  const manifest: HumManifest = {
    islands: islands.map((name) => ({
      name,
      exportName: "default",
      file: `islands/${name}.tsx`,
      load: async () => ({ default: components[name] }),
    })),
    routes: [
      {
        file: "routes/_app.tsx", kind: "app", urlPath: "/",
        load: async () => ({ default: App, head: () => h("title", null, "default") }),
      },
      {
        file: "routes/_layout.tsx", kind: "layout", urlPath: "/",
        load: async () => ({ default: Layout }),
      },
      {
        file: "routes/_404.tsx", kind: "notFound", urlPath: "/",
        load: async () => ({ default: () => h("div", { id: "not-found" }, "custom 404") }),
      },
      {
        file: "routes/_error.tsx", kind: "error", urlPath: "/",
        load: async () => ({ default: () => h("div", { id: "error-page" }, "custom error page") }),
      },
      ...routes,
    ],
  };
  defineBuild({ ...manifest, prod: null });
  const app = await createApp({ dev: true });
  const get = async (path: string): Promise<string> =>
    (await app.request(`http://localhost${path}`)).text();
  return { app, manifest, get };
}
