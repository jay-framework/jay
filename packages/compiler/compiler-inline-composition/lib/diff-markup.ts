/**
 * DL#196 §3 — the DOM-level, per-region, facet-addressable markup differ.
 *
 * Compares a flattened region body against its source template body. The body is copied *verbatim*
 * (page data enters as props on the `<jay:X>` tag, not rewritten into the body — Q13), so the rule is
 * uniform: a facet is drift iff it differs from source. Granularity (Phase 1 acceptance):
 *
 *  - attribute            — an element gained / lost / changed an attribute (bindings compared modulo formatting)
 *  - style-declaration    — one inline-style property changed within an element
 *  - children             — an element's child sequence diverged (count, tag order, or text)
 *
 * When a child sequence diverges we report a single `children` facet on the parent and do NOT descend
 * (the subtree is the unit — matching `override="children"`). When it aligns, we descend and compare
 * attributes/style of each element child. Nested `<jay:X>` regions are never descended into (Q2).
 * `page-scope` subtrees are page-owned and excluded from comparison (§7). `override` markers suppress
 * exactly their named facet.
 *
 * CSS rule/declaration diffing lives in the sibling `diff-css.ts` module (it parses with postcss).
 */

import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';
import { ChangeKind, DiffEntry, Facet, NodePath } from './facet';
import {
    isMetaAttr,
    isPageScope,
    isRegionTag,
    NO_SUPPRESSION,
    parseOverride,
    readAttr,
    Suppression,
} from './override';
import { normalizeExpr } from './normalize';
import { parseInlineStyle } from './style';

/** Diff two body fragments (strings). Each is parsed with the same tree the compiler walks. */
export function diffMarkup(source: string, region: string): DiffEntry[] {
    return diffBodies(parse(source), parse(region));
}

/**
 * Diff the children of two already-parsed parents — the source template body element and the region's
 * `<jay:X>` element (Phase 2 wiring feeds these after loading via `parseJayFile`).
 */
export function diffBodies(sourceParent: HTMLElement, regionParent: HTMLElement): DiffEntry[] {
    const out: DiffEntry[] = [];
    // The materialiser stamps the region's `ref` as a class on the flattened root(s) to anchor the copied
    // `@scope (.<ref>)` CSS (DL#196). That class is synthetic (not author content), so drop it before
    // comparing the `class` attribute — else every scoped region would falsely report `class` drift.
    const ignoreClass = isRegionTag(regionParent) ? readAttr(regionParent, 'ref') : undefined;
    diffChildren([], sourceParent, regionParent, ignoreClass, out);
    return out;
}

function diffChildren(
    parentPath: NodePath,
    sParent: HTMLElement,
    rParent: HTMLElement,
    ignoreClass: string | undefined,
    out: DiffEntry[],
): void {
    const rSup = isElement(rParent) ? parseOverride(rParent) : NO_SUPPRESSION;
    // Whole node or subtree is page-owned: neither report nor descend into it (§4).
    if (rSup.all || rSup.children) return;

    const s = contentNodes(sParent);
    const r = contentNodes(rParent);

    if (!childrenAligned(s, r)) {
        const facet: Facet = { kind: 'children', path: parentPath, element: tagOf(rParent) };
        out.push({
            facet,
            change: 'changed',
            sourceValue: summarize(s),
            regionValue: summarize(r),
            addedElementTags: addedElementTags(s, r),
        });
        return;
    }

    // Aligned: same length, same kind sequence, matching element tags, equal text. Descend elements.
    for (let i = 0; i < r.length; i++) {
        const rc = r[i];
        if (rc.nodeType !== NodeType.ELEMENT_NODE) continue; // text already known equal
        const re = rc as HTMLElement;
        if (isRegionTag(re)) continue; // nested <jay:X> — its own source (Q2)
        // The anchor class is only stamped on the region's top-level roots; deeper elements never carry
        // it, so stop threading it once we descend past the roots (parentPath was the region tag).
        const childIgnoreClass = parentPath.length === 0 ? ignoreClass : undefined;
        diffElement([...parentPath, i], s[i] as HTMLElement, re, childIgnoreClass, out);
    }
}

function diffElement(
    path: NodePath,
    se: HTMLElement,
    re: HTMLElement,
    ignoreClass: string | undefined,
    out: DiffEntry[],
): void {
    const sup = parseOverride(re);
    if (sup.all) return; // whole node page-owned
    compareAttributes(path, se, re, sup, ignoreClass, out);
    compareStyle(path, se, re, sup, out);
    diffChildren(path, se, re, undefined, out); // may emit a `children` facet at this node
}

function compareAttributes(
    path: NodePath,
    se: HTMLElement,
    re: HTMLElement,
    sup: Suppression,
    ignoreClass: string | undefined,
    out: DiffEntry[],
): void {
    const sm = attrMap(se);
    const rm = attrMap(re);
    const names = [...new Set([...sm.keys(), ...rm.keys()])].sort();
    for (const name of names) {
        const sv = name === 'class' ? stripClassToken(sm.get(name), ignoreClass) : sm.get(name);
        const rv = name === 'class' ? stripClassToken(rm.get(name), ignoreClass) : rm.get(name);
        const change = scalarChange(sv, rv, (a, b) => normalizeExpr(a) === normalizeExpr(b));
        if (!change) continue;
        const facet: Facet = { kind: 'attribute', path, element: tagOf(re), name };
        if (!sup.all && !sup.attributes.has(name))
            out.push({ facet, change, sourceValue: sv, regionValue: rv });
    }
}

