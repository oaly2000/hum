import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

const languages = {
  typescript,
  javascript,
  json,
  bash,
  html: xml,
  css,
} as const;

type CodeLanguage = keyof typeof languages;

for (const [name, definition] of Object.entries(languages)) {
  hljs.registerLanguage(name, definition);
}

const languageLabels: Record<CodeLanguage, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  json: "JSON",
  bash: "Shell",
  html: "HTML",
  css: "CSS",
};

export function SyntaxCode(
  { code, language = "typescript" }: {
    code: string;
    language?: CodeLanguage;
  },
) {
  const highlighted = hljs.highlight(code, { language }).value;

  return (
    <code
      class={`syntax-highlight language-${language}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

export function CodeBlock(
  { code, language = "typescript" }: {
    code: string;
    language?: CodeLanguage;
  },
) {
  return (
    <div class="docs-code-block mt-5 overflow-hidden rounded-2xl bg-code">
      <div class="border-b border-white/10 px-5 py-2.5 text-xs font-semibold tracking-wide text-faint sm:px-6">
        {languageLabels[language]}
      </div>
      <pre class="overflow-x-auto p-5 text-sm leading-6 text-[#e7f1e4] sm:p-6">
        <SyntaxCode code={code} language={language} />
      </pre>
    </div>
  );
}
