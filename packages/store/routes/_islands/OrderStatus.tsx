import { defineIsland } from "@humjs/core/client";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const OrderStatus = defineIsland(({ orderId }: { orderId: string }) => {
  const message = useSignal(
    "We're waiting for secure payment confirmation. This can take a moment.",
  );
  useEffect(() => {
    const controller = new AbortController();
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}/status`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (response.status === 401) {
          message.value =
            "Your session has expired. Sign in again to view your order.";
          return;
        }
        if (!response.ok) throw new Error("Status unavailable");
        const { status } = await response.json();
        if (
          status === "paid" ||
          status === "refunded" ||
          status === "disputed" ||
          status === "expired"
        ) {
          location.reload();
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      attempts++;
      if (attempts >= 20) {
        message.value =
          "Confirmation is taking a little longer. You can check payment below or return to your library later.";
        return;
      }
      timer = setTimeout(check, 3000);
    };
    timer = setTimeout(check, 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <p class="status-message" role="status">
      {message}
    </p>
  );
});
