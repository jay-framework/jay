import postcss from 'postcss';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { isPageFile } from './page-file.js';

/**
 * DL#242 Rule 3 — a cross-document view transition without `<link rel="expect" blocking="render">` can
 * start before the above-the-fold content is parsed, so it pops in. Pages only.
 */

const FINDING: JayHtmlValidationFinding = {
    severity: 'warning',
    message:
        'Cross-document view transition is enabled without <link rel="expect" blocking="render">. The transition can start before above-the-fold content is parsed, so it pops in.',
    suggestion:
        'Add <link rel="expect" href="#main-content" blocking="render"> in <head>, pointing at an above-the-fold element id. ' +
        'If intentional, suppress with design-system: { allow-view-transition-no-expect: true } in <script type="application/jay-validations">. ' +
        'See agent-kit/designer/layout-stability.md',
    element: '@view-transition',
};

export const validateViewTransitionExpect: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css || !isPageFile(ctx.filePath)) return [];
    if (ctx.validationOverrides?.['design-system']?.['allow-view-transition-no-expect'] === true) {
        return [];
    }
    if (!enablesCrossDocumentTransition(ctx.css)) return [];
    const hasRenderBlockingExpect = (ctx.head?.links ?? []).some(
        (link) =>
            link.rel?.toLowerCase() === 'expect' &&
            String(link.blocking ?? '')
                .toLowerCase()
                .split(/\s+/)
                .includes('render'),
    );
    return hasRenderBlockingExpect ? [] : [{ ...FINDING }];
};

function enablesCrossDocumentTransition(css: string): boolean {
    let enabled = false;
    postcss.parse(css).walkAtRules('view-transition', (atRule) => {
        atRule.walkDecls('navigation', (decl) => {
            if (decl.value.trim().toLowerCase() === 'auto') enabled = true;
        });
    });
    return enabled;
}
