import { define, page } from "@humjs/core";
import { getStore } from "../services/store.js";
import { safeReturnTo } from "../services/http.js";

export const head = define.head(
  <title>A place for your good things — Hum Supply</title>,
);
export const handlers = define.handlers({
  GET: async (c) => {
    c.header("Cache-Control", "private, no-store");
    const store = await getStore();
    if (await store.auth.api.getSession({ headers: c.req.raw.headers }))
      return c.redirect(safeReturnTo(c.req.query("returnTo")), 303);
    return page({});
  },
});
export default define.page(({ url }) => {
  const register = url.searchParams.get("mode") === "register";
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  return (
    <section class="shell auth-page">
      <div class="auth-aside">
        <p class="eyebrow">YOUR OWN LITTLE CORNER</p>
        <h1>
          Good things.
          <br />
          <em>All in one place.</em>
        </h1>
        <p>Your purchases, ready whenever you are.</p>
        <span class="aside-flower" aria-hidden="true">
          ✳
        </span>
      </div>
      <div class="auth-panel">
        <h2>{register ? "Make yourself at home." : "Welcome back."}</h2>
        <p>
          {register
            ? "Create an account to start your collection."
            : "Sign in to find your collection."}
        </p>
        {url.searchParams.has("error") && (
          <p class="form-error" role="alert">
            {url.searchParams.get("error") === "slow-down"
              ? "Too many attempts. Please wait a moment and try again."
              : register
                ? "We couldn't create the account. Check your details or try signing in."
                : "We couldn't sign you in. Please check your email and password."}
          </p>
        )}
        <form
          action={`/session/${register ? "sign-up" : "sign-in"}`}
          method="post"
          class="stacked-form"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          {register && (
            <label for="name">
              Your name
              <input
                name="name"
                id="name"
                autoComplete="name"
                maxLength={100}
                required
              />
            </label>
          )}
          <label for="email">
            Email address
            <input
              name="email"
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label for="password">
            Password
            <input
              name="password"
              id="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </label>
          {register && <small>Use at least 12 characters.</small>}
          <button class="button primary">
            {register ? "Create your account" : "Sign in"} <span>↗</span>
          </button>
        </form>
        <p class="auth-switch">
          {register ? "Already have a place here?" : "New around here?"}{" "}
          <a
            href={`/login?mode=${register ? "login" : "register"}&returnTo=${encodeURIComponent(returnTo)}`}
          >
            {register ? "Sign in" : "Create an account"}
          </a>
        </p>
      </div>
    </section>
  );
});
