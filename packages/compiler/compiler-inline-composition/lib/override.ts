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

/** Attributes that are jay meta, never diffed as content. */
const META_ATTRS = new Set(['jc', 'override', 'page-scope']);

export function isMetaAttr(name: string): boolean {
    return META_ATTRS.has(name.toLowerCase());
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

export function parseOverride(el: HTMLElement): Suppression {
    if (isPageScope(el)) {
        return { all: true, attributes: new Set(), styleProps: new Set(), children: false };
    }
    const raw = readAttr(el, 'override');
    const sup: Suppression = {
        all: false,
        attributes: new Set(),
        styleProps: new Set(),
        children: false,
    };
    if (raw === undefined) return sup;
    const spec = raw.trim();
    if (spec === '' || spec === '*') {
        sup.all = true;
        return sup;
    }
    for (const token of spec.split(/\s+/)) {
        const t = token.trim();
        if (!t) continue;
        if (t.toLowerCase() === 'children') sup.children = true;
        else if (t.toLowerCase().startsWith('style.'))
            sup.styleProps.add(t.slice('style.'.length).toLowerCase());
        else sup.attributes.add(t.toLowerCase());
    }
    return sup;
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
