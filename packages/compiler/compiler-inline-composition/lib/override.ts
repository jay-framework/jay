/**
 * DL#196 §4 — the `override` (and `page-scope`) markers, and their suppression semantics.
 *
 * Suppression is *per-facet, not per-node*: `override="class"` owns one attribute, `override="style.color"`
 * one inline-style declaration, `override="children"` the subtree; a bare `override` (or `override="*"`)
 * owns the whole node. `page-scope` (§7, deferred) marks a page-owned subtree — for the differ it means
 * "not part of the source template", so such subtrees are excluded from comparison entirely.
 *
 * These are bare directives (like `if`/`forEach`/`ref`); `jc` is compiler-injected. All three are meta
 * and never compared as content.
 */

import { HTMLElement } from 'node-html-parser';
import { Facet } from './facet';

/**
 * DL#202 — the template-side content-slot marker. Authored on a node in a design-system *template*
 * `.jay-html` (source side), it declares which of the node's facets are a content slot — the consumer's
 * to own. A consumer editing those facets is expected, not drift, so `validate` skips them and `sync`
 * preserves the consumer's version instead of re-flattening.
 *
 * It takes the **same facet-list grammar as `override=`** (DL#202 refinement), but read from the source,
 * so the same slot can be children *and/or* named attributes:
 *
 *  - bare `jay-content` (or `jay-content=""`) → `children` (the common text/markup slot; the default);
 *  - `jay-content="src alt"` → the `src` and `alt` *attributes* are the slot (e.g. a media `<img>`);
 *  - `jay-content="children src"` → children and the `src` attribute both;
 *  - `jay-content="style.color"` → one inline-style declaration;
 *  - `jay-content="*"` → the whole node is the consumer's.
 *
 * Unlike page-side `override=`, it lives on the source, so it is stated once and is resilient to template
 * changes — remove it and the override model resumes. Prefixed (`jay-content`, not `content`) to avoid the
 * real HTML `content` attribute (`<meta content>`).
 */
export const CONTENT_MARKER = 'jay-content';

/** Attributes that are jay meta, never diffed as content. */
const META_ATTRS = new Set(['jc', 'override', 'page-scope', CONTENT_MARKER]);

export function isMetaAttr(name: string): boolean {
    return META_ATTRS.has(name.toLowerCase());
}

/** True when a (template) node declares any content slot — see {@link CONTENT_MARKER}. */
export function isContentSlot(el: HTMLElement): boolean {
    return readAttr(el, CONTENT_MARKER) !== undefined;
}

/** True for a nested composition boundary `<jay:X>` — validated against its own source, never descended into (Q2). */
export function isRegionTag(el: HTMLElement): boolean {
    return (el.tagName ?? '').toLowerCase().startsWith('jay:');
}

/** Read an attribute, treating a present-but-valueless (bare) attribute as `''` and absence as `undefined`. */
export function readAttr(el: HTMLElement, name: string): string | undefined {
    const v = el.getAttribute(name);
    if (v !== undefined && v !== null) return v;
    // node-html-parser may surface a bare boolean attribute only via rawAttributes.
    const raw = el.rawAttributes ?? {};
    return Object.prototype.hasOwnProperty.call(raw, name) ? (raw[name] ?? '') : undefined;
}

export function isPageScope(el: HTMLElement): boolean {
    return readAttr(el, 'page-scope') !== undefined;
}

/** Parsed suppression state for a single region node. */
export interface Suppression {
    /** whole node (and subtree) is page-owned — bare `override`, `override="*"`, or `page-scope`. */
    all: boolean;
    /** lowercased attribute names the page owns. */
    attributes: Set<string>;
    /** lowercased inline-style properties the page owns. */
    styleProps: Set<string>;
    /** subtree (child nodes) is page-owned. */
    children: boolean;
}

export const NO_SUPPRESSION: Suppression = Object.freeze({
    all: false,
    attributes: new Set<string>(),
    styleProps: new Set<string>(),
    children: false,
});

function emptySuppression(): Suppression {
    return { all: false, attributes: new Set(), styleProps: new Set(), children: false };
}

/** Parse a facet-list spec (`children`, `style.<prop>`, or attribute names; comma- or space-separated). */
function parseFacetTokens(spec: string, sup: Suppression): void {
    for (const token of spec.split(/[\s,]+/)) {
        const t = token.trim();
        if (!t) continue;
        if (t.toLowerCase() === 'children') sup.children = true;
        else if (t.toLowerCase().startsWith('style.'))
            sup.styleProps.add(t.slice('style.'.length).toLowerCase());
        else sup.attributes.add(t.toLowerCase());
    }
}

export function parseOverride(el: HTMLElement): Suppression {
    if (isPageScope(el)) {
        return { all: true, attributes: new Set(), styleProps: new Set(), children: false };
    }
    const raw = readAttr(el, 'override');
    const sup = emptySuppression();
    if (raw === undefined) return sup;
    const spec = raw.trim();
    if (spec === '' || spec === '*') {
        sup.all = true;
        return sup;
    }
    parseFacetTokens(spec, sup);
    return sup;
}

/**
 * DL#202 — parse a template node's `jay-content` into the facets the *consumer* owns (same shape as
 * {@link parseOverride}, but read from the source side). A bare marker defaults to `children`; `*` owns the
 * whole node; otherwise it is the `override=` facet-list grammar (`children`, `style.<prop>`, attributes).
 * A node without the marker yields the empty suppression.
 */
export function parseContent(el: HTMLElement): Suppression {
    const raw = readAttr(el, CONTENT_MARKER);
    const sup = emptySuppression();
    if (raw === undefined) return sup;
    const spec = raw.trim();
    if (spec === '*') {
        sup.all = true;
        return sup;
    }
    if (spec === '') {
        sup.children = true; // bare `jay-content` = the children slot (the DL#202 default)
        return sup;
    }
    parseFacetTokens(spec, sup);
    return sup;
}

/** Union two suppressions — a facet is owned if either side (page `override` or template `jay-content`) owns it. */
export function unionSuppression(a: Suppression, b: Suppression): Suppression {
    return {
        all: a.all || b.all,
        attributes: new Set([...a.attributes, ...b.attributes]),
        styleProps: new Set([...a.styleProps, ...b.styleProps]),
        children: a.children || b.children,
    };
}

export function isSuppressed(sup: Suppression, facet: Facet): boolean {
    if (sup.all) return true;
    switch (facet.kind) {
        case 'attribute':
            return sup.attributes.has(facet.name.toLowerCase());
        case 'style-declaration':
            return sup.styleProps.has(facet.property.toLowerCase());
        case 'children':
            return sup.children;
        default:
            return false;
    }
}
