# @humjs/preact-ssr-precompile

A Vite plugin and transform utility for precompiling safe Preact JSX subtrees
in server-side rendering builds. Eligible static markup is emitted as
`preact-render-to-string` template calls; elements that need runtime processing
remain on Preact's normal vnode path. It can be used by Preact SSR projects
independently of Hum.

```ts
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

export default defineConfig({
  plugins: [preactSsrPrecompile()],
});
```

The package also exports `transformPreactSsrJsx` for integrations that need to
run the transform directly instead of installing the Vite plugin.

Interactive-element preservation is enabled by default. An element is
conservatively preserved when it has an event prop, a spread prop, a dynamic
prop expression, or a dynamic child expression referencing an outer-scope
value. The transform skips that native element name throughout the module, but
continues precompiling eligible static siblings and descendants. This can leave
some optimization unused, but avoids removing runtime behavior.

Projects can define their own AST-based preservation rules for framework- or
application-specific behavior:

```ts
import { preactSsrPrecompile } from "@humjs/preact-ssr-precompile";

preactSsrPrecompile({
  preserveElements: [
    "my-element",
    (node, context) =>
      node.openingElement.name.type === "JSXIdentifier" &&
      node.openingElement.name.name === "my-widget" &&
      context.ancestors.some((ancestor) => ancestor.type === "JSXElement"),
  ],
});
```

Each rule receives the Oxc `JSXElement` AST node and a context containing the
file name, full source, ancestor nodes (outermost first), and identifiers bound
by enclosing `.map()` callbacks. Matching an element keeps its native tag name
as a vnode throughout that module, while eligible static siblings can still be
precompiled. This tag-level fallback is intentionally conservative. AST types
are exported by `rolldown/utils` and aliased by this package as
`PrecompileJsxElement`, `PrecompileAstNode`, and `PrecompileJsxExpression`.

`isHumInteractiveElement` is an optional, opinionated rule exported for Hum's
interactive-element policy. Use it when those criteria match your project;
otherwise, provide your own `preserveElements` rules.

## Options

### Transform scope

- `include`: file ID patterns to transform. Accepts a string (matched as a
  substring), a regular expression, or an array of either. Defaults to
  JavaScript/TypeScript files with optional `c`/`m` prefixes and JSX variants
  (for example, `.js`, `.tsx`, `.mjs`, and `.cts`).
- `exclude`: file ID patterns to skip, with the same format as `include`.
  Exclusions take precedence; defaults to `node_modules`.
- `ssrOnly`: run only during Vite's SSR transform. Defaults to `true`; set to
  `false` to also transform client-side modules.

### JSX output

- `importSource`: JSX runtime package used for generated helper imports.
  Defaults to `preact`, which generates imports from `preact/jsx-runtime`.
- `dynamicProps`: attribute names that should always use the runtime
  `jsxAttr()` helper, even when their values appear static.

### Runtime-preservation rules

- `preserveElements`: element names and/or AST rules for elements that must
  remain on the vnode path. A matching name or rule skips that tag throughout
  the module. The built-in `html`, `head`, `body`, `svg`, `math`, `textarea`,
  `select`, and `option` tags are always preserved.
- `preserveInteractiveElements`: enable the built-in conservative scanner for
  event props, spread props, dynamic prop expressions, and dynamic children
  that reference values outside a `.map()` callback. Defaults to `true`.
- Set `preserveInteractiveElements` to `false` to rely only on the configured
  `preserveElements` names and rules.

This package is maintained in the Hum workspace, but its transform and rule
API are intended for general Preact SSR use. It is based on
[`@pracht/preact-ssr-precompile`](https://github.com/JoviDeCroock/pracht/tree/main/packages/preact-ssr-precompile)
0.1.4. See [LICENSE](./LICENSE) for the original MIT notice.
