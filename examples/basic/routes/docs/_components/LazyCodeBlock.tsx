import { CodeBlock } from "../../_components/CodeBlock.js";

const streamingExample = `import { define } from "@hum/core";
import { lazy, Suspense } from "preact/compat";

const SlowPanel = lazy(() => import("./_components/SlowPanel.js"));

export const config = define.config({ streaming: true });

export default function Page() {
  return (
    <main>
      <h1>Page shell</h1>
      <Suspense fallback={<p>Loading panel…</p>}>
        <SlowPanel />
      </Suspense>
    </main>
  );
}`;


export default function LazyCodeBlock() {
  return <CodeBlock code={streamingExample} language="typescript" />;
}