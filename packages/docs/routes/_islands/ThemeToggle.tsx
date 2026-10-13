import { IS_BROWSER } from "@humjs/core/shared";
import { useSignal } from "@preact/signals";

/** Where the visitor's choice is kept, so it survives a reload. */
const STORAGE_KEY = "hum-theme";

/**
 * Switches the document between the light and the dark palette.
 *
 * The script in `_app.tsx` applies the stored choice before the first paint, so
 * the island only has to follow the class it finds on `<html>` — which is also
 * why the button can safely render the light state on the server and correct
 * itself once it hydrates.
 */
export default function ThemeToggle() {
  const dark = useSignal(
    IS_BROWSER && document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    dark.value = !dark.value;
    document.documentElement.classList.toggle("dark", dark.value);
    try {
      localStorage.setItem(STORAGE_KEY, dark.value ? "dark" : "light");
    } catch {
      // A browser that refuses storage simply forgets the choice when the page
      // is left; the class already applied it for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark.value}
      title={dark.value ? "Switch to the light theme" : "Switch to the dark theme"}
      class="grid size-9 place-items-center rounded-xl border border-line bg-surface text-base transition hover:bg-surface-2"
    >
      <span aria-hidden="true">{dark.value ? "☾" : "☀"}</span>
      <span class="sr-only">
        {dark.value ? "Switch to the light theme" : "Switch to the dark theme"}
      </span>
    </button>
  );
}
