/**
 * DL#196 §5 / Phase 2–3 — the materialiser: flatten a component's source template (and its CSS) into
 * a page as a source-owned region, transitively. It is a **source-to-source** transform (page HTML in,
 * page HTML out) and the single engine behind both:
 *
 *  - **first-fill** (Phase 2 / `sync` on an empty region) — copy the template body verbatim; and
 *  - **sync / re-flatten** (Phase 3) — copy the current template body but keep every `override` facet
 *    the page already owns (deterministic overwrite-with-holes; no merge base, no hash — §5).
 *
 * It is dependency-light and pure: template loading, the contract→template map and (optional) HTML
 * prettifier are all injected, so the stack-cli wiring supplies `parseJayFile` + `prettifyHtml` while
 * unit tests supply plain stubs. `jc` injection stays the compiler-parser's job (§2, not done here).
 */

import { HTMLElement, parse } from 'node-html-parser';
import postcss from 'postcss';
import {
    CONTENT_MARKER,
    isPageScope,
    isRegionTag,
    parseContent,
    parseOverride,
    readAttr,
    Suppression,
    unionSuppression,
} from './override';
import { parseInlineStyle, serializeInlineStyle } from './style';

/** A component template resolved for flattening. */
export interface LoadedTemplate {
    /** the template's flattenable markup (its body), copied verbatim into the region. */
    body: string;
    /** the component's own CSS, if any — wrapped in `@scope` around the region and appended. */
    css?: string;
}

export interface MaterialiseOptions {
    /** Map a `<jay:X>` contract name to its source-template path, or null when the region is not materialisable. */
    resolveTemplate: (contractName: string) => string | null;
    /** Load a template's body + CSS by path, or null when it cannot be resolved (→ a hard error). */
    loadTemplate: (templatePath: string) => LoadedTemplate | null;
    /** The `@scope` selector for a region (default: `.<ref>` from the region's `ref`, else no CSS scope). */
    scopeSelector?: (region: HTMLElement) => string | null;
    /** Keep the page's `override` facets when re-flattening (sync). Default false = verbatim first-fill. */
    preserveOverrides?: boolean;
    /** Pretty-print the final page HTML (stack-cli passes `prettifyHtml`; tests may omit it). */
    prettify?: (html: string) => string;
}

export interface MaterialiseResult {
    /** the page HTML with every resolvable region flattened. */
    html: string;
    /** the aggregated, `@scope`-wrapped component CSS (append to the page's CSS). */
    css: string;
    /** hard errors — an unresolvable `template=`, or a template-inclusion cycle. */
    errors: string[];
}

/**
 * One region's contribution to the aggregated CSS, before coalescing. `key` is the region's `template=`
 * provenance path — the coalescing key (DL#196 §4/§5 refinement): scoped blocks sharing a template are
 * merged into one selector-list `@scope`. A ref-less block (no `selector`) is never coalesced.
 */
interface CssContribution {
    key: string;
    selector: string | null;
    css: string;
    /**
     * DL#203 — the donut boundary: the scope-anchor classes (`.<ref>`) of this region's *direct* child
     * regions. Emitted as `@scope (sel) to (…)` so the region's scoped CSS stops at each nested region.
     * Folded into `key` so two instances of one template with different child nesting do not coalesce.
     */
    to?: string[];
}

/** Flatten every resolvable `<jay:X>` region in `pageHtml`, transitively. */
export function materialise(pageHtml: string, opts: MaterialiseOptions): MaterialiseResult {
    const root = parse(pageHtml);
    const errors: string[] = [];
    const contributions: CssContribution[] = [];

    fillRegions(root, [], opts, errors, contributions);
    stripContentMarkers(root);

    const serialized = root.toString();
    return {
        html: opts.prettify ? opts.prettify(serialized) : serialized,
        css: coalesceCss(contributions),
        errors,
    };
}

/**
 * Coalesce per-region `@scope` blocks that share a `template=` provenance into one selector-list block
 * (DL#196 §4/§5 refinement). N override-free instances of the same template emit one
 * `@scope (.a, .b) { … }`, not N identical copies. Blocks are keyed by template path, not by body: same
 * component through *different* templates stays separate (independent sources). Ref-less blocks (no scope)
 * are passed through in place, never merged. First-seen order is preserved.
 */
