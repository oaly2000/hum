// Compile-time regression coverage, included in the workspace typecheck.
import { createDefine, define, type HeadExport } from "@humjs/core";

type Data = { product: { name: string; keywords: string[] } };
type State = { locale: "en" | "zh" };

const helpers = createDefine<State>();
const head = helpers.head<Data>(({ data, state, params, url }) => {
  const locale: "en" | "zh" = state.locale;
  const name: string = data.product.name;
  // @ts-expect-error Handler data retains its declared property types.
  const invalid: number = data.product.name;
  // @ts-expect-error Unknown product fields are rejected.
  data.product.missing;
  return (
    <title lang={locale}>
      {name} {params.slug} {url.pathname}
    </title>
  );
}) satisfies HeadExport<State, Data>;

// Existing state generics and module helpers preserve the typed head callback.
helpers.route({ head });
helpers.app({ head });
helpers.layout({ head });
helpers.error({ head });
helpers.head(<title>Static head</title>);
helpers.head(({ state, params }) => (
  <title>
    {state.locale} {params.slug}
  </title>
));

define.head(({ data }) => {
  // @ts-expect-error Untyped handler data is unknown, not any.
  return <title>{data.product.name}</title>;
});
define.head<Data | undefined>(({ data }) => (
  <title>{data?.product.name ?? "Fallback"}</title>
));
