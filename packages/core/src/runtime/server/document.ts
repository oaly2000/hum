import { type ComponentChildren, Fragment, h, options, type VNode } from "preact";
import { renderToString } from "preact-render-to-string";
import { renderToReadableStream } from "preact-render-to-string/stream";

import { type AnyVNode, escapeScript } from "../shared_internal.js";
import type { Island } from "../../types.js";

import {
  getRenderState,
  HEAD_PLACEHOLDER_PREFIX,
  type RenderState,
  SCRIPTS_PLACEHOLDER_PREFIX,
  serializePayload,
  withRenderState,
} from "./preact_hooks.js";

// preact-render-to-string disables class error boundaries unless opted in.
options.errorBoundaries = true;

/** Minimal document shell used when the project has no `_app.tsx`. */
export function DefaultApp(props: {
  children?: ComponentChildren;
}): AnyVNode {
  return h(
    "html",
    { lang: "en" },
    h(
      "head",
      null,
      h("meta", { charset: "utf-8" }),
      h("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
    ),
    h("body", null, props.children),
  );
}

function withBase(basePath: string, url: string): string {
  if (basePath === "" || basePath === "/") return url;
  if (!url.startsWith("/")) return url;
  return basePath.replace(/\/$/, "") + url;
}

function link(rel: string, href: string): AnyVNode {
  return h("link", { rel, href });
}

/**
 * Renders everything that belongs into `<head>`: the head tags merged from the
 * `head` exports of the render chain plus the preload/style tags of the islands
 * that were used. Runs after the main render so it can contain the island
 * assets that were discovered while walking the tree.
 */
export function renderHead(state: RenderState): string {
  const nodes = renderResourceNodes(state);

  for (const node of state.headNodes) {
    nodes.push(node as AnyVNode);
  }

  if (nodes.length === 0) return "";
  return renderToString(h(Fragment, null, nodes));
}

function renderResourceNodes(state: RenderState): AnyVNode[] {
  const nodes: AnyVNode[] = [];

  if (state.needsClientRuntime) {
    nodes.push(
      link(
        "modulepreload",
        withBase(state.basePath, state.buildCache.clientEntry),
      ),
    );
    for (const island of state.islands) {
      nodes.push(
        link("modulepreload", withBase(state.basePath, island.clientUrl)),
      );
    }
  }

  const styles = new Set<string>([
    ...state.buildCache.entryAssets,
    ...collectIslandCss(state),
  ]);
  for (const css of styles) {
    nodes.push(link("stylesheet", withBase(state.basePath, css)));
  }

  return nodes;
}

function resourceKeys(state: RenderState): Set<string> {
  const keys = new Set<string>();
  for (const node of renderResourceNodes(state)) {
    const props = node.props as { rel?: string; href?: string };
    if (props.rel !== undefined && props.href !== undefined) {
      keys.add(`${props.rel}:${props.href}`);
    }
  }
  return keys;
}

function renderLateResources(
  state: RenderState,
  alreadyRendered: Set<string>,
): string {
  const nodes = renderResourceNodes(state).filter((node) => {
    const props = node.props as { rel?: string; href?: string };
    return props.rel !== undefined && props.href !== undefined &&
      !alreadyRendered.has(`${props.rel}:${props.href}`);
  });
  if (nodes.length === 0) return "";
  return renderToString(h(Fragment, null, nodes));
}

function collectIslandCss(state: RenderState): string[] {
  const out: string[] = [];
  for (const island of state.islands) out.push(...island.css);
  for (const css of state.islandAssets) out.push(css);
  return out;
}

/**
 * URLs that should be preloaded alongside the document. Surfaced as
 * `Link: <...>; rel=modulepreload` response headers.
 */
export function preloadLinks(state: RenderState): string[] {
  if (!state.needsClientRuntime) return [];
  const out = [withBase(state.basePath, state.buildCache.clientEntry)];
  for (const island of state.islands) {
    out.push(withBase(state.basePath, island.clientUrl));
  }
  return out;
}

/** Builds the static import statement for one island. */
function islandImport(island: Island, index: number, basePath: string): {
  statement: string;
  local: string;
} {
  const url = withBase(basePath, island.clientUrl);
  const local = `hum_island_${index}`;
  const statement = island.exportName === "default"
    ? `import ${local} from "${url}";`
    : `import { ${island.exportName} as ${local} } from "${url}";`;
  return { statement, local };
}

export interface PartialStateJson {
  islands: Array<{ name: string; url: string; exportName: string }>;
  props: string;
}

/**
 * Renders the client bootstrap (or, for partial requests, the state JSON the
 * client uses to revive newly appearing islands).
 */
export function renderScripts(state: RenderState): string {
  const islands = [...state.islands];

  if (state.partialRequest) {
    const json: PartialStateJson = {
      islands: islands.map((island) => ({
        name: island.name,
        url: withBase(state.basePath, island.clientUrl),
        exportName: island.exportName,
      })),
      props: serializePayload(state),
    };
    return renderToString(
      h("script", {
        id: "__HUM_STATE__",
        type: "application/json",
        dangerouslySetInnerHTML: {
          __html: escapeScript(JSON.stringify(json)),
        },
      }),
    );
  }

  if (!state.needsClientRuntime) return "";

  const imports: string[] = [];
  const entries: string[] = [];
  for (let i = 0; i < islands.length; i++) {
    const { statement, local } = islandImport(
      islands[i],
      i,
      state.basePath,
    );
    imports.push(statement);
    entries.push(`${JSON.stringify(islands[i].name)}:${local}`);
  }

  const clientEntry = withBase(state.basePath, state.buildCache.clientEntry);
  const props = escapeScript(JSON.stringify(serializePayload(state)));
  const content = `import { boot } from "${clientEntry}";${
    imports.join("")
  }boot({${entries.join(",")}},${props});`;

  return renderToString(
    h("script", {
      type: "module",
      nonce: state.nonce,
      dangerouslySetInnerHTML: { __html: content },
    }),
  );
}

function replaceOnce(
  html: string,
  token: string,
  replacement: string,
): string {
  // The replacement is used through a function so `$&` style sequences inside
  // user generated HTML are never interpreted by `String.replace`.
  return html.replace(token, () => replacement);
}

function wrapInDefaultDocument(
  bodyHtml: string,
  headHtml: string,
  scriptsHtml: string,
): string {
  return `<html><head>${headHtml}</head><body>${bodyHtml}${scriptsHtml}</body></html>`;
}

/**
 * Assembles the final document by substituting the head and bootstrap
 * fragments into their placeholders. Both can only be computed once the whole
 * tree has rendered, which is why they are not part of the initial render.
 */
export function assembleDocument(state: RenderState, pageHtml: string): string {
  const headHtml = renderHead(state);
  const scriptsHtml = renderScripts(state);

  if (
    !state.renderedHtmlTag || !state.renderedHtmlHead ||
    !state.renderedHtmlBody
  ) {
    return "<!DOCTYPE html>" +
      wrapInDefaultDocument(pageHtml, headHtml, scriptsHtml);
  }

  let html = pageHtml;

  const headToken = `<!--${HEAD_PLACEHOLDER_PREFIX}${state.nonce}-->`;
  if (html.includes(headToken)) {
    html = replaceOnce(html, headToken, headHtml);
  } else if (state.renderedHtmlHead) {
    html = replaceOnce(html, "</head>", headHtml + "</head>");
  }

  const scriptsToken = `<!--${SCRIPTS_PLACEHOLDER_PREFIX}${state.nonce}-->`;
  if (html.includes(scriptsToken)) {
    html = replaceOnce(html, scriptsToken, scriptsHtml);
  } else if (state.renderedHtmlBody) {
    html = replaceOnce(html, "</body>", scriptsHtml + "</body>");
  }

  return "<!DOCTYPE html>" + html;
}

/**
 * Renders a vnode with the Hum hooks active and returns the document HTML. The
 * head tags of the request must already be merged into the render state.
 */
export function renderDocument(vnode: VNode): string {
  const state = getRenderState();
  if (state === null) {
    throw new Error(
      "Hum: renderDocument() called without an active render state. Render " +
        "a route through `renderRoute()`, or call `page()` inside a handler, " +
        "instead of calling the renderer directly.",
    );
  }
  const pageHtml = renderToString(vnode);
  return assembleDocument(state, pageHtml);
}

/**
 * Streams a document using Preact's experimental Suspense renderer. Head data
 * and resources found in the initial shell are emitted first; assets discovered
 * in resumed subtrees and the island bootstrap are emitted before `</body>`.
 */
export function renderDocumentStream(vnode: VNode): ReadableStream<Uint8Array> {
  const state = getRenderState();
  if (state === null) {
    throw new Error(
      "Hum: renderDocumentStream() called without an active render state.",
    );
  }

  const source = renderToReadableStream(vnode, { nonce: state.nonce });
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const fullDocument = state.renderedHtmlTag && state.renderedHtmlHead &&
    state.renderedHtmlBody;
  const headHtml = renderHead(state);
  const alreadyRendered = resourceKeys(state);
  const headToken = `<!--${HEAD_PLACEHOLDER_PREFIX}${state.nonce}-->`;
  const scriptsToken = `<!--${SCRIPTS_PLACEHOLDER_PREFIX}${state.nonce}-->`;
  const holdLength = Math.max(headToken.length, scriptsToken.length, 20);
  let buffer = "";
  let started = false;
  let finished = false;
  let headInjected = !fullDocument;

  const startDocument = (): string => {
    if (fullDocument) {
      const prefix = buffer.startsWith("<!DOCTYPE html>")
        ? ""
        : "<!DOCTYPE html>";
      return prefix;
    }
    return `<!DOCTYPE html><html><head>${headHtml}</head><body>`;
  };

  const prepare = (text: string): string => {
    let result = text;
    if (result.includes(headToken)) {
      result = result.replaceAll(headToken, headHtml);
      headInjected = true;
    } else if (!headInjected && result.includes("</head>")) {
      result = result.replace("</head>", `${headHtml}</head>`);
      headInjected = true;
    }
    result = result.replaceAll(scriptsToken, "");
    return result;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!finished && buffer.length <= holdLength) {
          const { value, done } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            finished = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          if (!started && buffer.length > 0) {
            const prefix = startDocument();
            started = true;
            if (prefix !== "") controller.enqueue(encoder.encode(prefix));
          }
        }

        if (!started && finished) {
          const prefix = startDocument();
          started = true;
          if (prefix !== "") controller.enqueue(encoder.encode(prefix));
        }

        if (!finished && buffer.length > holdLength) {
          const safeLength = buffer.length - holdLength;
          const safe = prepare(buffer.slice(0, safeLength));
          buffer = buffer.slice(safeLength);
          if (safe !== "") controller.enqueue(encoder.encode(safe));
          return;
        }

        if (finished) {
          const final = withRenderState(state, () => {
            const resources = renderLateResources(state, alreadyRendered);
            const scripts = renderScripts(state);
            let tail = prepare(buffer);
            if (fullDocument) {
              const bodyClose = tail.lastIndexOf("</body>");
              if (bodyClose !== -1) {
                tail = tail.slice(0, bodyClose) + resources + scripts +
                  tail.slice(bodyClose);
              } else {
                tail += resources + scripts;
              }
            } else {
              tail += resources + scripts + "</body></html>";
            }
            return tail;
          });
          if (final !== "") controller.enqueue(encoder.encode(final));
          controller.close();
          state.clear();
          reader.releaseLock();
        }
      } catch (error) {
        state.clear();
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (finished) return;
      finished = true;
      state.clear();
      await reader.cancel(reason);
    },
  });
}
