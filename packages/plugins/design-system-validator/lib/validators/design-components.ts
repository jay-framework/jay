import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { findDesignMd } from '../parse-design-md.js';
import { resolveCascade, extractCssSources } from '../css-cascade.js';
import { matchComponent } from '../token-matcher.js';
import type { HTMLElement } from 'node-html-parser';

export const validateComponents: JayHtmlValidatorFn = (ctx) => {
    const tokens = findDesignMd(ctx.filePath, ctx.projectRoot);
    if (!tokens || Object.keys(tokens.components).length === 0) return [];

    const findings: JayHtmlValidationFinding[] = [];
    const cssSources = extractCssSources(ctx.body, ctx.filePath);
    const cascade = resolveCascade(cssSources, ctx.body);

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
        if (!spec) continue;

        for (const el of elements) {
            const styles = cascade.get(el);
            if (!styles) continue;

            const styleValues: Record<string, string> = {};
            for (const [prop, resolved] of Object.entries(styles)) {
                if (!resolved.allowed) styleValues[prop] = resolved.value;
            }

            const results = matchComponent(styleValues, spec, componentName);
            for (const result of results) {
                if (!result.matches) {
                    findings.push({
                        severity: 'warning',
                        message: `<${componentName}> inline template: ${result.suggestion}`,
                        element: `<${el.rawTagName || 'element'}>`,
                    });
                }
            }
        }
    }

    for (const [componentName, selector] of htmlComponents) {
        const spec = tokens.components[componentName];
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

            const results = matchComponent(styleValues, spec, componentName);
            for (const result of results) {
                if (!result.matches) {
                    findings.push({
                        severity: 'warning',
                        message: `Component "${componentName}": ${result.suggestion}`,
                        element: `<${el.rawTagName || 'element'}>`,
                    });
                }
            }
        }
    }

    return findings;
};
