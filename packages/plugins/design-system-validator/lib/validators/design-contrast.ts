import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascade, extractCssSources } from '../css-cascade.js';
import { hexToRgbValues, relativeLuminance, contrastRatio } from '../token-matcher.js';

function resolveColorValue(value: string, colorTokens: Record<string, string>): string | null {
    if (value.startsWith('#')) return value;
    if (value.startsWith('rgb')) {
        const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
    }
    return null;
}

function isLargeText(fontSize: string | undefined, fontWeight: string | undefined): boolean {
    if (!fontSize) return false;
    const sizeMatch = fontSize.match(/([\d.]+)(px|rem|em)/);
    if (!sizeMatch) return false;

    let sizePx = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2];
    if (unit === 'rem' || unit === 'em') sizePx *= 16;

    const weight = fontWeight ? parseInt(fontWeight, 10) : 400;
    return sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
}

export const validateContrast: JayHtmlValidatorFn = (ctx) => {
    const tokens = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!tokens || !tokens.rules['require-contrast-aa']) return [];

    const findings: JayHtmlValidationFinding[] = [];
    const cssSources = extractCssSources(ctx.body, ctx.filePath);
    if (cssSources.length === 0) return [];

    const cascade = resolveCascade(cssSources, ctx.body);

    for (const [el, styles] of cascade) {
        const colorStyle = styles['color'];
        const bgStyle = styles['background-color'] || styles['background'];

        if (!colorStyle || !bgStyle) continue;
        if (colorStyle.allowed || bgStyle.allowed) continue;

        const fgHex = resolveColorValue(colorStyle.value, tokens.colors);
        const bgHex = resolveColorValue(bgStyle.value, tokens.colors);

        if (!fgHex || !bgHex) continue;

        const fgRgb = hexToRgbValues(fgHex);
        const bgRgb = hexToRgbValues(bgHex);
        if (!fgRgb || !bgRgb) continue;

        const fgLum = relativeLuminance(...fgRgb);
        const bgLum = relativeLuminance(...bgRgb);
        const ratio = contrastRatio(fgLum, bgLum);

        const large = isLargeText(styles['font-size']?.value, styles['font-weight']?.value);
        const threshold = large ? 3 : 4.5;

        if (ratio < threshold) {
            const tag = el.rawTagName?.toLowerCase() || 'element';
            findings.push({
                severity: 'warning',
                message: `Contrast ratio ${ratio.toFixed(1)}:1 below WCAG AA (${threshold}:1) for color "${colorStyle.value}" on background "${bgStyle.value}"`,
                suggestion: 'Darken text color or lighten background to meet minimum contrast',
                element: `<${tag}>`,
            });
        }
    }

    return findings;
};
