/**
 * Generate an inline `<script>` that swaps a pending async placeholder
 * with resolved/rejected HTML content.
 *
 * The generated script finds the element with `jay-async="id:pending"`,
 * creates a temporary container, sets its innerHTML to the new HTML,
 * and replaces the placeholder with the new content.
 */
export function asyncSwapScript(id: string, html: string): string {
    // Escape the HTML for embedding inside a JS string literal.
    // We use single quotes for the JS string, so escape single quotes and backslashes.
    const escapedHtml = html.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<script>(function(){var t=document.querySelector('[jay-async="${id}:pending"]');if(t){var d=document.createElement('div');d.innerHTML='${escapedHtml}';t.replaceWith(d.firstChild);}window.__jay&&window.__jay.hydrateAsync&&window.__jay.hydrateAsync('${id}');})()</script>`;
}
