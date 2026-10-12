import type { RouteProps } from "@hum/core";

export default function ErrorPage({ error, status }: RouteProps) {
  return (
    <section>
      <h1>Error {status ?? 500}</h1>
      <pre>{error instanceof Error ? error.message : String(error ?? "")}</pre>
    </section>
  );
}
