import type { ComponentChildren } from "preact";

export default function AccountLayout({
  children,
}: {
  children?: ComponentChildren;
}) {
  return (
    <section class="shell account-page">
      <div class="account-heading">
        <a href="/account" class="eyebrow">
          YOUR LIBRARY
        </a>
        <form action="/session/sign-out" method="post">
          <button class="plain-button">Sign out ↗</button>
        </form>
      </div>
      {children}
    </section>
  );
}
