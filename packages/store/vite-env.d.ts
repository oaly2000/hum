/// <reference types="vite/client" />

declare module "virtual:hum/build" {
  import type { HumConfig } from "@humjs/core";
  export const config: HumConfig;
}
