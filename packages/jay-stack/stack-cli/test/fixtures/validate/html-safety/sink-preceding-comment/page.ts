export function render(el: HTMLElement, html: string) {
    // jay-validations: RAW-HTML-SINK html is sanitized by sanitizeArticle() on the server
    el.innerHTML = html;
}
export const page = {};
