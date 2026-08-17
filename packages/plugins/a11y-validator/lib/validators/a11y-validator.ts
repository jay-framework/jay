import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

const INTERACTIVE_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'textarea']);

const NON_INTERACTIVE_ELEMENTS = new Set([
    'div',
    'span',
    'p',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'nav',
    'aside',
    'li',
    'ul',
    'ol',
]);

const VALID_ARIA_ROLES = new Set([
    'alert',
    'alertdialog',
    'application',
    'article',
    'banner',
    'button',
    'cell',
    'checkbox',
    'columnheader',
    'combobox',
    'complementary',
    'contentinfo',
    'definition',
    'dialog',
    'directory',
    'document',
    'feed',
    'figure',
    'form',
    'grid',
    'gridcell',
    'group',
    'heading',
    'img',
    'link',
    'list',
    'listbox',
    'listitem',
    'log',
    'main',
    'marquee',
    'math',
    'menu',
    'menubar',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'meter',
    'navigation',
    'none',
    'note',
    'option',
    'presentation',
    'progressbar',
    'radio',
    'radiogroup',
    'region',
    'row',
    'rowgroup',
    'rowheader',
    'scrollbar',
    'search',
    'searchbox',
    'separator',
    'slider',
    'spinbutton',
    'status',
    'switch',
    'tab',
    'table',
    'tablist',
    'tabpanel',
    'term',
    'textbox',
    'timer',
    'toolbar',
    'tooltip',
    'tree',
    'treegrid',
    'treeitem',
]);

const LABELABLE_INPUTS = new Set([
    'text',
    'password',
    'email',
    'tel',
    'url',
    'number',
    'search',
    'date',
    'time',
    'datetime-local',
    'month',
    'week',
    'color',
    'file',
    'range',
    'checkbox',
    'radio',
]);

