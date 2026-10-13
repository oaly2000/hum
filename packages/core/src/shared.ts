/**
 * Browser-safe helpers and components shared by routes and client islands.
 * Keep these exports separate from the server/framework and browser runtime
 * entry points so importing them cannot initialize either runtime.
 */
export { asset, IS_BROWSER, Partial } from "./runtime/shared.js";
export type { PartialProps } from "./runtime/shared.js";
