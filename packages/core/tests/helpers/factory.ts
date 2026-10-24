import { defineFactory } from "../../src/runtime/events.js";

/** Model the compiler's hidden identity argument without exposing it publicly. */
export function testFactory<A extends unknown[], R>(id: string, fn: (...args: A) => R): (...args: A) => R {
  return (defineFactory as (fn: (...args: A) => R, id: string) => (...args: A) => R)(fn, id);
}
