import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements } from '@jay-framework/compiler-shared';

const INTERACTIVE_ELEMENTS = new Set([
    'a',
    'button',
    'input',
    'select',
    'textarea',
]);

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
]);

export const validate: JayHtmlValidatorFn = (ctx) => {
    const findings: JayHtmlValidationFinding[] = [];
    const labelForIds = new Set<string>();

    collectLabelForIds(ctx.body, labelForIds);

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
            if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') {
                return;
            }
            if (!LABELABLE_INPUTS.has(type)) return;
            checkLabel(el, tag, findings, labelForIds);
        }
        if (tag === 'select' || tag === 'textarea') {
            checkLabel(el, tag, findings, labelForIds);
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

    return findings;
};

function checkLabel(
    el: any,
    tag: string,
    findings: JayHtmlValidationFinding[],
    labelForIds: Set<string>,
): void {
    const id = el.getAttribute?.('id');
    const ariaLabel = el.getAttribute?.('aria-label');
    const ariaLabelledBy = el.getAttribute?.('aria-labelledby');

    if (ariaLabel || ariaLabelledBy) return;
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

function collectLabelForIds(el: any, ids: Set<string>): void {
    if (el.rawTagName?.toLowerCase() === 'label') {
        const forId = el.getAttribute?.('for');
        if (forId) ids.add(forId);
    }
    for (const child of el.childNodes ?? []) {
        if (child.nodeType === 1) collectLabelForIds(child, ids);
    }
}
