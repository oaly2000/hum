import { define } from "@hum/core";

/** `head` as a plain JSX fragment: no props needed. */
export const head = define.head(
  <>
    <title>SEO</title>
    <meta name="description" content="head exported as a JSX fragment" />
    <link rel="canonical" href="/seo" />
  </>,
);

export default function Seo() {
  return <h1>SEO</h1>;
}
