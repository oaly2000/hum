export const products = [
  {
    slug: "launch-kit",
    name: "Launch Kit",
    category: "Templates",
    label: "01 / TEMPLATE",
    description:
      "A considered starting point for your next idea. Landing, pricing, and account page patterns built for the open web.",
    price: 2900,
    currency: "USD",
    color: "peach",
    productEnv: "CREEM_TEMPLATE_PRODUCT_ID",
    includes: [
      "Responsive page patterns",
      "Accessible form examples",
      "A practical launch checklist",
    ],
    filename: "launch-kit.md",
  },
  {
    slug: "interface-notes",
    name: "Interface Notes",
    category: "Components",
    label: "02 / COMPONENTS",
    description:
      "Small, useful interface recipes. Forms, navigation, and feedback states with clear HTML and just enough interactivity.",
    price: 1900,
    currency: "USD",
    color: "lavender",
    productEnv: "CREEM_COMPONENTS_PRODUCT_ID",
    includes: [
      "Semantic interface recipes",
      "Keyboard interaction notes",
      "Progressive enhancement patterns",
    ],
    filename: "interface-notes.md",
  },
  {
    slug: "slower-web",
    name: "The Slower Web",
    category: "Guides",
    label: "03 / FIELD GUIDE",
    description:
      "A short field guide to building fast, quiet websites. Server rendering, islands, and the details that make a site feel good.",
    price: 900,
    currency: "USD",
    color: "sage",
    productEnv: "CREEM_GUIDE_PRODUCT_ID",
    includes: [
      "Server rendering fundamentals",
      "An islands architecture checklist",
      "A deployment field guide",
    ],
    filename: "slower-web.md",
  },
] as const;

export type Product = (typeof products)[number];
export function findProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
export function priceLabel(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
