import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import postcss from 'postcss';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascadeByBreakpoint, extractCssSources, type ResolvedStyle } from '../css-cascade.js';
import {
    isColorProperty,
    isSpacingProperty,
    isRadiusProperty,
    isTypographyProperty,
    isAnimationDurationProperty,
    isAnimationEasingProperty,
    matchColor,
    matchSpacing,
    matchRounded,
    matchTypographyProperty,
    matchAnimationDuration,
    matchAnimationEasing,
} from '../token-matcher.js';
import type { DesignTokens } from '../parse-design-md.js';
import type { HTMLElement } from 'node-html-parser';

const DESIGNER_GUIDE = 'agent-kit/designer/design-system.md';

function ref(designMdPath: string): string {
    return `\nSee ${designMdPath} for tokens, ${DESIGNER_GUIDE} for usage guide.`;
}

function validateElementStyles(
    el: HTMLElement,
    styles: Record<string, ResolvedStyle>,
    tokens: DesignTokens,
    breakpointLabel: string,
    designMdPath: string,
    findings: JayHtmlValidationFinding[],
): void {
    const tag = el.rawTagName?.toLowerCase() || 'element';
    const prefix = breakpointLabel ? `[${breakpointLabel}] ` : '';
    const refs = ref(designMdPath);

    for (const [property, resolved] of Object.entries(styles)) {
        if (resolved.allowed) continue;

        if (isColorProperty(property) && Object.keys(tokens.colors).length > 0) {
            const result = matchColor(resolved.value, tokens.colors);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}Hardcoded color "${resolved.value}" for ${property} not in design system`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }

        if (isSpacingProperty(property) && Object.keys(tokens.spacing).length > 0) {
            const result = matchSpacing(resolved.value, tokens.spacing);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${property} value "${resolved.value}" not in spacing scale`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }

        if (isRadiusProperty(property) && Object.keys(tokens.rounded).length > 0) {
            const result = matchRounded(resolved.value, tokens.rounded);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}border-radius "${resolved.value}" not in rounded scale`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }

        if (isTypographyProperty(property) && Object.keys(tokens.typography).length > 0) {
            const result = matchTypographyProperty(property, resolved.value, tokens.typography);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${property} value "${resolved.value}" not in typography tokens`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }

        if (isAnimationDurationProperty(property) && Object.keys(tokens.animations).length > 0) {
            const result = matchAnimationDuration(resolved.value, tokens.animations);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${property} "${resolved.value}" not in animation presets`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }

        if (isAnimationEasingProperty(property) && Object.keys(tokens.animations).length > 0) {
            const result = matchAnimationEasing(resolved.value, tokens.animations);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${property} "${resolved.value}" not in animation presets`,
                    suggestion: result.suggestion + refs,
                    element: `<${tag}>`,
                });
            }
        }
    }
}

export const validateTokens: JayHtmlValidatorFn = (ctx) => {
    const found = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!found) return [];

    const { tokens, designMdPath } = found;
    const findings: JayHtmlValidationFinding[] = [];
    const cssSources = extractCssSources(ctx.body, ctx.filePath);
    if (cssSources.length === 0) return [];

    const byBreakpoint = resolveCascadeByBreakpoint(cssSources, ctx.body);

    for (const [breakpoint, cascade] of byBreakpoint) {
        const label = breakpoint || '';
        for (const [el, styles] of cascade) {
            validateElementStyles(el, styles, tokens, label, designMdPath, findings);
        }
    }

    if (Object.keys(tokens.animations).length > 0) {
        checkReducedMotion(cssSources, designMdPath, findings);
    }

    return findings;
};

const ANIMATION_PROPERTIES = new Set([
    'transition', 'transition-duration', 'transition-property',
    'animation', 'animation-duration', 'animation-name',
]);

function checkReducedMotion(cssSources: string[], designMdPath: string, findings: JayHtmlValidationFinding[]): void {
    let hasAnimations = false;
    let hasReducedMotion = false;

    for (const css of cssSources) {
        const root = postcss.parse(css);

        root.walkDecls((decl) => {
            if (ANIMATION_PROPERTIES.has(decl.prop) && decl.value !== 'none') {
                hasAnimations = true;
            }
        });

        root.walkAtRules('media', (atRule) => {
            if (atRule.params.includes('prefers-reduced-motion')) {
                hasReducedMotion = true;
            }
        });
    }

    if (hasAnimations && !hasReducedMotion) {
        findings.push({
            severity: 'warning',
            message: 'Page uses transitions/animations but has no @media (prefers-reduced-motion) override',
            suggestion:
                'Add @media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; animation-duration: 0s !important; } }' +
                ref(designMdPath),
        });
    }
}
