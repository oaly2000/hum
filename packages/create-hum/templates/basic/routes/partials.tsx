import { define, Partial, type RouteProps } from "@humjs/core";

const TOPICS: Record<string, string> = {
  "": "Pick a topic from the list.",
  a: "You are reading topic A.",
  b: "You are reading topic B.",
  c: "You are reading topic C.",
};

export const head = define.head(({ url }) => (
  <title>Partials — {url.searchParams.get("topic") || "home"}</title>
));

/**
 * `f-client-nav` on the wrapper makes every link/submit inside it a client side
 * navigation: the browser does not do a full reload, only the `<Partial>` regions
 * of the target page are fetched and swapped in. The target page reuses the same
 * partial `name`, so the region updates without touching the rest of the layout.
 */
export default function PartialsPage(props: RouteProps) {
  const topic = props.url.searchParams.get("topic") ?? "";
  return (
    <div f-client-nav>
      <p>Client side navigation swaps only the partial region below.</p>
      <nav>
        <a href="/partials">Home</a>
        <a href="/partials?topic=a">A</a>
        <a href="/partials?topic=b">B</a>
        <a href="/partials?topic=c">C</a>
      </nav>
      <Partial name="content">
        <p>{TOPICS[topic] ?? "Unknown topic."}</p>
      </Partial>
    </div>
  );
}
