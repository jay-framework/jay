import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascade } from '../css-cascade.js';
import { matchComponent, formatComponentMismatches } from '../token-matcher.js';
import type { HTMLElement } from 'node-html-parser';

const GUIDE_SUGGESTION = 'See design-system-validator agent-kit/designer/design-system.md for usage guide';

function describeElement(el: HTMLElement): string {
    const tag = el.rawTagName?.toLowerCase() || 'element';
    const cls = el.getAttribute?.('class');
    const ref = el.getAttribute?.('ref');
    const text = el.textContent?.trim().slice(0, 30);
    const parts = [`<${tag}`];
    if (cls) parts.push(`class="${cls}"`);
    if (ref) parts.push(`ref="${ref}"`);
    parts.push('>');
    if (text) parts.push(`"${text}${el.textContent!.trim().length > 30 ? '…' : ''}"`);
    return parts.join(' ');
}

export const validateComponents: JayHtmlValidatorFn = (ctx) => {
    const found = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!found || Object.keys(found.tokens.components).length === 0) return [];

    const { tokens, designMdPath } = found;
    const findings: JayHtmlValidationFinding[] = [];
    if (!ctx.css) return [];
    const cascade = resolveCascade([ctx.css], ctx.body);

    const jayComponents = new Map<string, HTMLElement[]>();
    const htmlComponents = new Map<string, string>();

    for (const componentName of Object.keys(tokens.components)) {
        if (componentName.startsWith('jay:')) {
            jayComponents.set(componentName.substring(4), []);
        } else {
            htmlComponents.set(componentName, `.${componentName}`);
        }
    }

    function walk(el: HTMLElement) {
        const tag = el.rawTagName?.toLowerCase();
        if (tag?.startsWith('jay:')) {
            const contractName = tag.substring(4);
            if (jayComponents.has(contractName)) {
                const children = el.childNodes.filter((n) => n.nodeType === 1) as HTMLElement[];
                if (children.length > 0) {
                    jayComponents.get(contractName)!.push(...children);
                }
            }
        }
        for (const child of el.childNodes) {
            if (child.nodeType === 1) walk(child as HTMLElement);
        }
    }
    walk(ctx.body);

    for (const [contractName, elements] of jayComponents) {
        const componentName = `jay:${contractName}`;
        const spec = tokens.components[componentName];
        const rawSpec = tokens.rawComponents[componentName];
        if (!spec) continue;

        for (const el of elements) {
            const styles = cascade.get(el);
            if (!styles) continue;

            const styleValues: Record<string, string> = {};
            for (const [prop, resolved] of Object.entries(styles)) {
                if (!resolved.allowed) styleValues[prop] = resolved.value;
            }

            const mismatches = matchComponent(styleValues, spec, rawSpec);
            if (mismatches.length > 0) {
                const desc = describeElement(el);
                findings.push({
                    severity: 'warning',
                    message: formatComponentMismatches(componentName, mismatches, desc),
                    suggestion: `See ${designMdPath} components section`,
                    element: desc,
                });
            }
        }
    }

    for (const [componentName, selector] of htmlComponents) {
        const spec = tokens.components[componentName];
        const rawSpec = tokens.rawComponents[componentName];
        if (!spec) continue;

        for (const [el, styles] of cascade) {
            try {
                const matchedEls = ctx.body.querySelectorAll(selector);
                if (!matchedEls.some((m: HTMLElement) => m === el)) continue;
            } catch {
                continue;
            }

            const styleValues: Record<string, string> = {};
            for (const [prop, resolved] of Object.entries(styles)) {
                if (!resolved.allowed) styleValues[prop] = resolved.value;
            }

            const mismatches = matchComponent(styleValues, spec, rawSpec);
            if (mismatches.length > 0) {
                const desc = describeElement(el);
                findings.push({
                    severity: 'warning',
                    message: formatComponentMismatches(componentName, mismatches, desc),
                    suggestion: `See ${designMdPath} components section`,
                    element: desc,
                });
            }
        }
    }

    if (findings.length > 0) {
        findings.push({ severity: 'warning', message: '', suggestion: GUIDE_SUGGESTION });
    }

    return findings;
};
