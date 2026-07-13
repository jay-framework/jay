import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascade } from '../css-cascade.js';

export const validateStructure: JayHtmlValidatorFn = (ctx) => {
    const found = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!found) return [];

    const { tokens } = found;
    const findings: JayHtmlValidationFinding[] = [];

    if (tokens.rules['max-font-weights'] && ctx.css) {
        const cascade = resolveCascade([ctx.css], ctx.body);
        const fontWeights = new Set<string>();

        for (const [, styles] of cascade) {
            const fw = styles['font-weight'];
            if (fw && !fw.allowed) fontWeights.add(fw.value);
        }

        const max = tokens.rules['max-font-weights'];
        if (fontWeights.size > max) {
            findings.push({
                severity: 'warning',
                message: `${fontWeights.size} unique font-weight values found (max: ${max}): ${[...fontWeights].join(', ')}`,
                suggestion: `Reduce to ${max} font-weight values from the DESIGN.md typography tokens`,
            });
        }
    }

    if (tokens.rules['max-primary-buttons']) {
        const primaryButtons = new Map<string, boolean>();

        walkElements(ctx.body, ctx, (el) => {
            const tag = el.rawTagName?.toLowerCase();
            if (tag !== 'button') return;

            const classes = el.getAttribute?.('class') || '';
            if (!classes.includes('primary') && !classes.includes('btn-primary')) return;

            const ref = el.getAttribute?.('ref') || '';
            const text = el.textContent?.trim() || '';
            const identity = `${ref}|${text}`;
            primaryButtons.set(identity, true);
        });

        const max = tokens.rules['max-primary-buttons'];
        if (primaryButtons.size > max) {
            findings.push({
                severity: 'warning',
                message: `${primaryButtons.size} distinct primary buttons found (max: ${max})`,
                suggestion: `Reduce to ${max} primary action button per page`,
            });
        }
    }

    return findings;
};
