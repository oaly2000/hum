import type { ComponentChildren } from "preact";
import { define } from "@humjs/core";

const THEME_SCRIPT = `try {
  const stored = localStorage.getItem("hum-theme");
  document.documentElement.classList.toggle(
    "dark",
    stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches,
  );
} catch {}`;

/** Document shell. Head tags are injected where Hum sees a `<head>`. */
export default function App({ children }: { children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Hum demo</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
