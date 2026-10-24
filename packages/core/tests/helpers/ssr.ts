import { Fragment, h, type ComponentChildren } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { BuildCache } from "../../src/build_cache.js";
import { tagIsland } from "../../src/routing/island_tag.js";
import {
  RenderState,
  serializePayload,
  withRenderState,
} from "../../src/runtime/server/preact_hooks.js";

export interface RenderOptions {
  pathname?: string;
  islands?: Array<[unknown, string]>;
}

/** Create the page's vnodes inside the request render context. */
export async function renderFragment(
  page: () => ComponentChildren,
  options: RenderOptions = {},
) {
  const state = new RenderState({
    url: new URL(options.pathname ?? "/", "http://localhost"),
    buildCache: new BuildCache(true),
    basePath: "/",
  });
  for (const [component, name] of options.islands ?? []) {
    const file = `islands/${name}.tsx`;
    state.buildCache.islands.set(name, {
      name,
      exportName: "default",
      file,
      clientUrl: `/${file}`,
      css: [],
    });
    tagIsland(component, { name, file, exportName: "default" });
  }
  const html = await withRenderState(state, () =>
    renderToStringAsync(h(Fragment, null, page())));
  return {
    html,
    payload: serializePayload(state),
    state,
    entries: state.payload as Array<Record<string, unknown>>,
  };
}
