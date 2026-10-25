import { priceLabel, type Product } from "../../services/catalog.js";

export function ProductArt({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  return (
    <div
      class={`product-art ${product.color}${large ? " large" : ""}`}
      aria-hidden="true"
    >
      <span class="art-label">HUM SUPPLY / DIGITAL EDITION</span>
      {product.slug === "launch-kit" ? (
        <div class="art-window">
          <div class="window-top">
            <i />
            <i />
            <i />
          </div>
          <div class="window-body">
            <span>
              Make room
              <br />
              for your next
              <br />
              <em>good idea.</em>
            </span>
            <div class="mini-button">Get started ↗</div>
            <div class="window-grid">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      ) : product.slug === "interface-notes" ? (
        <div class="art-stack">
          <div class="note-card">
            Aa <span>Made to feel right.</span>
          </div>
          <div class="note-toggle">
            <span>Less, but better</span>
            <i />
          </div>
          <div class="note-button">
            A good place to start <span>↗</span>
          </div>
        </div>
      ) : (
        <div class="art-book">
          <span>A FIELD GUIDE / VOL. 01</span>
          <strong>
            The
            <br />
            slower
            <br />
            <em>web.</em>
          </strong>
          <div class="book-lines" />
          <small>BUILD LIGHT. GO FAR.</small>
        </div>
      )}
      <span class="art-edition">
        EST. 2026 <span>↗</span>
      </span>
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article class="product-card">
      <a href={`/products/${product.slug}`} data-hum-client-nav="false">
        <ProductArt product={product} />
        <div class="card-meta">
          <span>{product.category}</span>
          <span>Digital download</span>
        </div>
        <div class="card-title">
          <h3>{product.name}</h3>
          <span>{priceLabel(product.price)}</span>
        </div>
        <p>{product.description}</p>
        <span class="text-link">
          Take a closer look <span>↗</span>
        </span>
      </a>
    </article>
  );
}
