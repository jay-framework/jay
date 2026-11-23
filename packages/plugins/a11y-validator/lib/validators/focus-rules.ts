import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import { collectCssSources, locationPrefix } from '../css/css-sources.js';
import {
    flattenAll,
    lastDeclaration,
    parseInlineStyle,
    type CssDeclaration,
    type FlatRule,
} from '../css/flat-rules.js';
import {
    compoundKey,
    hasAnyPseudo,
    hasNegatedPseudo,
    hasPseudo,
    lastCompound,
    type Compound,
} from '../css/selectors.js';
import {
    allElements,
    hasAncestor,
    hasAttribute,
    isDynamicAttribute,
    staticAttribute,
    tagOf,
} from '../dom.js';

/**
 * DL#239 — keyboard focus, inert and dialogs. Five warnings; each is suppressible per page with
 * `a11y: { allow-<rule-id>: true }` in `<script type="application/jay-validations">`.
 */

export const FOCUS_GUIDE = '\nSee: agent-kit/designer/focus-and-dialogs.md';

type Report = (rule: string, finding: Omit<JayHtmlValidationFinding, 'severity'>) => void;

export function checkFocusAndDialogs(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    const report: Report = (rule, finding) => {
        if (ctx.validationOverrides?.a11y?.[`allow-${rule}`] === true) return;
        findings.push({
            severity: 'warning',
            ...finding,
            suggestion: `${finding.suggestion} Suppress with a11y: { allow-${rule}: true }.${FOCUS_GUIDE}`,
        });
    };
    const elements = allElements(ctx.body);
    checkCustomModals(elements, report);
    checkDialogNames(elements, report);
    checkAutofocus(elements, report);
    checkInlineOutline(elements, report);
    const rules = flattenAll(collectCssSources(ctx));
    checkOutlineWithoutFocusVisible(rules, report);
    checkOutlineNoneUnconditional(rules, report);
    return findings;
}

// --- custom-modal ---------------------------------------------------------------------------

const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);

function checkCustomModals(elements: any[], report: Report): void {
    for (const el of elements) {
        const tag = tagOf(el);
        if (tag === 'dialog') continue;
        const ariaModal = staticAttribute(el, 'aria-modal')?.toLowerCase();
        const role = staticAttribute(el, 'role')?.toLowerCase();
        const hasModalFlag = ariaModal === 'true';
        const hasDialogRole = role !== undefined && DIALOG_ROLES.has(role);
        if (!hasModalFlag && !hasDialogRole) continue;
        const attr = hasModalFlag ? 'aria-modal="true"' : `role="${role}"`;
        const isModal = hasModalFlag || role === 'alertdialog';
        report('custom-modal', {
            message: isModal
                ? `<${tag} ${attr}> is a hand-rolled modal. Use <dialog> + showModal() for focus containment, Escape and an inert background.`
                : `<${tag} ${attr}> is a hand-rolled dialog. Use <dialog> + show(), or the popover attribute.`,
            suggestion: isModal
                ? 'Replace the element with <dialog aria-labelledby="…"> and open it with showModal() through a ref.'
                : 'Replace the element with <dialog> opened by show(), or use the popover attribute for a non-modal layer.',
            element: `<${tag}>`,
            attribute: hasModalFlag ? 'aria-modal' : 'role',
        });
    }
}

// --- dialog-name ----------------------------------------------------------------------------

function checkDialogNames(elements: any[], report: Report): void {
    for (const el of elements) {
        if (tagOf(el) !== 'dialog') continue;
        if (hasAttribute(el, 'aria-label') || hasAttribute(el, 'aria-labelledby')) continue;
        report('dialog-name', {
            message:
                '<dialog> has no accessible name. Add aria-labelledby pointing at its heading.',
            suggestion:
                'A heading inside a <dialog> does not name it. Give the heading an id and add aria-labelledby="<id>" to the <dialog>.',
            element: '<dialog>',
        });
    }
}

