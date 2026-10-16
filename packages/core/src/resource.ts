import { Component, type ComponentChildren, h } from "preact";
import { Suspense as PreactSuspense } from "preact/compat";

/** A value that can suspend while its underlying promise is pending. */
export interface Resource<T> {
  /** Returns the resolved value, or suspends/throws until it is available. */
  read(): T;
}

declare const resourceKeyType: unique symbol;

/** A typed key used to register and retrieve a request-scoped resource. */
export interface ResourceKey<T> {
  readonly name: string;
  readonly [resourceKeyType]: T;
}

/** Creates a typed key for a resource shared across route layers. */
export function createResourceKey<T>(name: string): ResourceKey<T> {
  if (name.length === 0) {
    throw new TypeError("hum: resource key name cannot be empty.");
  }
  return Object.freeze({ name }) as ResourceKey<T>;
}

/** Stores request-local resources by typed key. */
export class ResourceManager {
  #resources = new Map<ResourceKey<unknown>, Resource<unknown>>();

  register<T>(
    key: ResourceKey<T>,
    load: () => PromiseLike<T>,
  ): Resource<T> {
    if (this.#resources.has(key)) {
      throw new TypeError(
        `hum: resource "${key.name}" has already been registered for this request.`,
      );
    }
    const resource = createResource<T>(Promise.resolve().then(load));
    this.#resources.set(key, resource);
    return resource;
  }

  get<T>(key: ResourceKey<T>): Resource<T> {
    const resource = this.#resources.get(key);
    if (resource === undefined) {
      throw new Error(
        `hum: resource "${key.name}" has not been registered for this request.`,
      );
    }
    return resource as Resource<T>;
  }
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

interface ResourceValueProps<T> {
  value: T;
  children: (value: T) => ComponentChildren;
}

function ResourceValue<T>(
  { value, children }: ResourceValueProps<T>,
): ComponentChildren {
  return children(value);
}

class ResourceErrorBoundary extends Component<
  Pick<SuspenseProps, "errorFallback">,
  { hasError: boolean; error: unknown }
> {
  override state = { hasError: false, error: undefined };

  static override getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      return typeof this.props.errorFallback === "function"
        ? this.props.errorFallback(this.state.error)
        : this.props.errorFallback;
    }
    return this.props.children;
  }
}

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
  return h(
    ResourceErrorBoundary,
    { errorFallback },
    h(ResourceValue<T>, { value, children }),
  );
}

/**
 * Suspends while the resource is pending and renders `errorFallback` if it
 * rejects or a child throws during rendering. Use `fallback` for the pending
 * state.
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
