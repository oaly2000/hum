export default function ThemeToggle() {
  return (
    <label
      class="theme-toggle relative grid size-9 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-base transition hover:bg-surface-2"
      title="Use alternate theme"
    >
      <input type="checkbox" class="theme-toggle-input sr-only" />
      <span aria-hidden="true" class="theme-icon-light">☀</span>
      <span aria-hidden="true" class="theme-icon-dark">☾</span>
      <span class="sr-only">Use alternate theme</span>
    </label>
  );
}
