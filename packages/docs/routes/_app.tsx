import type { ComponentChildren } from "preact";
import { define } from "@humjs/core";

/**
 * Applies the stored theme before anything is painted. It runs in the head, so
 * the document it belongs to already exists and the palette is in place by the
 * time the body is drawn — without it a dark visitor would see a light flash.
 */
const THEME_SCRIPT = `try {
  const stored = localStorage.getItem("hum-theme");
  document.documentElement.classList.toggle(
    "dark",
    stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches,
  );
} catch {}`;

export const head = (
  <>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hum demo</title>
    <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
  </>
);

/** Document shell. Head tags are injected where Hum sees a `<head>`. */
export default function App({ children }: { children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
