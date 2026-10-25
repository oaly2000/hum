import { define } from "@humjs/core";
import { Partial } from "@humjs/core/client";
import { products } from "../../services/catalog.js";
import { ProductCard } from "../_components/ProductCard.js";

export const head = define.head(<title>The collection — Hum Supply</title>);
export default define.page(({ url }) => {
  const query = (url.searchParams.get("q") ?? "").slice(0, 120);
  const category = url.searchParams.get("category") ?? "All";
  const matching = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const page = Math.max(
    1,
    Math.min(
      Number(url.searchParams.get("page")) || 1,
      Math.max(1, Math.ceil(matching.length / 2)),
    ),
  );
  const pageLink = (number: number) =>
    `/products?${new URLSearchParams({ q: query, category, page: String(number) })}`;
  return (
    <section class="collection shell collection-page">
      <p class="eyebrow">THE COLLECTION</p>
      <h1>Find your starting point.</h1>
      <p class="intro">
        A small, useful collection. Made to help you get going.
      </p>
      <div data-hum-client-nav>
        <Partial name="catalog">
          <form class="filter-bar" action="/products" method="get">
            <label class="sr-only" for="search">
              Search products
            </label>
            <input
              id="search"
              name="q"
              type="search"
              value={query}
              placeholder="Find something good…"
            />
            <label class="sr-only" for="category">
              Category
            </label>
            <select id="category" name="category" value={category}>
              {["All", "Templates", "Components", "Guides"].map((name) => (
                <option key={name} value={name}>
                  {name === "All" ? "All categories" : name}
                </option>
              ))}
            </select>
            <button class="button secondary">Find your thing ↗</button>
          </form>
          <p class="results-count" aria-live="polite">
            {matching.length} good {matching.length === 1 ? "thing" : "things"}{" "}
            found
          </p>
          {matching.length ? (
            <div class="product-grid">
              {matching.slice((page - 1) * 2, page * 2).map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          ) : (
            <div class="empty-state">
              <h2>A little too specific?</h2>
              <p>Try another search, or explore the whole collection.</p>
              <a href="/products" class="text-link">
                Clear filters ↗
              </a>
            </div>
          )}
          {matching.length > 2 && (
            <nav class="pagination" aria-label="Product pages">
              {page > 1 && <a href={pageLink(page - 1)}>← Previous</a>}
              <span>
                Page {page} of {Math.ceil(matching.length / 2)}
              </span>
              {page * 2 < matching.length && (
                <a href={pageLink(page + 1)}>Next →</a>
              )}
            </nav>
          )}
        </Partial>
      </div>
    </section>
  );
});