function coalesceCss(contributions: CssContribution[]): string {
    interface Group {
        selectors: string[];
        css: string;
        to?: string[];
    }
    const groups: Group[] = [];
    const byKey = new Map<string, Group>();
    for (const { key, selector, css, to } of contributions) {
        if (selector === null) {
            groups.push({ selectors: [], css }); // ref-less — standalone, never coalesced
            continue;
        }
        const existing = byKey.get(key);
        if (existing) {
            // Dedupe: distinct region instances can share a ref (e.g. two cards each nesting a
            // `ref="cta"` button), which would otherwise emit `@scope (.cta, .cta)`.
            if (!existing.selectors.includes(selector)) existing.selectors.push(selector);
        } else {
            // The `to` list is identical across a group by construction (it is folded into `key`), so any
            // member's `to` is the group's `to` (DL#203).
            const group: Group = { selectors: [selector], css, to };
            byKey.set(key, group);
            groups.push(group);
        }
    }
    return groups
        .map((g) =>
            g.selectors.length > 0 ? scopeWrap(g.css, g.selectors.join(', '), g.to) : g.css,
        )
        .join('\n\n');
}

/**
 * Fill every direct-or-nested region under `container`. `stack` is the chain of template paths currently
 * being expanded on this branch — used to detect a template that (transitively) includes itself.
 */
function fillRegions(
    container: HTMLElement,
    stack: string[],
    opts: MaterialiseOptions,
    errors: string[],
    cssBlocks: CssContribution[],
    parentScoped: boolean = false,
): void {
    for (const region of directRegions(container)) {
        const name = contractName(region);
        const templatePath = opts.resolveTemplate(name);
        if (!templatePath) continue; // not a materialisable region — leave it as authored

        if (stack.includes(templatePath)) {
            errors.push(
                `template inclusion cycle: <jay:${name}> (${templatePath}) includes itself via ${[...stack, templatePath].join(' → ')}`,
            );
            continue;
        }

        const template = opts.loadTemplate(templatePath);
        if (!template) {
            errors.push(
                `cannot resolve template "${templatePath}" for <jay:${name}> — check the template= provenance`,
            );
            continue;
        }

        const existing = region.innerHTML;
        const filled = opts.preserveOverrides
            ? mergeOverrides(template.body, existing)
            : template.body;
        region.set_content(filled);

        const ref = readAttr(region, 'ref');
        let scoped = false; // does this region emit its own `@scope` block?

        if (template.css) {
            const selector = (opts.scopeSelector ?? defaultScopeSelector)(region);
            if (selector) {
                scoped = true;
                // DL#203 — the donut boundary: the scope-anchor classes of this region's *direct* child
                // regions, so the scoped CSS stops at each nested region. Only materialisable children with a
                // `ref` get a stamped anchor and can be excluded; a ref-less or non-materialisable child is
                // omitted here (and flagged by `jay-stack validate`'s require-ref rule). Fold the (sorted) list
                // into the coalescing key so two instances of one template with different nesting do not merge.
                const to = [
                    ...new Set(
                        directRegions(region)
                            .filter((c) => opts.resolveTemplate(contractName(c)) !== null)
                            .map((c) => readAttr(c, 'ref'))
                            .filter((r): r is string => !!r)
                            .map((r) => `.${r}`),
                    ),
                ];
                // Rewrite root-block selectors to `:scope` so the component's own root rule applies to the
                // `@scope` root element (scoped selectors otherwise match descendants only — see scopeReadyCss).
                cssBlocks.push({
                    key: `${templatePath}\0${[...to].sort().join(',')}`,
                    selector,
                    css: scopeReadyCss(template.body, template.css),
                    to,
                });
            } else {
                cssBlocks.push({ key: templatePath, selector: null, css: template.css });
            }
        }

        // A jay `ref` is consumed by the reference system and never emitted to the DOM, so `@scope (.<ref>)`
        // has no element to root at. Stamp the ref as a real class on the flattened region root(s) — the
        // element(s) the scoped rules sit under. Stamp when this region ships scoped CSS (its own root), OR
        // when its parent's donut (`to (.<ref>)`) names it as a boundary (`parentScoped`) — a child with no
        // CSS still needs the class so the parent's limit resolves. The differ ignores it (never drift).
        if (ref && (scoped || parentScoped)) stampScopeAnchor(region, ref);

        // Transitive: flatten regions the just-inserted template body itself contains. `scoped` tells those
        // children whether this region's donut names them (so they must stamp their boundary anchor).
        fillRegions(region, [...stack, templatePath], opts, errors, cssBlocks, scoped);
    }
}

