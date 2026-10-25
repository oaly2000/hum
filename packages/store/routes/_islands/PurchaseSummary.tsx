import { defineIsland } from "@humjs/core/client";
import { useComputed, type Signal } from "@preact/signals";

export const PurchaseSummary = defineIsland(
  ({ units, price }: { units: Signal<number>; price: number }) => {
    const total = useComputed(() =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format((price * Number(units.value || 1)) / 100),
    );
    return (
      <p class="purchase-total" aria-live="polite">
        Your total <strong>{total}</strong>
        <small>Applicable tax is calculated at checkout.</small>
      </p>
    );
  },
);
