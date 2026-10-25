import type { ComponentChildren } from "preact";
import { define } from "@humjs/core";
import "../styles.css";

export const head = define.head(
  <meta
    name="description"
    content="A small collection of digital tools for thoughtful websites. Templates, interface recipes, and field guides."
  />,
);

export default function App({ children }: { children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f6f4ee" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
