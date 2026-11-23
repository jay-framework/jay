/** Small node-html-parser helpers shared by the a11y rule modules. */

export function tagOf(el: any): string {
    return (el?.rawTagName ?? '').toLowerCase();
}

/** Every element under `root` in document order (including `<style>`, which `walkElements` treats as text). */
export function allElements(root: any): any[] {
    const result: any[] = [];
    const visit = (node: any) => {
        for (const child of node?.childNodes ?? []) {
            if (child.nodeType !== 1) continue;
            result.push(child);
            visit(child);
        }
    };
    visit(root);
    return result;
}

export function hasAttribute(el: any, name: string): boolean {
    return el?.attributes ? name in el.attributes : false;
}

/** The static attribute value, or undefined when absent or bound to an expression (`{…}`). */
export function staticAttribute(el: any, name: string): string | undefined {
    if (!hasAttribute(el, name)) return undefined;
    const value: string = el.getAttribute(name) ?? '';
    return value.includes('{') ? undefined : value;
}

export function isDynamicAttribute(el: any, name: string): boolean {
    return hasAttribute(el, name) && (el.getAttribute(name) ?? '').includes('{');
}

export function hasAncestor(el: any, matches: (ancestor: any) => boolean): boolean {
    for (let node = el?.parentNode; node; node = node.parentNode) {
        if (matches(node)) return true;
    }
    return false;
}
