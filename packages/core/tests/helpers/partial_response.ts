import type { ComponentChildren } from "preact";
import { renderScripts } from "../../src/runtime/server/document.js";
import { renderFragment } from "./ssr.js";

/** A partial-only response, as the client navigation fetches and applies it. */
export async function renderPartialResponse(
  page: () => ComponentChildren,
  title = "partial",
): Promise<Response> {
  const { html, state } = await renderFragment(
    page,
    { pathname: "/?_hum_partial=true" },
  );
  const doc = `<!DOCTYPE html><html><head><title>${title}</title></head><body>${html}${
    renderScripts(state)
  }</body></html>`;

  return new Response(doc, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
