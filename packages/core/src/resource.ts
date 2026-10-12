/** A value that can suspend while its underlying promise is pending. */
export interface Resource<T> {
  /** Returns the resolved value, or suspends/throws until it is available. */
  read(): T;
}

type ResourceState<T> =
  | { status: "pending"; promise: Promise<void> }
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown };

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
