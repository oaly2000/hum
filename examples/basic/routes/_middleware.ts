import { define } from "@hum/core";

export default define.middleware(async (c, next) => {
  c.set("startedAt", Date.now());
  await next();
});