function compareStyle(
    path: NodePath,
    se: HTMLElement,
    re: HTMLElement,
    sup: Suppression,
    out: DiffEntry[],
): void {
    const sm = parseInlineStyle(se.getAttribute('style'));
    const rm = parseInlineStyle(re.getAttribute('style'));
    const props = [...new Set([...sm.keys(), ...rm.keys()])].sort();
    for (const property of props) {
        const sv = sm.get(property);
        const rv = rm.get(property);
        const change = scalarChange(sv, rv, (a, b) => normalizeExpr(a) === normalizeExpr(b));
        if (!change) continue;
        const facet: Facet = { kind: 'style-declaration', path, element: tagOf(re), property };
        if (!sup.all && !sup.styleProps.has(property))
            out.push({ facet, change, sourceValue: sv, regionValue: rv });
    }
}

// --- helpers ---

/**
 * Drop one class token (the synthetic scope-anchor) from a `class` value. Returns `undefined` when nothing
 * remains, so a root whose only class is the anchor compares equal to a template root with no class.
 */
function stripClassToken(value: string | undefined, token: string | undefined): string | undefined {
    if (value === undefined || !token) return value;
    const kept = value.split(/\s+/).filter((t) => t && t !== token);
    return kept.length ? kept.join(' ') : undefined;
}

function scalarChange(
    sv: string | undefined,
    rv: string | undefined,
    equal: (a: string, b: string) => boolean,
): ChangeKind | undefined {
    if (sv === undefined && rv === undefined) return undefined;
    if (sv === undefined) return 'added';
    if (rv === undefined) return 'removed';
    return equal(sv, rv) ? undefined : 'changed';
}

function attrMap(el: HTMLElement): Map<string, string> {
    const map = new Map<string, string>();
    const attrs = el.attributes;
    for (const name of Object.keys(attrs)) {
        const lower = name.toLowerCase();
        if (isMetaAttr(lower) || lower === 'style') continue;
        map.set(lower, attrs[name] ?? '');
    }
    return map;
}

/** Content nodes: drop comments, whitespace-only text, and `page-scope` (page-owned) subtrees. */
function contentNodes(parent: HTMLElement): Node[] {
    return parent.childNodes.filter((n) => {
        if (n.nodeType === NodeType.TEXT_NODE) return normalizeExpr(nodeText(n)) !== '';
        if (n.nodeType === NodeType.ELEMENT_NODE) return !isPageScope(n as HTMLElement);
        return false; // comments and other node types
    });
}

function childrenAligned(s: Node[], r: Node[]): boolean {
    if (s.length !== r.length) return false;
    for (let i = 0; i < s.length; i++) {
        const sk = s[i].nodeType;
        const rk = r[i].nodeType;
        if (sk !== rk) return false;
        if (rk === NodeType.TEXT_NODE) {
            if (normalizeExpr(nodeText(s[i])) !== normalizeExpr(nodeText(r[i]))) return false;
        } else {
            if (tagOf(s[i]).toLowerCase() !== tagOf(r[i]).toLowerCase()) return false;
        }
    }
    return true;
}

function isElement(n: Node): n is HTMLElement {
    return n.nodeType === NodeType.ELEMENT_NODE;
}

function tagOf(n: Node): string {
    return isElement(n) ? ((n as HTMLElement).tagName ?? '(root)') : '(root)';
}

function nodeText(n: Node): string {
    return (n as unknown as { rawText?: string }).rawText ?? n.text ?? '';
}

/**
 * Lowercase tag names of elements in the region child sequence not matched by an element of the same tag
 * in the source (multiset difference). Text nodes are ignored — so a text node replaced by `<strong>` or
 * `<img>` yields `['strong']` / `['img']` (content enrichment), while a net-new `<div>` yields `['div']`
 * (structural). Empty for a pure text-only change. DL#200 consumers classify these against a content-tag
 * allowlist.
 */
function addedElementTags(s: Node[], r: Node[]): string[] {
    const srcCounts = new Map<string, number>();
    for (const n of s)
        if (n.nodeType === NodeType.ELEMENT_NODE) {
            const t = tagOf(n).toLowerCase();
            srcCounts.set(t, (srcCounts.get(t) ?? 0) + 1);
        }
    const added: string[] = [];
    for (const n of r)
        if (n.nodeType === NodeType.ELEMENT_NODE) {
            const t = tagOf(n).toLowerCase();
            const remaining = srcCounts.get(t) ?? 0;
            if (remaining > 0) srcCounts.set(t, remaining - 1);
            else added.push(t);
        }
    return added;
}

/** Compact one-line summary of a child sequence, for diagnostics on a `children` facet. */
function summarize(nodes: Node[]): string {
    return nodes
        .map((n) =>
            n.nodeType === NodeType.ELEMENT_NODE
                ? `<${tagOf(n).toLowerCase()}>`
                : `"${normalizeExpr(nodeText(n))}"`,
        )
        .join('');
}
