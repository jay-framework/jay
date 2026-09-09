import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { resolveCascadeByBreakpoint, type ResolvedStyle } from '../css-cascade.js';

/**
 * DL#188 — flag unconstrained viewport-height units on top-level layout containers.
 *
 * Googlebot's Web Rendering Service renders the page once into a very tall viewport (~9,000–12,000px).
 * A top-level `min-height: 100vh` (or `vh`/`svh`/`lvh`/`dvh`/`vmax`) resolves against that tall value, so
 * the section becomes enormous in the crawler's render — distorting Search Console screenshots and
 * mobile-usability signals. We warn; the fix decision (text vs hero vs overlay) lives in the agent-kit
 * guide, never auto-applied.
 */

/** Matches a number immediately followed by a viewport-*height* unit (not `vw`/`vmin`). */
const VIEWPORT_HEIGHT_UNIT = /\d*\.?\d+(vh|svh|lvh|dvh|vmax)\b/i;

const TOP_LEVEL_TAGS = new Set(['html', 'body', 'main']);
const PARENT_TAGS = new Set(['body', 'main']);
const OUT_OF_FLOW = new Set(['fixed', 'absolute', 'sticky']);

// Report in a stable order so full-array assertions are deterministic.
const HEIGHT_PROPS = ['height', 'min-height'] as const;

function tagOf(el: any): string {
    return (el?.rawTagName ?? '').toLowerCase();
}

function usesViewportHeight(value: string | undefined): boolean {
    return value != null && VIEWPORT_HEIGHT_UNIT.test(value);
}

/**
 * Top-level = `<html>`/`<body>`/`<main>`, or a direct child of `<body>`/`<main>`. A deeply nested
 * `.card { height: 100vh }` is a different, lower-impact problem and out of scope (DL#188 Q2).
 */
function isTopLevel(el: any): boolean {
    if (TOP_LEVEL_TAGS.has(tagOf(el))) return true;
    return PARENT_TAGS.has(tagOf(el.parentNode));
}

export const validateViewportHeight: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css) return [];

    // Standalone component files inherit layout context from the page — only validate pages.
    if (!ctx.filePath.includes('/pages/') && !ctx.filePath.startsWith('src/pages/')) {
        return [];
    }

    // Page-level suppression: <script type="application/jay-validations"> → design-system: { ... }.
    if (ctx.validationOverrides?.['design-system']?.['allow-viewport-height'] === true) {
        return [];
    }

    // Only the base breakpoint (no @media). A vh rule scoped to a media query is intentional (author has
    // already constrained it) and never lands in the base map.
    const base = resolveCascadeByBreakpoint([ctx.css], ctx.body).get(undefined);
    if (!base) return [];

    const findings: JayHtmlValidationFinding[] = [];

    for (const [el, styles] of base) {
        if (!isTopLevel(el)) continue;

        // In normal flow only — an out-of-flow overlay does not expand the document canvas.
        if (OUT_OF_FLOW.has(styles['position']?.value?.trim().toLowerCase() ?? '')) continue;

        // A `max-height` bounds the render only in a non-viewport unit. `max-height: 100vh` caps against
        // the ~12,000px WRS viewport — no cap at all — so it does NOT clear the warning.
        const maxHeight = styles['max-height']?.value?.trim();
        const bounded =
            maxHeight != null &&
            maxHeight.toLowerCase() !== 'none' &&
            !usesViewportHeight(maxHeight);
        if (bounded) continue;

        for (const property of HEIGHT_PROPS) {
            const decl: ResolvedStyle | undefined = styles[property];
            if (!usesViewportHeight(decl?.value)) continue;

            findings.push({
                severity: 'warning',
                message:
                    `Top-level container "${decl!.selector}" sets ${property}: ${decl!.value}. ` +
                    `Googlebot renders into a very tall viewport (~12,000px), so viewport-height units ` +
                    `expand this section and distort Search Console screenshots / mobile-usability reports.`,
                suggestion:
                    `Choose a fix by content type — text: chain height from a bounded ancestor; ` +
                    `hero/visual: cap with max-height inside a mobile @media; overlay: this is safe, ` +
                    `suppress with design-system: { allow-viewport-height: true }. ` +
                    `Note: swapping vh → dvh/svh/lvh is NOT a fix (all resolve tall under Googlebot). ` +
                    `See agent-kit/designer/jay-html-styling.md (and validation-guide.md for suppression).`,
                element: `<${tagOf(el)}>`,
            });
        }
    }

    return findings;
};
