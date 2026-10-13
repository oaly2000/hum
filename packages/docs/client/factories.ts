import type { Signal } from "@preact/signals";

import { defineFactory } from "@humjs/core/events";

/**
 * Putting the demo order back touches two signals, which none of the factories
 * `@humjs/core/events` ships can do on its own.
 *
 * Only the factory name and its arguments travel to the client, so this module
 * is imported by the client entry as well: the browser rebuilds the handler by
 * calling `resetOrder` again with the revived signals.
 */
export const resetOrder = defineFactory(
  "resetOrder",
  (
    tickets: Signal<number>,
    giftWrap: Signal<boolean>,
    defaults: { tickets: number; giftWrap: boolean },
  ) =>
    () => {
      tickets.value = defaults.tickets;
      giftWrap.value = defaults.giftWrap;
    },
);
