import type { ComponentChildren } from "preact";

export default function Layout({ children }: { children?: ComponentChildren }) {
  return (
    <>
      <div class="announcement">
        A little less noise. A little more possibility.{" "}
        <span>Made for the open web ↗</span>
      </div>
      <header class="site-header shell">
        <a class="brand" href="/" aria-label="Hum Supply home">
          <span class="brand-mark">h.</span>hum
          <span class="brand-light">supply</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/products">The collection</a>
          <a href="/account">
            Your library <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer class="site-footer shell">
        <a class="brand" href="/">
          hum<span class="brand-light">supply</span>
        </a>
        <p>Useful things for thoughtful builders.</p>
        <span>Built with Hum. Payments by Creem.</span>
        <span class="test-badge">TEST STORE · NO REAL CHARGES</span>
      </footer>
    </>
  );
}
