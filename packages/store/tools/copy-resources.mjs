import { cp, mkdir } from "node:fs/promises";
await mkdir(new URL("../dist/resources/", import.meta.url), {
  recursive: true,
});
await cp(
  new URL("../resources/", import.meta.url),
  new URL("../dist/resources/", import.meta.url),
  { recursive: true },
);
