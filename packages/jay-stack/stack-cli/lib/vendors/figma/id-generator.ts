import { createHash } from 'crypto';
import { HTMLElement, NodeType } from 'node-html-parser';

/**
 * Build a DOM path string from an element up to a root element.
 * Walks from the element up to the root, recording each element's index among its parent's children.
 *
 * @returns Path like "body>0>2>1" representing the element's position in the tree.
 */
export function buildDomPath(element: HTMLElement, root: HTMLElement): string {
    const segments: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== root) {
        const parent = current.parentNode as HTMLElement | null;
        if (!parent) break;

        const siblings = parent.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE);
        const index = siblings.indexOf(current);
        segments.unshift(String(index));

        current = parent;
    }

    const rootTag = root.rawTagName || 'body';
    return `${rootTag}>${segments.join('>')}`;
}

/**
 * Generate a deterministic node ID for an imported DOM element.
 *
 * Priority:
 * 1. If figmaId is provided (from data-figma-id), use it as-is (roundtrip stability).
 * 2. Otherwise, hash the DOM path + semantic anchors to produce a stable 12-char hex ID.
 */
export function generateNodeId(
    domPath: string,
    semanticAnchors?: string[],
    figmaId?: string,
): string {
    if (figmaId) return figmaId;

    const parts = [domPath];
    if (semanticAnchors && semanticAnchors.length > 0) {
        parts.push(...semanticAnchors.sort());
    }

    const hash = createHash('sha256').update(parts.join('|')).digest('hex');
    return hash.slice(0, 12);
}

/**
 * Extract semantic anchors from an HTMLElement for stable ID generation.
 */
export function getSemanticAnchors(element: HTMLElement): string[] {
    const anchors: string[] = [];

    const id = element.getAttribute('id');
    if (id) anchors.push(`id:${id}`);

    const ref = element.getAttribute('ref');
    if (ref) anchors.push(`ref:${ref}`);

    const cls = element.getAttribute('class');
    if (cls) anchors.push(`class:${cls}`);

    const testId = element.getAttribute('data-testid');
    if (testId) anchors.push(`testid:${testId}`);

    return anchors;
}