/** Regions reachable under `container` without descending through a region we will recurse into itself. */
function directRegions(container: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const visit = (el: HTMLElement): void => {
        for (const child of el.childNodes) {
            if (!(child instanceof HTMLElement)) continue;
            if (isRegionTag(child)) out.push(child);
            else visit(child);
        }
    };
    visit(container);
    return out;
}

function contractName(region: HTMLElement): string {
    return (region.tagName ?? '').slice('jay:'.length).toLowerCase();
}

function defaultScopeSelector(region: HTMLElement): string | null {
    const ref = readAttr(region, 'ref');
    return ref ? `.${ref}` : null;
}

function scopeWrap(css: string, selector: string, to?: string[]): string {
    // DL#203 — the scoping limit (donut): `to (…)` stops the scoped CSS at each direct child region's root,
    // so a parent descendant selector never styles DOM inside a nested region (structural isolation).
    const limit = to && to.length ? ` to (${to.join(', ')})` : '';
    return `@scope (${selector})${limit} {\n${css}\n}`;
}

/**
 * The class tokens on the top-level element(s) of a template body — the region's flattened root element(s).
 * These are the classes the component authors its root rule against (e.g. `ds-card` for `<div class="ds-card">`).
 */
export function rootClassesOf(templateBody: string): Set<string> {
    const classes = new Set<string>();
    for (const child of parse(templateBody).childNodes) {
        if (child instanceof HTMLElement) {
            for (const c of child.classList.values()) classes.add(c);
        }
    }
    return classes;
}

/**
 * DL#196 — make a component's CSS apply to its flattened region **root**, not just descendants.
 *
 * The materialiser wraps component CSS in `@scope (.<ref>)`, but a scoped selector only matches *proper
 * descendants* of the scope root; the root element itself is matchable **only via `:scope`** (CSS Cascade 6
 * — verified in Chromium: `.ds-card { … }` inside `@scope (.ref)` does not style the `.ds-card` root, but
 * `:scope { … }` does). A component targets its own root through the root element's block class (`.ds-card`),
 * which would silently stop applying once scoped. So every selector token equal to a root class is rewritten
 * to `:scope`; descendant/element selectors (`.ds-card__heading`) are left untouched — they already match in
 * scope. Applied before coalescing, so same-template instances still produce an identical body and merge.
 *
 * Only meaningful for CSS that will be `@scope`-wrapped (a `ref` is present); unscoped (global) CSS keeps its
 * class selectors, where `:scope` has no scope root to resolve against.
 */
export function scopeReadyCss(templateBody: string, css: string): string {
    const rootClasses = rootClassesOf(templateBody);
    if (rootClasses.size === 0) return css;
    try {
        const root = postcss.parse(css);
        root.walkRules((rule) => {
            rule.selectors = rule.selectors.map((sel) => rewriteRootSelector(sel, rootClasses));
        });
        return root.toString();
    } catch {
        return css; // malformed CSS — emit verbatim rather than throwing (matches diffCss resilience)
    }
}

/** Replace each class token equal to a root class with `:scope` (leaving other class tokens intact). */
function rewriteRootSelector(selector: string, rootClasses: Set<string>): string {
    return selector.replace(/\.([A-Za-z0-9_-]+)/g, (match, name) =>
        rootClasses.has(name) ? ':scope' : match,
    );
}

/**
 * Stamp the scope-anchor class on the flattened region's top-level element(s). `@scope (.<ref>)` needs a
 * real DOM element to root at, but a jay `ref` is not rendered as a class — so the materialiser adds it.
 * Idempotent (`classList.add` dedups); re-derived from the ref on every re-flatten (survives sync).
 */
function stampScopeAnchor(region: HTMLElement, className: string): void {
    for (const child of region.childNodes) {
        if (child instanceof HTMLElement) child.classList.add(className);
    }
}

// --- sync merge: re-flatten from template, keep the page's override facets ---

/**
 * Produce the new region body: the template body, but with every `override` facet the page currently
 * owns carried over from `existingBody`. Node matching rides on the same content-child alignment the
 * differ uses (§3); when structure has diverged and is not aligned, the template wins (unless the page
 * marked the parent's `children` — handled one level up).
 */
export function mergeOverrides(templateBody: string, existingBody: string): string {
    const tRoot = parse(templateBody);
    const eRoot = parse(existingBody);
    mergeChildren(tRoot, eRoot);
    stripContentMarkers(tRoot);
    return tRoot.toString();
}

