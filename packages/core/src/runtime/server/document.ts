import { type ComponentChildren, Fragment, h, options, type VNode } from "preact";
import { renderToString } from "preact-render-to-string";
import { renderToReadableStream } from "preact-render-to-string/stream";

import {
  type AnyVNode,
  escapeScript,
  PARTIAL_STATE_ID,
} from "../shared_internal.js";
import type { Island } from "../../types.js";
import {
  getRequestContext,
  runWithRequestContext,
} from "../../request_context.js";

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
function renderHead(state: RenderState): string {
  const nodes = renderResourceNodes(state);

  for (const node of state.headNodes) {
    nodes.push(node as AnyVNode);
  }

  if (nodes.length === 0) return "";
  return renderToString(h(Fragment, null, nodes));
}

/**
 * Script the Vite dev server needs in the page for HMR. It belongs to the
 * document rather than to the request: whatever renders the app — this process,
 * or a Worker runtime the dev server handed the request to — emits the same
 * tag, so a dev server that never sees the response can still have its client
 * in the page.
 */
const VITE_CLIENT_URL = "/@vite/client";

function renderResourceNodes(state: RenderState): AnyVNode[] {
  const nodes: AnyVNode[] = [];

  if (state.buildCache.dev && !state.partialRequest) {
    nodes.push(h("script", { type: "module", src: VITE_CLIENT_URL }));
  }

  if (state.needsClientRuntime) {
    nodes.push(
      link(
        "modulepreload",
        withBase(state.basePath, state.buildCache.clientEntry),
      ),
    );
    for (const island of eagerIslandModules(state)) {
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

function eagerIslandModules(state: RenderState): Island[] {
  return [...state.eagerIslands];
}

/**
 * URLs that should be preloaded alongside the document. Surfaced as
 * `Link: <...>; rel=modulepreload` response headers.
 */
export function preloadLinks(state: RenderState): string[] {
  if (!state.needsClientRuntime) return [];
  const out = [withBase(state.basePath, state.buildCache.clientEntry)];
  for (const island of eagerIslandModules(state)) {
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

/** A partial representation uses the exact graph recorded by the full render. */
export function renderPartialState(state: RenderState, payload = serializePayload(state)): string {
  const json: PartialStateJson = {
    islands: [...state.islands].map((island) => ({
      name: island.name,
      url: withBase(state.basePath, island.clientUrl),
      exportName: island.exportName,
    })),
    props: payload,
  };
  return renderToString(h("script", {
    id: PARTIAL_STATE_ID,
    type: "application/json",
    dangerouslySetInnerHTML: { __html: escapeScript(JSON.stringify(json)) },
  }));
}

/**
 * Renders the client bootstrap (or, for partial requests, the state JSON the
 * client uses to revive newly appearing islands).
 */
export function renderScripts(state: RenderState, payload?: string): string {
  const islands = [...state.islands];

  if (state.partialRequest) {
    return renderPartialState(state, payload);
  }

  if (!state.needsClientRuntime) return "";

  const imports: string[] = [];
  const entries: string[] = [];
  const loaders: string[] = [];
  const eager = new Set(eagerIslandModules(state));
  for (let i = 0; i < islands.length; i++) {
    const island = islands[i];
    if (eager.has(island)) {
      const { statement, local } = islandImport(island, i, state.basePath);
      imports.push(statement);
      entries.push(`${JSON.stringify(island.name)}:${local}`);
      continue;
    }
    const url = withBase(state.basePath, island.clientUrl);
    loaders.push(
      `${JSON.stringify(island.name)}:()=>import(${
        JSON.stringify(url)
      }).then((module)=>module[${JSON.stringify(island.exportName)}])`,
    );
  }

  const clientEntry = withBase(state.basePath, state.buildCache.clientEntry);
  const props = escapeScript(JSON.stringify(payload ?? serializePayload(state)));
  const content = `import { boot } from "${clientEntry}";${
    imports.join("")
  }boot({${entries.join(",")}},${props},{${loaders.join(",")}});`;

  return renderToString(
    h("script", {
      type: "module",
      nonce: state.nonce,
      dangerouslySetInnerHTML: { __html: content },
    }),
  );
}

/**
 * Replaces `token` with `replacement` without letting `String.replace`
 * interpret `$&` style sequences in user generated HTML: the replacement is
 * passed through a function so it is inserted verbatim.
 */
function replaceOnce(
  html: string,
  token: string,
  replacement: string,
): string {
  return html.replace(token, () => replacement);
}

function wrapInDefaultDocument(
  bodyHtml: string,
  headHtml: string,
  scriptsHtml: string,
): string {
  return `<html><head>${headHtml}</head><body>${bodyHtml}${scriptsHtml}</body></html>`;
}

/** Comment placeholder a custom `_app` can leave for Hum to fill in. */
function headPlaceholder(nonce: string): string {
  return `<!--${HEAD_PLACEHOLDER_PREFIX}${nonce}-->`;
}

function scriptsPlaceholder(nonce: string): string {
  return `<!--${SCRIPTS_PLACEHOLDER_PREFIX}${nonce}-->`;
}

/**
 * Substitutes the head and bootstrap fragments into their placeholders. This
 * is the one place that defines the injection contract, shared by the buffered
 * and the streamed renderer: a placeholder is filled where it appears, and
 * otherwise the fragment is inserted before `</head>` / `</body>` when the
 * document rendered those tags itself.
 *
 * The fragments are matched by placeholder first and by tag second, which is
 * what lets a document placeholder win over a tag that the custom `_app` also
 * happened to render. `injectHead` / `injectScripts` allow the streaming
 * renderer to inject the head once and the scripts at the very end.
 */
interface InjectOptions {
  headHtml: string;
  scriptsHtml: string;
  nonce: string;
  injectHead?: boolean;
  injectScripts?: boolean;
}

interface InjectResult {
  html: string;
  /**
   * Whether the head fragment was actually placed in `html`. The streamed
   * renderer injects the head once, across chunks: a chunk may hold neither the
   * placeholder nor `</head>`, in which case the caller has to try again on the
   * next one. It reports that directly instead of comparing the output back.
   */
  headInjected: boolean;
}

function injectDocumentFragments(
  html: string,
  state: RenderState,
  options: InjectOptions,
): InjectResult {
  const { headHtml, scriptsHtml, nonce } = options;
  let result = html;
  let headInjected = false;

  if (options.injectHead !== false) {
    const token = headPlaceholder(nonce);
    if (result.includes(token)) {
      result = replaceOnce(result, token, headHtml);
      headInjected = true;
    } else if (state.renderedHtmlHead && result.includes("</head>")) {
      result = replaceOnce(result, "</head>", headHtml + "</head>");
      headInjected = true;
    }
  }

  if (options.injectScripts !== false) {
    const token = scriptsPlaceholder(nonce);
    if (result.includes(token)) {
      result = replaceOnce(result, token, scriptsHtml);
    } else if (state.renderedHtmlBody) {
      // A script in the body may contain a literal closing tag. In buffered
      // HTML the document's actual closing body tag is the last occurrence.
      const end = result.lastIndexOf("</body>");
      if (end !== -1) result = result.slice(0, end) + scriptsHtml + result.slice(end);
    }
  }

  return { html: result, headInjected };
}

/**
 * Assembles the final document by substituting the head and bootstrap
 * fragments into their placeholders. Both can only be computed once the whole
 * tree has rendered, which is why they are not part of the initial render.
 */
function assembleDocument(
  state: RenderState,
  pageHtml: string,
  headHtml: string,
  scriptsHtml: string,
): string {

  if (
    !state.renderedHtmlTag || !state.renderedHtmlHead ||
    !state.renderedHtmlBody
  ) {
    return "<!DOCTYPE html>" +
      wrapInDefaultDocument(pageHtml, headHtml, scriptsHtml);
  }

  const { html } = injectDocumentFragments(pageHtml, state, {
    headHtml,
    scriptsHtml,
    nonce: state.nonce,
  });

  return "<!DOCTYPE html>" + html;
}

/**
 * Renders a vnode with the Hum hooks active and returns the document HTML. The
 * head tags of the request must already be merged into the render state.
 */
export function renderDocument(vnode: VNode): string;
export function renderDocument(vnode: VNode, capturePartial: true): {
  body: string;
  partialBody: string;
};
export function renderDocument(vnode: VNode, capturePartial = false): string | {
  body: string;
  partialBody: string;
} {
  const state = getRenderState();
  if (state === null) {
    throw new Error(
      "Hum: renderDocument() called without an active render state. Render " +
        "a route through `renderRoute()`, or call `page()` inside a handler, " +
        "instead of calling the renderer directly.",
    );
  }
  const pageHtml = renderToString(vnode);
  const headHtml = renderHead(state);
  const payload = capturePartial ? serializePayload(state) : undefined;
  const body = assembleDocument(state, pageHtml, headHtml, renderScripts(state, payload));
  if (!capturePartial) return body;
  // Fill the original placeholders again instead of searching the finished
  // HTML, where a literal closing tag may also occur inside an inline script.
  return {
    body,
    partialBody: assembleDocument(state, pageHtml, headHtml, renderPartialState(state, payload)),
  };
}

// Preact moves deferred Suspense content when this custom element connects.
function safeStreamChunkLength(html: string, maxLength: number): number {
  const tags = /<\/?preact-island\b[^>]*>/g;
  let depth = 0;
  let openStart = 0;

  for (const match of html.matchAll(tags)) {
    const index = match.index!;
    if (index >= maxLength) break;

    if (match[0].startsWith("</")) {
      if (match.index! + match[0].length > maxLength) return openStart;
      depth--;
      if (depth === 0) openStart = 0;
    } else {
      if (depth === 0) openStart = index;
      depth++;
    }
  }

  return depth === 0 ? maxLength : openStart;
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
  const requestContext = getRequestContext();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const fullDocument = state.renderedHtmlTag && state.renderedHtmlHead &&
    state.renderedHtmlBody;
  const headHtml = renderHead(state);
  const alreadyRendered = resourceKeys(state);
  const headToken = headPlaceholder(state.nonce);
  const scriptsToken = scriptsPlaceholder(state.nonce);
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

  // The head fragment is injected through the same helper the buffered
  // renderer uses, so a `$&` inside rendered HTML is never interpreted. Scripts
  // are emitted once at the end of the stream, so their placeholder is only
  // dropped here.
  const prepare = (text: string): string => {
    let result = text;
    if (!headInjected) {
      const injected = injectDocumentFragments(result, state, {
        headHtml,
        scriptsHtml: "",
        nonce: state.nonce,
        injectScripts: false,
      });
      headInjected = injected.headInjected;
      result = injected.html;
    }
    return result.replaceAll(scriptsToken, "");
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let safeLength = 0;
        while (!finished && safeLength === 0) {
          if (buffer.length > holdLength) {
            safeLength = safeStreamChunkLength(
              buffer,
              buffer.length - holdLength,
            );
            if (safeLength > 0) break;
          }

          const read = () => reader.read();
          const { value, done } = requestContext === undefined
            ? await read()
            : await runWithRequestContext(requestContext, read);
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

        if (!finished && safeLength > 0) {
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
