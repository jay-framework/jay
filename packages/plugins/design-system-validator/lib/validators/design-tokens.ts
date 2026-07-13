import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import postcss from 'postcss';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascadeByBreakpoint, type ResolvedStyle } from '../css-cascade.js';
import {
    isColorProperty,
    isSpacingProperty,
    isRadiusProperty,
    isTypographyProperty,
    isAnimationDurationProperty,
    isAnimationEasingProperty,
    isBackgroundShorthand,
    matchColor,
    matchSpacing,
    matchRounded,
    matchTypographyProperty,
    matchAnimationDuration,
    matchAnimationEasing,
    extractBackgroundColors,
} from '../token-matcher.js';
import type { DesignTokens } from '../parse-design-md.js';
import type { HTMLElement } from 'node-html-parser';

const GUIDE_SUGGESTION = 'See design-system-validator agent-kit/designer/design-system.md for usage guide';

function elementHint(el: HTMLElement): string {
    const tag = el.rawTagName?.toLowerCase() || 'element';
    const cls = el.getAttribute?.('class');
    const text = el.textContent?.trim();
    const words = text ? text.split(/\s+/).slice(0, 3).join(' ') : '';
    const truncated = words && text!.split(/\s+/).length > 3 ? words + '...' : words;
    const parts = [`<${tag}`];
    if (cls) parts.push(`class="${cls}"`);
    parts.push('>');
    if (truncated) parts.push(`"${truncated}"`);
    return parts.join(' ');
}

function validateElementStyles(
    el: HTMLElement,
    styles: Record<string, ResolvedStyle>,
    tokens: DesignTokens,
    breakpointLabel: string,
    designMdPath: string,
    findings: JayHtmlValidationFinding[],
): void {
    const hint = elementHint(el);
    const prefix = breakpointLabel ? `[${breakpointLabel}] ` : '';
    const sug = (s?: string) => s?.replace('DESIGN.md', designMdPath);

    for (const [property, resolved] of Object.entries(styles)) {
        if (resolved.allowed) continue;

        if (isColorProperty(property) && Object.keys(tokens.colors).length > 0) {
            const result = matchColor(resolved.value, tokens.colors);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — Hardcoded color "${resolved.value}" for ${property} not in design system`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isSpacingProperty(property) && Object.keys(tokens.spacing).length > 0) {
            const result = matchSpacing(resolved.value, tokens.spacing);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — ${property} value "${resolved.value}" not in spacing scale`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isRadiusProperty(property) && Object.keys(tokens.rounded).length > 0) {
            const result = matchRounded(resolved.value, tokens.rounded);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — border-radius "${resolved.value}" not in rounded scale`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isTypographyProperty(property) && Object.keys(tokens.typography).length > 0) {
            const result = matchTypographyProperty(property, resolved.value, tokens.typography);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — ${property} value "${resolved.value}" not in typography tokens`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isAnimationDurationProperty(property) && Object.keys(tokens.animations).length > 0) {
            const result = matchAnimationDuration(resolved.value, tokens.animations);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — ${property} "${resolved.value}" not in animation presets`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isAnimationEasingProperty(property) && Object.keys(tokens.animations).length > 0) {
            const result = matchAnimationEasing(resolved.value, tokens.animations);
            if (!result.matches) {
                findings.push({
                    severity: 'warning',
                    message: `${prefix}${hint} — ${property} "${resolved.value}" not in animation presets`,
                    suggestion: sug(result.suggestion),
                    element: hint,
                });
            }
        }

        if (isBackgroundShorthand(property) && Object.keys(tokens.colors).length > 0) {
            const bgColors = extractBackgroundColors(resolved.value);
            for (const bgColor of bgColors) {
                const result = matchColor(bgColor, tokens.colors);
                if (!result.matches) {
                    findings.push({
                        severity: 'warning',
                        message: `${prefix}${hint} — Hardcoded color "${bgColor}" in background not in design system`,
                        suggestion: sug(result.suggestion),
                        element: hint,
                    });
                }
            }
        }
    }
}

export const validateTokens: JayHtmlValidatorFn = (ctx) => {
    const found = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!found) return [];

    const { tokens, designMdPath } = found;
    const findings: JayHtmlValidationFinding[] = [];
    if (!ctx.css) return [];
    const cssSources = [ctx.css];

    const byBreakpoint = resolveCascadeByBreakpoint(cssSources, ctx.body);

    for (const [breakpoint, cascade] of byBreakpoint) {
        const label = breakpoint || '';
        for (const [el, styles] of cascade) {
            validateElementStyles(el, styles, tokens, label, designMdPath, findings);
        }
    }

    if (Object.keys(tokens.animations).length > 0) {
        checkReducedMotion(cssSources, findings);
    }

    if (findings.length > 0) {
        findings.push({ severity: 'warning', message: '', suggestion: GUIDE_SUGGESTION });
    }

    return findings;
};

const ANIMATION_PROPERTIES = new Set([
    'transition',
    'transition-duration',
    'transition-property',
    'animation',
    'animation-duration',
    'animation-name',
]);

function checkReducedMotion(cssSources: string[], findings: JayHtmlValidationFinding[]): void {
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
            message:
                'Page uses transitions/animations but has no @media (prefers-reduced-motion) override',
            suggestion:
                'Add @media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; animation-duration: 0s !important; } }',
        });
    }
}