/**
 * DL#202 — `jay-content` is a **template-side** marker: the materialiser and differ always re-read it from
 * the component source (`parseContent(te)` / `parseContent(se)`), never from the page. A copy on the
 * flattened page is therefore never consulted — it is dead weight and misleading (it reads as if the page
 * were declaring the slot). So strip it from every flattened output node. Contrast `override=`/`page-scope`,
 * which are page-owned provenance that {@link carryMarkers} deliberately persists so the hole survives sync.
 */
function stripContentMarkers(root: HTMLElement): void {
    const visit = (el: HTMLElement): void => {
        if (readAttr(el, CONTENT_MARKER) !== undefined) el.removeAttribute(CONTENT_MARKER);
        for (const child of el.childNodes) if (child instanceof HTMLElement) visit(child);
    };
    visit(root);
}

function mergeChildren(tParent: HTMLElement, eParent: HTMLElement): void {
    const t = contentElements(tParent);
    const e = contentElements(eParent);
    if (!aligned(t, e)) return; // structure diverged — re-flatten wins
    for (let i = 0; i < t.length; i++) mergeElement(t[i], e[i]);
}

function mergeElement(te: HTMLElement, ee: HTMLElement): void {
    if (isRegionTag(te)) {
        // A nested region's tag (its `ref` + props) is governed by the parent template, but its body may
        // hold page-owned `override` facets at any depth. Keep the template's tag, but carry the page's
        // region body across so the transitive re-flatten (`fillRegions`) merges those facets in at the
        // child region's own level (DL#196 Issue 1). This mirrors the differ, which stops at the region
        // boundary while `checkRegionDrift` visits each region separately — so an override deep inside a
        // nested region is preserved without marking the parent's `<jay:X>` inclusion. Returning here
        // instead (the old behaviour) discarded the page's nested body before recursion could see it.
        te.set_content(ee.innerHTML);
        return;
    }
    // DL#202 — union the page node's `override=` with the template node's `jay-content` slot. On sync we keep
    // the consumer's version of every owned facet (children and/or named attributes like `src`/`alt`) and
    // re-flatten the rest. `jay-content` lives on the template node `te`, so it is re-read each sync and never
    // needs a page-side marker; it is stripped from the flattened output by `stripContentMarkers` (it has no
    // role on the page — see that helper).
    const sup = unionSuppression(parseOverride(ee), parseContent(te));

    if (sup.all) {
        // whole node page-owned — keep the page's node verbatim.
        te.replaceWith(ee.outerHTML);
        return;
    }

    carryOwnedAttributes(te, ee, sup);
    carryOwnedStyle(te, ee, sup);
    carryMarkers(te, ee);

    if (sup.children) {
        te.set_content(ee.innerHTML); // page owns the subtree
    } else {
        mergeChildren(te, ee);
    }
}

function carryOwnedAttributes(te: HTMLElement, ee: HTMLElement, sup: Suppression): void {
    for (const name of sup.attributes) {
        const v = readAttr(ee, name);
        if (v === undefined) te.removeAttribute(name);
        else te.setAttribute(name, v);
    }
}

function carryOwnedStyle(te: HTMLElement, ee: HTMLElement, sup: Suppression): void {
    if (sup.styleProps.size === 0) return;
    const merged = parseInlineStyle(te.getAttribute('style'));
    const pageStyle = parseInlineStyle(ee.getAttribute('style'));
    for (const prop of sup.styleProps) {
        const v = pageStyle.get(prop);
        if (v === undefined) merged.delete(prop);
        else merged.set(prop, v);
    }
    const serialized = serializeInlineStyle(merged);
    if (serialized) te.setAttribute('style', serialized);
    else te.removeAttribute('style');
}

/** Re-attach the page's `override` / `page-scope` markers so the hole persists across future syncs. */
function carryMarkers(te: HTMLElement, ee: HTMLElement): void {
    const override = readAttr(ee, 'override');
    if (override !== undefined) te.setAttribute('override', override);
    if (isPageScope(ee)) te.setAttribute('page-scope', readAttr(ee, 'page-scope') ?? '');
}

function contentElements(parent: HTMLElement): HTMLElement[] {
    return parent.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement);
}

/** Aligned when the element sequences have equal length and matching tag names, position by position. */
function aligned(t: HTMLElement[], e: HTMLElement[]): boolean {
    if (t.length !== e.length) return false;
    for (let i = 0; i < t.length; i++) {
        if ((t[i].tagName ?? '').toLowerCase() !== (e[i].tagName ?? '').toLowerCase()) return false;
    }
    return true;
}
