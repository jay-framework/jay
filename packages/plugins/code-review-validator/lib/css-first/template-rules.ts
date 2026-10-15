import type { JayHtmlValidationContext, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { resolveBinding, walkElements } from '@jay-framework/compiler-shared';
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';
import { bindingPathsFromExpression } from '../shared/binding-paths.js';
import { cssFirstError, cssFirstWarning } from './findings.js';
import {
    matchesScrollRevealAttribute,
    matchesScrollRevealScriptSrc,
} from './scroll-reveal-libraries.js';

const ALLOWED_SCRIPT_TYPES = new Set([
    'application/ld+json',
    'importmap',
    'speculationrules',
]);

function isExecutableScriptType(typeAttr: string | undefined): boolean {
    if (!typeAttr) return true;
    const trimmed = typeAttr.trim().toLowerCase();
    if (ALLOWED_SCRIPT_TYPES.has(trimmed)) return false;
    if (trimmed.startsWith('application/jay-')) return false;
    return true;
}

function attributeBindingsResolveToContractTag(
    value: string,
    scope: Parameters<typeof resolveBinding>[1],
): boolean {
    try {
        const parts = parseTemplateParts(value);
        for (const part of parts) {
            if (part.kind !== 'binding') continue;
            for (const path of bindingPathsFromExpression(part.value)) {
                const resolved = resolveBinding(path, scope);
                if (resolved.tag) return true;
            }
        }
    } catch {
        return false;
    }
    return false;
}

function isJavascriptUrl(value: string | undefined): boolean {
    if (!value) return false;
    return value.trim().toLowerCase().startsWith('javascript:');
}

export function runTemplateRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];

    walkElements(ctx.body, ctx, (el, scope) => {
        const tag: string | undefined = el.rawTagName?.toLowerCase();
        if (!tag) return;

        if (tag === 'script') {
            const typeAttr = el.getAttribute?.('type');
            const src = el.getAttribute?.('src');
            if (isExecutableScriptType(typeAttr) && (src || el.textContent?.trim())) {
                findings.push(
                    cssFirstWarning(
                        'allow-executable-script',
                        'Executable <script> in the page body — move behavior to CSS or the component script',
                        'Use transitions, native elements, or component refs instead of inline scripts',
                    ),
                );
            }
            if (src && matchesScrollRevealScriptSrc(src)) {
                findings.push(
                    cssFirstWarning(
                        'allow-scroll-reveal-library',
                        `Scroll-reveal library script "${src}" — CSS can animate on scroll`,
                        'Prefer @keyframes with animation-timeline: view() and an @supports fallback',
                    ),
                );
            }
        }

        if (tag === 'img') {
            if (el.getAttribute?.('data-src') || el.getAttribute?.('data-srcset')) {
                findings.push(
                    cssFirstWarning(
                        'allow-js-lazy-load',
                        '<img> uses data-src lazy-loading — native loading="lazy" is sufficient',
                        'Add loading="lazy" and remove the data-src pattern',
                    ),
                );
            }
        }

        const attrs: Record<string, string> = el.attributes ?? {};
        for (const [attrName] of Object.entries(attrs)) {
            const lower = attrName.toLowerCase();
            if (matchesScrollRevealAttribute(lower)) {
                findings.push(
                    cssFirstWarning(
                        'allow-scroll-reveal-library',
                        `Scroll-reveal attribute ${lower} — CSS view() animations can replace this library`,
                        'Use @keyframes + animation-timeline: view()',
                    ),
                );
            }
        }

        if (isCustomDialogElement(el)) {
            findings.push(
                cssFirstWarning(
                    'allow-custom-dialog',
                    'Custom dialog markup — prefer native <dialog>',
                    'Use <dialog> with commandfor / command="show-modal" where supported',
                ),
            );
        }

        if (tag === 'div' || tag === 'button') {
            const role = el.getAttribute?.('role')?.toLowerCase();
            if (role === 'switch') {
                findings.push(
                    cssFirstWarning(
                        'allow-div-switch',
                        `<${tag} role="switch"> — use <input type="checkbox" role="switch"> in a <label>`,
                        'See UI Kit toggle-switch.md',
                    ),
                );
            }
        }

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
                            `${lowerName} uses a javascript: URL`,
                            'Use <button type="button">, popovertarget, or <details>. If you still need custom behavior, use a ref in the component script instead of a javascript: URL',
                        ),
                    );
                }
            }

            if (lowerName.startsWith('on') && attrValue) {
                if (attributeBindingsResolveToContractTag(attrValue, scope)) {
                    findings.push(
                        cssFirstError(
                            'bound-inline-event-handler',
                            `Bound inline event handler ${lowerName} interpolates ViewState into executable markup`,
                            'Move the handler to a ref in the component script',
                        ),
                    );
                } else {
                    findings.push(
                        cssFirstWarning(
                            'allow-inline-event-handlers',
                            `Inline event handler ${lowerName} on <${tag}>`,
                            'Use CSS for presentation and ref handlers for application logic',
                        ),
                    );
                }
            }
        }
    });

    return findings;
}

function isCustomDialogElement(el: {
    rawTagName?: string;
    getAttribute?: (n: string) => string;
}): boolean {
    const tag = el.rawTagName?.toLowerCase();
    if (tag === 'dialog') return false;
    const role = el.getAttribute?.('role')?.toLowerCase();
    if (role === 'dialog' || role === 'alertdialog') return true;
    const ariaModal = el.getAttribute?.('aria-modal')?.toLowerCase();
    return ariaModal === 'true';
}