const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset']);

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];
    const labelForIds = new Set<string>();
    const allIds = new Set<string>();
    const idCounts = new Map<string, number>();

    collectDomIndex(ctx.body, labelForIds, allIds, idCounts);

    for (const [id, count] of idCounts) {
        if (count > 1) {
            findings.push({
                severity: 'error',
                message: `Duplicate id="${id}" used ${count} times (WCAG 4.1.1)`,
                suggestion:
                    'Give each element a unique id. Duplicate ids break label associations and ARIA references.',
                attribute: 'id',
            });
        }
    }

    checkLabelsStructure(ctx.body, allIds, findings);

    walkElements(ctx.body, ctx, (el) => {
        const tag: string | undefined = el.rawTagName?.toLowerCase();
        if (!tag) return;

        // --- Rule: img must have alt ---
        if (tag === 'img') {
            const alt = el.getAttribute?.('alt');
            if (alt === undefined || alt === null) {
                findings.push({
                    severity: 'error',
                    message: 'Image missing alt attribute (WCAG 1.1.1)',
                    suggestion:
                        'Add an alt attribute. Use descriptive text for informative images, ' +
                        'or alt="" for purely decorative images.',
                    element: '<img>',
                    attribute: 'alt',
                });
            }
        }

        // --- Rule: input/select/textarea must have label ---
        if (tag === 'input') {
            const type = (el.getAttribute?.('type') || 'text').toLowerCase();
            if (IGNORED_INPUT_TYPES.has(type)) {
                return;
            }
            if (!LABELABLE_INPUTS.has(type)) return;
            checkLabel(el, tag, findings, labelForIds, allIds);
        }
        if (tag === 'select' || tag === 'textarea') {
            checkLabel(el, tag, findings, labelForIds, allIds);
        }

        // --- Rule: button must have accessible name ---
        if (tag === 'button') {
            const text = el.textContent?.trim();
            const ariaLabel = el.getAttribute?.('aria-label');
            const ariaLabelledBy = el.getAttribute?.('aria-labelledby');
            const hasImg = el.querySelector?.('img[alt]');
            if (!text && !ariaLabel && !ariaLabelledBy && !hasImg) {
                findings.push({
                    severity: 'error',
                    message: 'Button has no accessible name (WCAG 4.1.2)',
                    suggestion:
                        'Add text content, an aria-label, or an aria-labelledby attribute to the button.',
                    element: '<button>',
                });
            }
        }

        // --- Rule: interactive elements must not use positive tabindex ---
        if (INTERACTIVE_ELEMENTS.has(tag) || el.getAttribute?.('role')) {
            const tabindex = el.getAttribute?.('tabindex');
            if (tabindex !== undefined && tabindex !== null) {
                const val = parseInt(tabindex, 10);
                if (!isNaN(val) && val > 0) {
                    findings.push({
                        severity: 'warning',
                        message: `Positive tabindex="${tabindex}" disrupts natural tab order (WCAG 2.4.3)`,
                        suggestion:
                            'Use tabindex="0" to add to natural tab order, or tabindex="-1" for programmatic focus. ' +
                            'Avoid positive values — they override the DOM order and confuse keyboard users.',
                        element: `<${tag}>`,
                        attribute: 'tabindex',
                    });
                }
            }
        }

        // --- Rule: no autoplay on media ---
        if (tag === 'video' || tag === 'audio') {
            const autoplay = el.getAttribute?.('autoplay');
            if (autoplay !== undefined && autoplay !== null) {
                const muted = el.getAttribute?.('muted');
                if (muted === undefined || muted === null) {
                    findings.push({
                        severity: 'error',
                        message: `<${tag}> has autoplay without muted (WCAG 1.4.2)`,
                        suggestion:
                            `Add the muted attribute to <${tag} autoplay>, or remove autoplay. ` +
                            'Autoplaying audio is disruptive to screen reader users.',
                        element: `<${tag}>`,
                        attribute: 'autoplay',
                    });
                }
            }
        }

        // --- Rule: invalid ARIA role ---
        const role = el.getAttribute?.('role');
        if (role !== undefined && role !== null) {
            if (!VALID_ARIA_ROLES.has(role)) {
                findings.push({
                    severity: 'error',
                    message: `Invalid ARIA role="${role}" (WCAG 4.1.2)`,
                    suggestion:
                        `"${role}" is not a valid WAI-ARIA role. ` +
                        'Use a valid role such as "button", "link", "navigation", "dialog", etc.',
                    element: `<${tag}>`,
                    attribute: 'role',
                });
            }
        }

        // --- Rule: non-interactive element made focusable without role ---
        if (NON_INTERACTIVE_ELEMENTS.has(tag)) {
            const tabindex = el.getAttribute?.('tabindex');
            if (tabindex !== undefined && tabindex !== null) {
                const val = parseInt(tabindex, 10);
                if (!isNaN(val) && val >= 0 && !role) {
                    findings.push({
                        severity: 'warning',
                        message: `<${tag}> is focusable via tabindex but has no role (WCAG 4.1.2)`,
                        suggestion:
                            `Add a role attribute to indicate the element's purpose to screen readers. ` +
                            'Example: <div tabindex="0" role="button"> or <span tabindex="0" role="link">.',
                        element: `<${tag}>`,
                        attribute: 'role',
                    });
                }
            }
        }
    });

    // --- Rule: adjacent elements with duplicate text content ---
    checkDuplicateAdjacentText(ctx.body, findings);

    // --- Head metadata checks ---
    if (ctx.head) {
        const viewport = ctx.head.meta.find((m) => m.name?.toLowerCase() === 'viewport');
        if (viewport) {
            const content = viewport.content
                .map((p) => p.value)
                .join('')
                .toLowerCase();
            if (/user-scalable\s*=\s*no/.test(content)) {
                findings.push({
                    severity: 'error',
                    message: 'Viewport meta disables user scaling (WCAG 1.4.4)',
                    suggestion:
                        'Remove user-scalable=no from the viewport meta tag. ' +
                        'Users must be able to zoom to at least 200%.',
                    element: '<meta>',
                    attribute: 'content',
                });
            }
            const maxScaleMatch = content.match(/maximum-scale\s*=\s*([\d.]+)/);
            if (maxScaleMatch && parseFloat(maxScaleMatch[1]) < 2) {
                findings.push({
                    severity: 'error',
                    message: `Viewport meta restricts zoom to ${maxScaleMatch[1]}x (WCAG 1.4.4)`,
                    suggestion:
                        'Set maximum-scale to at least 2, or remove it entirely. ' +
                        'Users must be able to zoom to at least 200%.',
                    element: '<meta>',
                    attribute: 'content',
                });
            }
        }
    }

    return findings;
};

function checkLabel(
    el: any,
    tag: string,
    findings: JayHtmlValidationFinding[],
    labelForIds: Set<string>,
    allIds: Set<string>,
): void {
    const id = el.getAttribute?.('id');
    const ariaLabel = el.getAttribute?.('aria-label');
    const ariaLabelledBy = el.getAttribute?.('aria-labelledby');

    let hasAccessibleName = false;

    if (ariaLabel !== undefined && ariaLabel !== null) {
        if (!String(ariaLabel).trim()) {
            findings.push({
                severity: 'error',
                message: `<${tag}> has empty aria-label (WCAG 4.1.2)`,
                suggestion:
                    'Provide a non-empty aria-label, use aria-labelledby with an existing id, ' +
                    'or associate a <label>.',
                element: `<${tag}>`,
                attribute: 'aria-label',
            });
        } else {
            hasAccessibleName = true;
        }
    }

    if (ariaLabelledBy !== undefined && ariaLabelledBy !== null) {
        const tokens = String(ariaLabelledBy).trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
            findings.push({
                severity: 'error',
                message: `<${tag}> has empty aria-labelledby (WCAG 4.1.2)`,
                suggestion:
                    'Set aria-labelledby to one or more element ids that exist in this file, ' +
                    'or use a non-empty aria-label / <label>.',
                element: `<${tag}>`,
                attribute: 'aria-labelledby',
            });
        } else {
            const missing = tokens.filter((token) => !allIds.has(token));
            if (missing.length > 0) {
                findings.push({
                    severity: 'error',
                    message: `<${tag}> aria-labelledby references missing id(s): ${missing.join(', ')} (WCAG 1.3.1)`,
                    suggestion:
                        `Add element(s) with id="${missing[0]}" (or fix the aria-labelledby tokens), ` +
                        'or use a <label for="..."> / non-empty aria-label instead.',
                    element: `<${tag}>`,
                    attribute: 'aria-labelledby',
                });
            } else {
                hasAccessibleName = true;
            }
        }
    }

    if (hasAccessibleName) return;
    if (id && labelForIds.has(id)) return;

    // Check if wrapped in a <label>
    let parent = el.parentNode;
    while (parent) {
        if (parent.rawTagName?.toLowerCase() === 'label') return;
        parent = parent.parentNode;
    }

    findings.push({
        severity: 'error',
        message: `<${tag}> has no associated label (WCAG 1.3.1)`,
        suggestion:
            `Add a <label for="${id || 'inputId'}"> that references this ${tag}'s id, ` +
            `wrap it in a <label>, or add an aria-label attribute.`,
        element: `<${tag}>`,
        attribute: 'id',
    });
}

