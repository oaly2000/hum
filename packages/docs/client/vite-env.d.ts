/// <reference types="vite/client" />

declare module "virtual:hum/build" {
  import type { HumBuild } from "@humjs/core";

  export const build: HumBuild;
}
