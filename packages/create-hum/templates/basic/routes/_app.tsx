import type { ComponentChildren } from "preact";

/** Application wide head tags. Pages override them by tag. */
export const head = (
  <>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{name}}</title>
  </>
);

/** Document shell. Hum injects the merged head tags into `<head>`. */
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