function collectDomIndex(
    el: any,
    labelForIds: Set<string>,
    allIds: Set<string>,
    idCounts: Map<string, number>,
): void {
    const id = el.getAttribute?.('id');
    if (id) {
        allIds.add(id);
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    if (el.rawTagName?.toLowerCase() === 'label') {
        const forId = el.getAttribute?.('for');
        if (forId) labelForIds.add(forId);
    }

    for (const child of el.childNodes ?? []) {
        if (child.nodeType === 1) collectDomIndex(child, labelForIds, allIds, idCounts);
    }
}

function isLabelableControl(el: any): boolean {
    const tag = el.rawTagName?.toLowerCase();
    if (tag === 'select' || tag === 'textarea') return true;
    if (tag !== 'input') return false;
    const type = (el.getAttribute?.('type') || 'text').toLowerCase();
    if (IGNORED_INPUT_TYPES.has(type)) return false;
    return LABELABLE_INPUTS.has(type);
}

function countLabelableDescendants(el: any): number {
    let count = 0;
    for (const child of el.childNodes ?? []) {
        if (child.nodeType !== 1) continue;
        if (isLabelableControl(child)) count += 1;
        count += countLabelableDescendants(child);
    }
    return count;
}

function checkLabelsStructure(
    root: any,
    allIds: Set<string>,
    findings: JayHtmlValidationFinding[],
): void {
    function walk(el: any): void {
        if (el.rawTagName?.toLowerCase() === 'label') {
            const forId = el.getAttribute?.('for');
            if (forId && !allIds.has(forId)) {
                findings.push({
                    severity: 'warning',
                    message: `<label for="${forId}"> has no matching id in this file (WCAG 1.3.1)`,
                    suggestion: `Add id="${forId}" to the related form control, or fix the for attribute.`,
                    element: '<label>',
                    attribute: 'for',
                });
            }

            const controlCount = countLabelableDescendants(el);
            if (controlCount > 1) {
                findings.push({
                    severity: 'warning',
                    message: `<label> contains ${controlCount} form controls — screen readers only associate the first (WCAG 1.3.1)`,
                    suggestion:
                        'Use a separate <label for="id"> for each input (or one wrapping label per control). ' +
                        'multiple form controls inside one label is not reliable.',
                    element: '<label>',
                });
            }
        }

        for (const child of el.childNodes ?? []) {
            if (child.nodeType === 1) walk(child);
        }
    }
    walk(root);
}

function getVisibleText(el: any): string {
    if (el.getAttribute?.('aria-hidden') === 'true') return '';
    return (el.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function checkDuplicateAdjacentText(root: any, findings: JayHtmlValidationFinding[]): void {
    function walk(el: any): void {
        const children = (el.childNodes ?? []).filter((n: any) => n.nodeType === 1);
        for (let i = 0; i < children.length - 1; i++) {
            const current = children[i];
            const next = children[i + 1];
            const currentText = getVisibleText(current);
            const nextText = getVisibleText(next);

            if (
                currentText &&
                nextText &&
                currentText === nextText &&
                current.getAttribute?.('aria-hidden') !== 'true' &&
                next.getAttribute?.('aria-hidden') !== 'true'
            ) {
                const tag = next.rawTagName?.toLowerCase() || 'element';
                findings.push({
                    severity: 'warning',
                    message: `Adjacent <${current.rawTagName?.toLowerCase()}> and <${tag}> have identical text "${currentText.slice(0, 40)}${currentText.length > 40 ? '...' : ''}" — screen readers will announce it twice`,
                    suggestion:
                        'Add aria-hidden="true" to the decorative duplicate. ' +
                        'If both are meaningful, differentiate their text content.',
                    element: `<${tag}>`,
                });
            }
        }
        for (const child of children) {
            walk(child);
        }
    }
    walk(root);
}
