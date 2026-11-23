import type { HTMLElement } from 'node-html-parser';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { resolveCascade, resolveCascadeByBreakpoint, type ResolvedStyle } from '../css-cascade.js';

/**
 * DL#242 Rule 1 — `<video>`/`<iframe>` without reserved space start at 300x150 and shift the layout.
 * Runs on pages **and** component files: each file is validated against its own body and CSS.
 */

const SUGGESTION =
    'Add width and height attributes, or aspect-ratio + object-fit on the element itself (not on a wrapper). ' +
    'If intentional, suppress with design-system: { allow-media-no-dimensions: true } in <script type="application/jay-validations">. ' +
    'See agent-kit/designer/layout-stability.md';

const MESSAGES: Record<string, string> = {
    video: '<video> has no width/height or aspect-ratio. It renders at 300x150, then jumps when the video metadata loads (CLS).',
    iframe: '<iframe> has no width/height or aspect-ratio. It renders at the 300x150 default and shifts the layout when the embed or a script resizes it (CLS).',
};

type Styles = Record<string, ResolvedStyle>;

export const validateMediaDimensions: JayHtmlValidatorFn = (ctx) => {
    if (ctx.validationOverrides?.['design-system']?.['allow-media-no-dimensions'] === true)
        return [];
    const body = ctx.body as HTMLElement;
    const media = body.querySelectorAll('video, iframe');
    if (media.length === 0) return [];

    const base = baseStyles(ctx.css, body);
    const findings: JayHtmlValidationFinding[] = [];
    for (const el of media) {
        const styles = base.get(el) ?? {};
        if (isOutOfFlowOrHidden(el, styles) || hasReservedSpace(el, styles)) continue;
        const tag = el.rawTagName.toLowerCase();
        findings.push({
            severity: 'warning',
            message: MESSAGES[tag],
            suggestion: SUGGESTION,
            element: `<${tag}>`,
            attribute: 'width',
        });
    }
    return findings;
};

/** Base (no `@media`) styles per element, inline `style` included. */
function baseStyles(css: string | undefined, body: HTMLElement): Map<HTMLElement, Styles> {
    const base = css ? resolveCascadeByBreakpoint([css], body).get(undefined) : undefined;
    return base ?? resolveCascade([''], body);
}

function valueOf(styles: Styles, property: string): string | undefined {
    return styles[property]?.value?.trim().toLowerCase();
}

function isOutOfFlowOrHidden(el: HTMLElement, styles: Styles): boolean {
    const position = valueOf(styles, 'position');
    return (
        el.hasAttribute('hidden') ||
        valueOf(styles, 'display') === 'none' ||
        position === 'absolute' ||
        position === 'fixed'
    );
}

function hasReservedSpace(el: HTMLElement, styles: Styles): boolean {
    const hasAttribute = (name: string) => (el.getAttribute(name) ?? '').trim() !== '';
    const sized = (property: string) => {
        const value = valueOf(styles, property);
        return value != null && value !== '' && value !== 'auto';
    };
    return (
        (hasAttribute('width') && hasAttribute('height')) ||
        sized('aspect-ratio') ||
        (sized('width') && sized('height'))
    );
}
