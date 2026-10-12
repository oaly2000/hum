import { type ComponentChildren, h } from "preact";
import { Suspense as PreactSuspense } from "preact/compat";

/** A value that can suspend while its underlying promise is pending. */
export interface Resource<T> {
  /** Returns the resolved value, or suspends/throws until it is available. */
  read(): T;
}

export interface SuspenseProps<T = unknown> {
  resource: Resource<T>;
  children: (value: T) => ComponentChildren;
  fallback: ComponentChildren;
  errorFallback: ComponentChildren | ((error: unknown) => ComponentChildren);
}

type ResourceState<T> =
  | { status: "pending"; promise: Promise<void> }
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown };

function ResourceContent<T>(
  { resource, children, errorFallback }: SuspenseProps<T>,
): ComponentChildren {
  let value: T;
  try {
    value = resource.read();
  } catch (error) {
    if (
      error !== null &&
      (typeof error === "object" || typeof error === "function") &&
      "then" in error &&
      typeof error.then === "function"
    ) {
      throw error;
    }
    return typeof errorFallback === "function"
      ? errorFallback(error)
      : errorFallback;
  }
  return children(value);
}

/**
 * Suspends while the resource is pending and renders `errorFallback` if it
 * rejects. Use `fallback` for the pending state.
 */
export function Suspense<T>(
  props: SuspenseProps<T>,
): ComponentChildren {
  function Content() {
    return ResourceContent(props);
  }

  return h(
    PreactSuspense,
    { fallback: props.fallback },
    h(Content, {}),
  );
}

/**
 * Wraps a promise for use with Preact Suspense. Call `read()` during component
 * rendering: it throws the pending promise, returns a resolved value, or throws
 * the rejection reason.
 */
export function createResource<T>(promise: PromiseLike<T>): Resource<T> {
  let state: ResourceState<T> = {
    status: "pending",
    promise: Promise.resolve(),
  };

  const settled = Promise.resolve(promise).then(
    (value) => {
      state = { status: "resolved", value };
    },
    (error: unknown) => {
      state = { status: "rejected", error };
    },
  );
  state = { status: "pending", promise: settled };

  return {
    read(): T {
      switch (state.status) {
        case "pending":
          throw state.promise;
        case "resolved":
          return state.value;
        case "rejected":
          throw state.error;
      }
    },
  };
}
