import type { ComponentChildren } from "preact";
import "../styles.css";

/** Document shell. Head tags are injected where Hum sees a `<head>`. */
export default function App({ children }: { children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Hum demo</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
