/**
 * DL#196 §3/§4 — the facet addressing scheme.
 *
 * A *facet* names the smallest part of a materialised region that can independently drift from its
 * source template and be independently owned by the page (via an `override` marker). Every diff entry
 * (§4), every `override` suppression, and every `sync` preservation (§5) is keyed by the same Facet —
 * one addressing scheme shared by reporting, suppression and sync (Phase 1 acceptance).
 *
 * Markup facets carry a {@link NodePath} — the position of the node inside the region, as a list of
 * content-child indices from the region root (whitespace-only text and comments excluded, `page-scope`
 * subtrees excluded). CSS facets are keyed by selector (and property) inside the region's copied
 * `@scope` block — the markup differ (`diff-markup.ts`) and the CSS differ (`diff-css.ts`) both emit
 * these facets.
 */

/** Position of a node inside a region: content-child indices from the region root. */
export type NodePath = number[];

export type Facet =
    | { kind: 'attribute'; path: NodePath; element: string; name: string }
    | { kind: 'style-declaration'; path: NodePath; element: string; property: string }
    | { kind: 'children'; path: NodePath; element: string }
    | { kind: 'css-rule'; selector: string }
    | { kind: 'css-declaration'; selector: string; property: string };

/** Direction of a drift relative to the source template. */
export type ChangeKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
    facet: Facet;
    change: ChangeKind;
    /** value as it appears in the source template (undefined when `added`). */
    sourceValue?: string;
    /** value as it appears in the region (undefined when `removed`). */
    regionValue?: string;
}

/** A stable, comparable key for a facet — dedup, lookup, and deterministic ordering. */
export function facetKey(f: Facet): string {
    switch (f.kind) {
        case 'attribute':
            return `attribute@${f.path.join('.')}#${f.name.toLowerCase()}`;
        case 'style-declaration':
            return `style-declaration@${f.path.join('.')}#${f.property.toLowerCase()}`;
        case 'children':
            return `children@${f.path.join('.')}`;
        case 'css-rule':
            return `css-rule#${f.selector}`;
        case 'css-declaration':
            return `css-declaration#${f.selector}#${f.property.toLowerCase()}`;
    }
}

/**
 * The `override` marker that suppresses (and, at sync, preserves) a facet.
 *
 * - `markup-attribute`: add `override="<value>"` on the node at `path` (bare `override` when the whole
 *   node is owned). Values: an attribute name, `style.<prop>`, or `children`.
 * - `css-comment`: place `/* jay:override *​/` (empty `value`) or `/* jay:override: <value> *​/` (a
 *   property) immediately before the rule.
 */
export interface OverrideSpec {
    target: 'markup-attribute' | 'css-comment';
    /** node the `override` attribute goes on (markup facets only). */
    path?: NodePath;
    /** the marker payload — attribute name / `style.<prop>` / `children`, or a CSS property (or '' for a whole rule). */
    value: string;
}

export function overrideSpecFor(f: Facet): OverrideSpec {
    switch (f.kind) {
        case 'attribute':
            return { target: 'markup-attribute', path: f.path, value: f.name };
        case 'style-declaration':
            return { target: 'markup-attribute', path: f.path, value: `style.${f.property}` };
        case 'children':
            return { target: 'markup-attribute', path: f.path, value: 'children' };
        case 'css-rule':
            return { target: 'css-comment', value: '' };
        case 'css-declaration':
            return { target: 'css-comment', value: f.property };
    }
}

/** Human-readable label for a facet — used in validator diagnostics (§4). */
export function facetLabel(f: Facet): string {
    switch (f.kind) {
        case 'attribute':
            return `<${f.element.toLowerCase()}> attribute "${f.name}"`;
        case 'style-declaration':
            return `<${f.element.toLowerCase()}> style "${f.property}"`;
        case 'children':
            return `<${f.element.toLowerCase()}> children`;
        case 'css-rule':
            return `css rule "${f.selector}"`;
        case 'css-declaration':
            return `css "${f.selector}" declaration "${f.property}"`;
    }
}
