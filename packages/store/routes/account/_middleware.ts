import { define } from "@humjs/core";
import { getStore } from "../../services/store.js";

export default define.middleware(async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const store = await getStore();
  if (!(await store.auth.api.getSession({ headers: c.req.raw.headers }))) {
    return c.redirect(
      `/login?returnTo=${encodeURIComponent(new URL(c.req.url).pathname)}`,
      303,
    );
  }
  await next();
});