// --- autofocus-outside-dialog ---------------------------------------------------------------

function isFormElement(el: any): boolean {
    const tag = tagOf(el);
    if (tag === 'input') return (staticAttribute(el, 'type') ?? '').toLowerCase() !== 'hidden';
    return tag === 'select' || tag === 'textarea' || tag === 'button';
}

function isDialogOrPopover(el: any): boolean {
    return tagOf(el) === 'dialog' || hasAttribute(el, 'popover');
}

function checkAutofocus(elements: any[], report: Report): void {
    const counted = elements.filter(
        (el) =>
            hasAttribute(el, 'autofocus') &&
            !isDynamicAttribute(el, 'autofocus') &&
            !hasAncestor(el, isDialogOrPopover),
    );
    for (const el of counted) {
        if (counted.length === 1 && isFormElement(el)) continue;
        report('autofocus-outside-dialog', {
            message:
                'autofocus outside a dialog moves focus on page load and skips content for screen-reader users.',
            suggestion:
                'Remove autofocus, or keep a single autofocus on the form field the page exists for. Inside a <dialog> or [popover] it applies when the layer opens.',
            element: `<${tagOf(el)}>`,
            attribute: 'autofocus',
        });
    }
}

// --- outline-none-unconditional (b): inline style ------------------------------------------

function isFocusableByDefault(el: any): boolean {
    const tag = tagOf(el);
    if (hasAttribute(el, 'tabindex')) return true;
    if (tag === 'a') return hasAttribute(el, 'href');
    return isFormElement(el);
}

function checkInlineOutline(elements: any[], report: Report): void {
    for (const el of elements) {
        const style = staticAttribute(el, 'style');
        if (!style || !isFocusableByDefault(el)) continue;
        const rule = { declarations: parseInlineStyle(style) } as FlatRule;
        if (!removesOutline(rule)) continue;
        const tag = tagOf(el);
        report('outline-none-unconditional', {
            message: `<${tag} style="${style}"> removes the focus outline. Move the style to CSS and add a :focus-visible outline.`,
            suggestion:
                'An inline style cannot be overridden by a :focus-visible rule. Remove it and style :focus-visible in CSS.',
            element: `<${tag}>`,
            attribute: 'style',
        });
    }
}

// --- CSS declaration predicates --------------------------------------------------------------

const OUTLINE_PROPERTIES = ['outline', 'outline-style'];

function isNoneOrZero(value: string): boolean {
    const normalized = value
        .replace(/!important/i, '')
        .trim()
        .toLowerCase();
    return normalized === '0' || normalized.split(/\s+/).includes('none');
}

function removingOutline(rule: FlatRule): CssDeclaration | undefined {
    const decl = lastDeclaration(rule, OUTLINE_PROPERTIES);
    return decl && isNoneOrZero(decl.value) ? decl : undefined;
}

function removesOutline(rule: FlatRule): boolean {
    return removingOutline(rule) !== undefined;
}

function hasBoxShadow(rule: FlatRule): boolean {
    const decl = lastDeclaration(rule, ['box-shadow']);
    return decl !== undefined && !isNoneOrZero(decl.value);
}

function hasVisibleIndicator(rule: FlatRule): boolean {
    const outline = lastDeclaration(rule, OUTLINE_PROPERTIES);
    return (outline !== undefined && !isNoneOrZero(outline.value)) || hasBoxShadow(rule);
}

const INVISIBLE_BORDER = /^(none|hidden|0)$/i;

function hasVisibleBorder(rule: FlatRule): boolean {
    const isVisible = (property: string) => {
        const decl = lastDeclaration(rule, [property]);
        return decl !== undefined && !INVISIBLE_BORDER.test(decl.value.trim());
    };
    if (isVisible('border') || isVisible('border-width') || isVisible('border-style')) return true;
    return lastDeclaration(rule, ['border-color']) !== undefined && !removesBorder(rule);
}

