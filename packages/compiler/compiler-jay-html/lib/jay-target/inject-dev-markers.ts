/**
 * Dev-mode source-editing markers (Design Log #219).
 *
 * A pure `string -> string` transform over the ORIGINAL on-disk jay-html, run in the
 * dev-server pre-render pipeline BEFORE slow-render. It injects dev-only attributes that
 * let the source-editing inspector map a rendered pixel back to its jay-html source:
 *
 * - `jay-dev-src="from:to"` — 1-based line range into the original file, on every element
 *   under `<body>`. A plain static attribute; the compilers pass it through verbatim.
 * - `jay-dev-item="{<trackBy>}"` — a BOUND attribute on every `forEach` item root, so the
 *   compiler emits the live record id per item and keeps it current on list updates.
 *
 * Line offsets are taken against the original source here (not the slow-render re-serialized
 * markup), so the line values stay faithful to the author's file.
 *
 * Note: a region-prop marker (`jay-dev-prop-*`) was planned but dropped — a region's prop
 * bindings are parent-scoped while its only rendered elements are child-scoped, so there is no
 * DOM element on which such a bound attribute could resolve. The inspector instead reads the
 * region's source fragment (contract + binding expressions) via `jay-dev-src`. See DL#219
 * Implementation Results.
 */

import { HTMLElement, NodeType, parse } from 'node-html-parser';

export const DEV_SRC_ATTR = 'jay-dev-src';
export const DEV_ITEM_ATTR = 'jay-dev-item';

/**
 * Inject dev-mode source markers into a jay-html string and return the serialized result.
 * Elements outside `<body>` (e.g. `<head>`, the jay-data script) are left untouched.
 * Idempotent: elements that already carry a marker are not re-stamped.
 */
export function injectDevMarkers(jayHtml: string): string {
    const root = parse(jayHtml, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });
    const body = root.querySelector('body');
    if (!body) return jayHtml;

    const lineStarts = computeLineStarts(jayHtml);
    for (const child of body.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            markElement(child as HTMLElement, lineStarts);
        }
    }
    return root.toString();
}

function markElement(element: HTMLElement, lineStarts: number[]): void {
    // `range` is [startOffset, endOffset) in the source string; endOffset is one past the
    // element's last character, so use endOffset - 1 for the closing line.
    const [start, end] = element.range;
    if (!element.getAttribute(DEV_SRC_ATTR)) {
        const fromLine = offsetToLine(start, lineStarts);
        const toLine = offsetToLine(Math.max(start, end - 1), lineStarts);
        element.setAttribute(DEV_SRC_ATTR, `${fromLine}:${toLine}`);
    }

    // A `forEach` element is itself the item root (see assign-coordinates). Bind the marker to
    // the trackBy property so each rendered item carries its own live id.
    const forEach = element.getAttribute('forEach');
    const trackBy = element.getAttribute('trackBy');
    if (forEach && trackBy && !element.getAttribute(DEV_ITEM_ATTR)) {
        element.setAttribute(DEV_ITEM_ATTR, `{${trackBy}}`);
    }

    for (const child of element.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            markElement(child as HTMLElement, lineStarts);
        }
    }
}

/** Offsets (inclusive) at which each line begins. `starts[0]` is always 0. */
function computeLineStarts(src: string): number[] {
    const starts = [0];
    for (let i = 0; i < src.length; i++) {
        if (src.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
    }
    return starts;
}

/** Convert a 0-based character offset to a 1-based line number. */
function offsetToLine(offset: number, lineStarts: number[]): number {
    let lo = 0;
    let hi = lineStarts.length - 1;
    let line = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lineStarts[mid] <= offset) {
            line = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return line + 1;
}
