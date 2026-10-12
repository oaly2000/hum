import "preact";

declare module "preact" {
  interface Options {
    errorBoundaries?: boolean;
  }
}
