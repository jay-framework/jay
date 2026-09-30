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
import { isPageScope, isRegionTag, parseOverride, readAttr, Suppression } from './override';
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

/** Flatten every resolvable `<jay:X>` region in `pageHtml`, transitively. */
export function materialise(pageHtml: string, opts: MaterialiseOptions): MaterialiseResult {
    const root = parse(pageHtml);
    const errors: string[] = [];
    const cssBlocks: string[] = [];

    fillRegions(root, [], opts, errors, cssBlocks);

    const serialized = root.toString();
    return {
        html: opts.prettify ? opts.prettify(serialized) : serialized,
        css: cssBlocks.join('\n\n'),
        errors,
    };
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
    cssBlocks: string[],
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

        if (template.css) {
            const selector = (opts.scopeSelector ?? defaultScopeSelector)(region);
            if (selector) {
                // A jay `ref` is consumed by the reference system and never emitted to the DOM, so
                // `@scope (.<ref>)` has no element to root at. Stamp the ref as a real class on the
                // flattened region root(s) — the element(s) the scoped rules must sit under. The differ
                // ignores this synthetic class so it is never reported as drift (diff-markup.ts).
                const ref = readAttr(region, 'ref');
                if (ref) stampScopeAnchor(region, ref);
                cssBlocks.push(scopeWrap(template.css, selector));
            } else {
                cssBlocks.push(template.css);
            }
        }

        // Transitive: flatten regions the just-inserted template body itself contains.
        fillRegions(region, [...stack, templatePath], opts, errors, cssBlocks);
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

function scopeWrap(css: string, selector: string): string {
    return `@scope (${selector}) {\n${css}\n}`;
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
    return tRoot.toString();
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
    const sup = parseOverride(ee);

    if (sup.all) {
        // whole node page-owned — keep the page's node verbatim (it already carries its marker).
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
