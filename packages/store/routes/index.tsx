import { define } from "@humjs/core";
import { products } from "../services/catalog.js";
import { ProductCard } from "./_components/ProductCard.js";

export const config = define.config({ render: { mode: "ssg" } });
export const head = define.head(
  <title>Hum Supply — Small tools, good beginnings.</title>,
);
export default function Home() {
  return (
    <>
      <section class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="status-dot" /> AN INDEPENDENT DIGITAL GOODS SHOP
          </p>
          <h1>
            Small tools.
            <br />
            <span>Good beginnings.</span>
          </h1>
          <p class="hero-description">
            Thoughtful templates, useful components, and a few good ideas.
            <br class="desktop-break" /> Everything you need to make something
            feel like you.
          </p>
          <a class="button primary" href="/products">
            Explore the collection <span>↗</span>
          </a>
          <p class="hero-note">Made with care. Yours to make your own.</p>
        </div>
        <div class="hero-composition" aria-hidden="true">
          <div class="orbit-label">A FEW THINGS TO GET YOU GOING</div>
          <div class="hero-sheet">
            <div class="sheet-header">
              hum supply <span>↗</span>
            </div>
            <span class="sheet-kicker">YOUR NEXT CHAPTER</span>
            <strong>
              Start
              <br />
              somewhere
              <br />
              <em>good.</em>
            </strong>
            <div class="sheet-rule" />
            <small>
              A toolkit for the things
              <br />
              you haven't made yet.
            </small>
          </div>
          <div class="hero-sticker">
            Less setup.
            <br />
            <em>More making.</em>
            <span>✳</span>
          </div>
          <span class="hero-caption">DIGITAL GOODS. REAL POSSIBILITIES.</span>
        </div>
      </section>
      <section class="values-strip">
        <div class="shell">
          <span>↗ Instant digital delivery</span>
          <span>◇ Thoughtfully made</span>
          <span>◎ Yours to keep</span>
          <span>✳ Built for a lighter web</span>
        </div>
      </section>
      <section class="collection shell">
        <div class="section-heading">
          <div>
            <p class="eyebrow">THE COLLECTION</p>
            <h2>A good place to start.</h2>
          </div>
          <a class="text-link" href="/products">
            View everything ↗
          </a>
        </div>
        <div class="product-grid">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>
      <section class="manifesto shell">
        <span class="manifesto-symbol">✳</span>
        <p>
          Good work starts with a little space.
          <br />
          <em>We make things that give you some.</em>
        </p>
        <a href="/products" class="text-link">
          Find your starting point ↗
        </a>
      </section>
    </>
  );
}