function removesBorder(rule: FlatRule): boolean {
    const border = lastDeclaration(rule, ['border']);
    const width = lastDeclaration(rule, ['border-width']);
    return (
        (border !== undefined && INVISIBLE_BORDER.test(border.value.trim())) ||
        (width !== undefined && width.value.trim() === '0')
    );
}

// --- :focus-visible replacements -------------------------------------------------------------

/** Keys of compounds that get a visible `:focus-visible` indicator somewhere in the page CSS. */
function focusVisibleKeys(rules: FlatRule[]): Set<string> {
    const keys = new Set<string>();
    for (const rule of rules) {
        if (!hasVisibleIndicator(rule)) continue;
        for (const selector of rule.selectors) {
            const compound = lastCompound(selector);
            if (compound && hasPseudo(compound, ':focus-visible')) {
                keys.add(compoundKey(compound, ':focus-visible'));
            }
        }
    }
    return keys;
}

function hasReplacement(keys: Set<string>, key: string): boolean {
    return keys.has(key) || keys.has('*');
}

// --- outline-without-focus-visible ----------------------------------------------------------

function isOffendingFocusCompound(compound: Compound): boolean {
    return hasPseudo(compound, ':focus') && !hasNegatedPseudo(compound, ':focus-visible');
}

function checkOutlineWithoutFocusVisible(rules: FlatRule[], report: Report): void {
    const replacements = focusVisibleKeys(rules);
    for (const rule of rules) {
        if (!removesOutline(rule) || hasBoxShadow(rule) || hasVisibleBorder(rule)) continue;
        for (const selector of rule.selectors) {
            const compound = lastCompound(selector);
            if (!compound || !isOffendingFocusCompound(compound)) continue;
            if (hasReplacement(replacements, compoundKey(compound, ':focus'))) continue;
            report('outline-without-focus-visible', {
                message: `${locationPrefix(rule.source, rule.line)} ${selector} removes the focus outline with no :focus-visible replacement. Keyboard users lose track of focus.`,
                suggestion: `Use ${selector.replace(/:focus\b(?!-)/, ':focus:not(:focus-visible)')} to hide the ring only for pointer focus, or add a matching :focus-visible rule with an outline of at least 3:1 contrast.`,
            });
        }
    }
}

// --- outline-none-unconditional (a): CSS ----------------------------------------------------

const ANCHOR_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);

/** Exactly one anchor (focusable tag, `[tabindex]` or `*`), no other tag, no pseudo-class. */
function isAnchoredCompound(compound: Compound): boolean {
    if (hasAnyPseudo(compound)) return false;
    let anchors = 0;
    for (const node of compound) {
        if (node.type === 'tag') {
            if (!ANCHOR_TAGS.has(node.value.toLowerCase())) return false;
            anchors++;
        } else if (node.type === 'universal') {
            anchors++;
        } else if (node.type === 'attribute' && node.attribute.toLowerCase() === 'tabindex') {
            anchors++;
        }
    }
    return anchors === 1;
}

function checkOutlineNoneUnconditional(rules: FlatRule[], report: Report): void {
    const replacements = focusVisibleKeys(rules);
    for (const rule of rules) {
        const decl = removingOutline(rule);
        if (!decl || rule.selectors.some((s) => /:focus/.test(s))) continue;
        for (const selector of rule.selectors) {
            const compound = lastCompound(selector);
            if (!compound || !isAnchoredCompound(compound)) continue;
            if (hasReplacement(replacements, compoundKey(compound))) continue;
            report('outline-none-unconditional', {
                message: `${locationPrefix(rule.source, rule.line)} ${selector} { ${decl.property}: ${decl.value} } removes focus outlines everywhere.`,
                suggestion: `Remove the declaration, or scope it to ${selector}:focus:not(:focus-visible) and keep a visible :focus-visible outline.`,
            });
        }
    }
}
