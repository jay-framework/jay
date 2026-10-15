import type { JayHtmlValidationContext, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { JayObjectType, resolveBinding, walkElements } from '@jay-framework/compiler-shared';
import {
    parseAccessor,
    parseTemplateParts,
    Variables,
} from '@jay-framework/compiler-jay-html';
import { cssFirstError, cssFirstWarning } from './findings.js';
import {
    matchesScrollRevealAttribute,
    matchesScrollRevealScriptSrc,
} from './scroll-reveal-libraries.js';
import { isHtmlEventHandlerAttribute } from '../shared/html-event-handler-attributes.js';

function isJavascriptUrl(value: string | undefined): boolean {
    if (!value) return false;
    return value.trim().toLowerCase().startsWith('javascript:');
}

function isNativeHtmlElement(rawTagName: string | undefined): boolean {
    if (!rawTagName || rawTagName.includes(':')) return false;
    return rawTagName === rawTagName.toLowerCase();
}

const bindingParseVars = new Variables(new JayObjectType('data', {}));

function bindingPathFromJayExpression(expression: string): string | undefined {
    const trimmed = expression.trim();
    const accessor = parseAccessor(trimmed, bindingParseVars);
    if (accessor.validations.some((message) => message.includes('Failed to parse'))) {
        return undefined;
    }
    if (accessor.terms.length === 0) return undefined;
    if (accessor.terms.length === 1 && accessor.terms[0] === '.') return undefined;
    return accessor.terms.join('.');
}

function attributeBindingsResolveToContractTag(
    value: string,
    scope: Parameters<typeof resolveBinding>[1],
): boolean {
    try {
        const parts = parseTemplateParts(value);
        for (const part of parts) {
            if (part.kind !== 'binding') continue;
            const path = bindingPathFromJayExpression(part.value);
            if (!path) continue;
            const resolved = resolveBinding(path, scope);
            if (resolved.tag) return true;
        }
    } catch {
        return false;
    }
    return false;
}

function elementDescriptor(el: {
    rawTagName?: string;
    getAttribute?: (name: string) => string;
}): string {
    const tag = el.rawTagName?.toLowerCase() ?? 'element';
    const ref = el.getAttribute?.('ref');
    const id = el.getAttribute?.('id');
    const firstClass = el.getAttribute?.('class')?.split(/\s+/).find(Boolean);
    const hint = ref
        ? `ref="${ref}"`
        : id
          ? `id="${id}"`
          : firstClass
            ? `class="${firstClass}"`
            : '';
    return hint ? `<${tag} ${hint}>` : `<${tag}>`;
}

function isJsLazyLoadImg(el: { getAttribute?: (name: string) => string }): boolean {
    const dataSrc = el.getAttribute?.('data-src');
    const dataSrcset = el.getAttribute?.('data-srcset');
    if (!dataSrc && !dataSrcset) return false;
    const src = el.getAttribute?.('src');
    if (!src || src.trim() === '') return true;
    return src.trim().toLowerCase().startsWith('data:');
}

export function runTemplateRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    const emittedForElement = new Set<string>();

    const pushOncePerElement = (
        elementKey: string,
        ruleKey: string,
        finding: JayHtmlValidationFinding,
    ) => {
        const dedupeKey = `${ruleKey}:${elementKey}`;
        if (emittedForElement.has(dedupeKey)) return;
        emittedForElement.add(dedupeKey);
        findings.push(finding);
    };

    walkElements(ctx.body, ctx, (el, scope) => {
        const rawTagName = el.rawTagName;
        const tag: string | undefined = rawTagName?.toLowerCase();
        if (!tag) return;

        const elementKey = elementDescriptor(el);

        if (tag === 'script') {
            const src = el.getAttribute?.('src');
            if (src && matchesScrollRevealScriptSrc(src)) {
                pushOncePerElement(
                    elementKey,
                    'allow-scroll-reveal-library',
                    cssFirstWarning(
                        'allow-scroll-reveal-library',
                        `Scroll-reveal library script "${src}" on ${elementKey}`,
                        'Prefer @keyframes with animation-timeline: view() and an @supports fallback',
                        { element: elementKey },
                    ),
                );
            }
        }

        if (tag === 'img' && isJsLazyLoadImg(el)) {
            pushOncePerElement(
                elementKey,
                'allow-js-lazy-load',
                cssFirstWarning(
                    'allow-js-lazy-load',
                    `${elementKey} uses data-src lazy-loading without a real src — native loading="lazy" is sufficient`,
                    'Add loading="lazy" and use src for the default image',
                    { element: elementKey },
                ),
            );
        }

        const attrs: Record<string, string> = el.attributes ?? {};
        let scrollRevealOnElement = false;
        for (const [attrName] of Object.entries(attrs)) {
            const lower = attrName.toLowerCase();
            if (matchesScrollRevealAttribute(lower)) {
                scrollRevealOnElement = true;
                break;
            }
        }
        if (scrollRevealOnElement) {
            pushOncePerElement(
                elementKey,
                'allow-scroll-reveal-library',
                cssFirstWarning(
                    'allow-scroll-reveal-library',
                    `Scroll-reveal attributes on ${elementKey} — CSS view() animations can replace this library`,
                    'Use @keyframes + animation-timeline: view()',
                    { element: elementKey },
                ),
            );
        }

        if (!isNativeHtmlElement(rawTagName)) return;

        for (const [attrName, attrValue] of Object.entries(attrs)) {
            const lowerName = attrName.toLowerCase();
            if (
                lowerName === 'href' ||
                lowerName === 'src' ||
                lowerName === 'action' ||
                lowerName === 'formaction'
            ) {
                if (isJavascriptUrl(attrValue)) {
                    findings.push(
                        cssFirstWarning(
                            'allow-javascript-url',
                            `${lowerName} on ${elementKey} uses a javascript: URL`,
                            'Use <button type="button">, popovertarget, or <details>. If you still need custom behavior, use a ref in the component script instead of a javascript: URL',
                            { element: elementKey, attribute: lowerName },
                        ),
                    );
                }
            }

            if (isHtmlEventHandlerAttribute(lowerName) && attrValue) {
                if (attributeBindingsResolveToContractTag(attrValue, scope)) {
                    findings.push(
                        cssFirstError(
                            'bound-inline-event-handler',
                            `Bound inline event handler ${lowerName} on ${elementKey} interpolates ViewState into executable markup`,
                            'Move the handler to a ref in the component script',
                            { element: elementKey, attribute: lowerName },
                        ),
                    );
                } else {
                    findings.push(
                        cssFirstWarning(
                            'allow-inline-event-handlers',
                            `Inline event handler ${lowerName} on ${elementKey}`,
                            'Use CSS for presentation and ref handlers for application logic',
                            { element: elementKey, attribute: lowerName },
                        ),
                    );
                }
            }
        }
    });

    return findings;
}
