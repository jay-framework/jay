/**
 * DL#196 §4 — the CSS differ, facet-addressable at rule and declaration granularity.
 *
 * Component CSS is copied into the page (and `@scope`-wrapped by the materialiser). This module compares
 * the region's copied CSS against the source template CSS, keyed by selector — the same "equal-to-source-
 * unless-override" rule as markup, but at two granularities:
 *
 *  - css-rule         — a whole rule was added in the region or removed from it (relative to source).
 *  - css-declaration  — one declaration inside a rule present on both sides changed / was added / removed.
 *
 * Ownership uses the CSS `jay:override` pragma (a raw comment has no element to hang a bare `override`
 * attribute on, so CSS keeps the `jay:` sentinel — §4):
 *
 *  - `/​* jay:override *​/`          immediately before, or inside, a rule → the page owns the whole rule.
 *  - `/​* jay:override: <prop> *​/`  before or inside a rule → the page owns that one declaration.
 *
 * Parsing reuses `postcss` — the same parser the design-system-validator's cascade resolver uses
 * (`css-cascade.ts`) — so this package stays dependency-light rather than pulling in that plugin.
 *
 * v1 scope: `@scope` wrappers are transparent (a wrapped region still aligns with unwrapped source);
 * other at-rule context (`@media`, `@supports`) is folded into the reported selector so like compares
 * with like and facet keys stay unique. A whole-rule *removal* is reported but not independently ownable
 * (there is no region rule to carry a pragma) — the page keeps it by re-adding, or owns it at sync.
 */

import postcss, { type AtRule, type Comment, type Declaration } from 'postcss';
import { ChangeKind, DiffEntry, Facet } from './facet';
import { normalizeExpr } from './normalize';

/** Diff two CSS strings (source template CSS vs the region's copied CSS block). */
export function diffCss(source: string, region: string): DiffEntry[] {
    const s = buildUnits(source);
    const r = buildUnits(region);
    const out: DiffEntry[] = [];

    for (const key of [...new Set([...s.keys(), ...r.keys()])].sort()) {
        const su = s.get(key);
        const ru = r.get(key);

        if (su && !ru) {
            // rule dropped from the region — not ownable in v1 (no region rule to carry a pragma).
            out.push({
                facet: { kind: 'css-rule', selector: su.facetSelector },
                change: 'removed',
                sourceValue: serialize(su),
            });
            continue;
        }
        if (!su && ru) {
            if (ru.ruleOwned) continue; // page owns this whole added rule
            out.push({
                facet: { kind: 'css-rule', selector: ru.facetSelector },
                change: 'added',
                regionValue: serialize(ru),
            });
            continue;
        }
        if (!su || !ru) continue;

        if (ru.ruleOwned) continue; // whole rule page-owned — neither report nor descend into its decls

        for (const property of [...new Set([...su.decls.keys(), ...ru.decls.keys()])].sort()) {
            const sv = su.decls.get(property);
            const rv = ru.decls.get(property);
            const change = declChange(sv, rv);
            if (!change) continue;
            if (ru.ownedProps.has(property)) continue; // this declaration is page-owned
            out.push({
                facet: { kind: 'css-declaration', selector: ru.facetSelector, property },
                change,
                sourceValue: sv,
                regionValue: rv,
            });
        }
    }

    return out;
}

// --- rule units ---

interface CssRuleUnit {
    /** at-rule context (excluding `@scope`) that this rule sits under, e.g. `@media (max-width: 600px)`. */
    scope: string;
    /** normalized selector (whitespace collapsed). */
    selector: string;
    /** selector as reported in a facet — scope-prefixed so `@media` rules stay distinct and readable. */
    facetSelector: string;
    /** lowercased-property → raw value. */
    decls: Map<string, string>;
    /** the page owns the entire rule (`/​* jay:override *​/`). */
    ruleOwned: boolean;
    /** lowercased properties the page owns (`/​* jay:override: <prop> *​/`). */
    ownedProps: Set<string>;
}

const OVERRIDE_RE = /^jay:override\s*(?::\s*([\w-]+))?\s*$/i;

/** Build a selector-keyed map of rule units from a CSS string. */
function buildUnits(css: string): Map<string, CssRuleUnit> {
    const map = new Map<string, CssRuleUnit>();
    const root = postcss.parse(css);

    root.walkRules((rule) => {
        const scope = scopeOf(rule);
        const decls = new Map<string, string>();
        let ruleOwned = false;
        const ownedProps = new Set<string>();

        const applyComment = (text: string): void => {
            const m = text.trim().match(OVERRIDE_RE);
            if (!m) return;
            if (m[1]) ownedProps.add(m[1].toLowerCase());
            else ruleOwned = true;
        };

        // A pragma may sit immediately before the rule...
        const prev = rule.prev();
        if (prev?.type === 'comment') applyComment((prev as Comment).text);
        // ...or among the rule's own direct children (before/after a declaration).
        for (const node of rule.nodes ?? []) {
            if (node.type === 'decl') {
                const decl = node as Declaration;
                decls.set(decl.prop.toLowerCase(), decl.value);
            } else if (node.type === 'comment') {
                applyComment((node as Comment).text);
            }
        }

        for (const selector of rule.selectors) {
            const norm = normalizeExpr(selector);
            if (!norm) continue;
            const facetSelector = scope ? `${scope} ${norm}` : norm;
            const key = `${scope}||${norm}`;
            const existing = map.get(key);
            if (existing) {
                for (const [p, v] of decls) existing.decls.set(p, v);
                existing.ruleOwned ||= ruleOwned;
                for (const p of ownedProps) existing.ownedProps.add(p);
            } else {
                map.set(key, {
                    scope,
                    selector: norm,
                    facetSelector,
                    decls: new Map(decls),
                    ruleOwned,
                    ownedProps: new Set(ownedProps),
                });
            }
        }
    });

    return map;
}

/** At-rule context of a rule, outermost-first, with `@scope` wrappers treated as transparent. */
function scopeOf(rule: postcss.Rule): string {
    const parts: string[] = [];
    let node: postcss.Container | postcss.Document | undefined = rule.parent;
    while (node) {
        if (node.type === 'atrule') {
            const at = node as AtRule;
            if (at.name.toLowerCase() !== 'scope') {
                parts.unshift(`@${at.name} ${at.params}`.trim());
            }
        }
        node = (node as { parent?: postcss.Container | postcss.Document }).parent;
    }
    return parts.join(' ');
}

// --- helpers ---

function declChange(sv: string | undefined, rv: string | undefined): ChangeKind | undefined {
    if (sv === undefined && rv === undefined) return undefined;
    if (sv === undefined) return 'added';
    if (rv === undefined) return 'removed';
    return normalizeExpr(sv) === normalizeExpr(rv) ? undefined : 'changed';
}

/** Compact one-line rendering of a rule, for diagnostics on a `css-rule` facet. */
function serialize(u: CssRuleUnit): string {
    const body = [...u.decls].map(([p, v]) => `${p}: ${v}`).join('; ');
    return `${u.selector} { ${body} }`;
}
