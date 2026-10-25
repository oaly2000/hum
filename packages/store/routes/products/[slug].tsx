import { randomUUID } from "node:crypto";
import { define, page } from "@humjs/core";
import { setFromProp } from "@humjs/core/client";
import { signal } from "@preact/signals";
import {
  findProduct,
  priceLabel,
  type Product,
} from "../../services/catalog.js";
import { ProductArt } from "../_components/ProductCard.js";
import { PurchaseSummary } from "../_islands/PurchaseSummary.js";
import styles from "./product.module.css";

export const handlers = define.handlers({
  GET: (c) => {
    const product = findProduct(c.req.param("slug") ?? "");
    return product ? page({ product, orderId: randomUUID() }) : c.notFound();
  },
});
type ProductData = { product: Product; orderId: string };

export const head = define.head<ProductData>(({ data }) => (
  <>
    <title>{data.product.name} — Hum Supply</title>
    <meta name="description" content={data.product.description} />
    <meta
      name="keywords"
      content={`${data.product.name}, ${data.product.category}, digital goods`}
    />
  </>
));
export default define.page<ProductData>(({ data }) => {
  const { product, orderId } = data;
  const units = signal(1);
  return (
    <section class="shell detail-page">
      <a class="back-link" href="/products">
        ← Back to the collection
      </a>
      <div class={styles.detail}>
        <ProductArt product={product} large />
        <div class={styles.info}>
          <p class="eyebrow">{product.label}</p>
          <h1>{product.name}</h1>
          <p class={styles.price}>
            {priceLabel(product.price)} <span>USD / digital edition</span>
          </p>
          <p class="intro">{product.description}</p>
          <h2 class={styles.includes}>A few things inside</h2>
          <ul class="includes-list">
            {product.includes.map((item) => (
              <li key={item}>
                ✓ <span>{item}</span>
              </li>
            ))}
          </ul>
          <form action="/api/checkout" method="post" class="purchase-form">
            <input type="hidden" name="product" value={product.slug} />
            <input type="hidden" name="orderId" value={orderId} />
            <label for="quantity">
              Quantity{" "}
              <input
                id="quantity"
                name="units"
                type="number"
                min="1"
                max="8"
                step="1"
                required
                value={units}
                onInput={setFromProp(units, "value")}
              />
            </label>
            <PurchaseSummary units={units} price={product.price} />
            <button class="button primary">
              Make it yours <span>↗</span>
            </button>
            <p class="purchase-note">
              Sign in to keep purchases in your library.
              <br />
              Secure test checkout, powered by Creem.
            </p>
          </form>
        </div>
      </div>
      <div class="detail-footnote">
        <strong>Something small. Something useful.</strong>
        <p>
          This is a working demonstration store. Purchases deliver a sample
          Markdown guide in Creem test mode.
        </p>
      </div>
    </section>
  );
});
