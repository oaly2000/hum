/**
 * Escapes a value so it can be embedded safely in an inline `<script>`. The
 * characters that could terminate the script element or open an HTML comment
 * are escaped, and `</` is broken up.
 */
export function escapeScript(value: string): string {
  return value
    .replaceAll("</", "<\\/")
    .replaceAll("<!--", "<\\!--")
    .replaceAll("-->", "--\\>")
    .replaceAll("<script", "<\\script")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
