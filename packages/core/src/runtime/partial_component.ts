import { Component, type ComponentChildren } from "preact";
import type { PartialMode } from "../protocol/markers.js";

/** Partials that are currently mounted, keyed by partial name. */
export const ACTIVE_PARTIALS = new Map<string, PartialComp>();

/**
 * Keeps a partial region mounted so that a client side navigation can swap its
 * children without re-rendering the whole page.
 */
export class PartialComp extends Component<{
  children?: ComponentChildren;
  mode: PartialMode;
  name: string;
}> {
  private registeredName: string | null = null;

  override componentDidMount(): void {
    this.register();
  }

  override componentDidUpdate(): void {
    if (this.registeredName !== this.props.name) this.register();
  }

  override componentWillUnmount(): void {
    this.unregister();
  }

  override render(): ComponentChildren {
    return this.props.children;
  }

  private register(): void {
    this.unregister();
    this.registeredName = this.props.name;
    ACTIVE_PARTIALS.set(this.registeredName, this);
  }

  private unregister(): void {
    if (
      this.registeredName !== null &&
      ACTIVE_PARTIALS.get(this.registeredName) === this
    ) {
      ACTIVE_PARTIALS.delete(this.registeredName);
    }
    this.registeredName = null;
  }
}
PartialComp.displayName = "Partial";
