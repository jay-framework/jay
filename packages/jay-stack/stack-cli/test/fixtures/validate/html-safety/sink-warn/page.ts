export function render(el: HTMLElement, html: string) {
    el.innerHTML = html;
    el.outerHTML = html;
    el.insertAdjacentHTML('beforeend', html);
    document.write(html);
    if (el.innerHTML === html) return;
}
export const page = {};
