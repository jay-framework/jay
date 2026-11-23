import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import { allElements, hasAncestor, hasAttribute, staticAttribute, tagOf } from '../dom.js';
import { autocompleteTypoFix, isValidAutocomplete, tokensOf } from './autocomplete.js';
import { describeElement, hasAccessibleName, makeFormIndex, type FormIndex } from './form-index.js';

/**
 * DL#240 — form hints, autocomplete and error association (R1–R9, DOM). Every message starts with
 * `[a11y/<rule-id>]` and every suggestion names the forms guide; suppression is `a11y: { allow-<rule-id>: true }`.
 */

export const FORMS_GUIDE = '\nSee: agent-kit/designer/forms-and-autofill.md';

export interface FormFindingSpec {
    rule: string;
    severity: JayHtmlValidationFinding['severity'];
    message: string;
    fix: string;
    element?: string;
    attribute?: string;
}

export function formFinding(spec: FormFindingSpec): JayHtmlValidationFinding {
    const finding: JayHtmlValidationFinding = {
        severity: spec.severity,
        message: `[a11y/${spec.rule}] ${spec.message}`,
        suggestion:
            `${spec.fix} Suppress with a11y: { allow-${spec.rule}: true } in <script type="application/jay-validations">.` +
            FORMS_GUIDE,
    };
    if (spec.element) finding.element = spec.element;
    if (spec.attribute) finding.attribute = spec.attribute;
    return finding;
}

export function isFormRuleSuppressed(ctx: JayHtmlValidationContext, rule: string): boolean {
    return ctx.validationOverrides?.a11y?.[`allow-${rule}`] === true;
}

type Report = (spec: FormFindingSpec) => void;

export function checkFormRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    const report: Report = (spec) => {
        if (!isFormRuleSuppressed(ctx, spec.rule)) findings.push(formFinding(spec));
    };
    const index = makeFormIndex(ctx.body);
    checkPlaceholderFormatHints(index, report);
    checkDescribedByIds(index, report);
    checkHintsBelowFields(index, report);
    checkAutocompleteValues(index, report);
    const usernameField = checkUsernameAutocomplete(index, report);
    checkMissingAutocomplete(index, report, usernameField);
    checkPasswordAutocomplete(index, report);
    checkErrorAssociation(index, report);
    return findings;
}

// --- R1 placeholder-as-label (called from the label rule, which it replaces) -----------------

/** The R1 finding for an unlabelled control with a static placeholder, or undefined. */
export function placeholderAsLabelFinding(
    el: any,
    body: any,
): JayHtmlValidationFinding | undefined {
    const placeholder = staticAttribute(el, 'placeholder');
    if (!placeholder) return undefined;
    const index = makeFormIndex(body);
    return formFinding({
        rule: 'placeholder-as-label',
        severity: 'error',
        message: `${describeElement(el, index, { usePlaceholder: false })} with placeholder "${placeholder}" has no label — the placeholder disappears on typing and is not a reliable name (WCAG 1.3.1, 3.3.2)`,
        fix: 'Add a <label for> (or aria-label) and keep the placeholder only as an optional example.',
        element: `<${tagOf(el)}>`,
        attribute: 'placeholder',
    });
}

// --- shared control classification ------------------------------------------------------------

const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const TEXT_ENTRY_TYPES = new Set([
    'text',
    'email',
    'tel',
    'password',
    'url',
    'search',
    'number',
    'date',
    'datetime-local',
    'month',
    'week',
    'time',
]);

export function inputType(el: any): string {
    return (staticAttribute(el, 'type') ?? 'text').toLowerCase() || 'text';
}

function isTextEntry(el: any): boolean {
    const tag = tagOf(el);
    if (tag === 'textarea') return true;
    return tag === 'input' && TEXT_ENTRY_TYPES.has(inputType(el));
}

/** R9's notion of a form control: text entry, select, textarea, checkbox, radio. */
function isFormControl(el: any): boolean {
    const tag = tagOf(el);
    if (tag === 'select' || isTextEntry(el)) return true;
    return tag === 'input' && ['checkbox', 'radio'].includes(inputType(el));
}

function isSkippedInput(el: any): boolean {
    return tagOf(el) === 'input' && SKIPPED_INPUT_TYPES.has(inputType(el));
}

// --- R2 placeholder-format-hint --------------------------------------------------------------

const CASE_SENSITIVE_HINTS = [/\bMM\b/, /\bDD\b/, /\bYY\b/, /\bYYYY\b/];
const CASE_INSENSITIVE_HINTS = [
    /\be\.g\./i,
    /\bformat\b/i,
    /\bat least\b/i,
    /\bmust\b/i,
    /\bcharacters?\b/i,
    /###/,
    /\d{2,}[-/]\d/,
];

export function looksLikeFormatHint(placeholder: string): boolean {
    return [...CASE_SENSITIVE_HINTS, ...CASE_INSENSITIVE_HINTS].some((pattern) =>
        pattern.test(placeholder),
    );
}

function checkPlaceholderFormatHints(index: FormIndex, report: Report): void {
    for (const el of index.elements) {
        if (!isTextEntry(el) || hasAttribute(el, 'aria-describedby')) continue;
        const placeholder = staticAttribute(el, 'placeholder');
        if (!placeholder || !looksLikeFormatHint(placeholder) || !hasAccessibleName(el, index))
            continue;
        report({
            rule: 'placeholder-format-hint',
            severity: 'warning',
            message: `${describeElement(el, index, { usePlaceholder: false })} puts a format or rule hint in its placeholder "${placeholder}" — it disappears on typing (WCAG 3.3.2)`,
            fix: 'Move the hint into an element above the field and link it with aria-describedby.',
            element: `<${tagOf(el)}>`,
            attribute: 'placeholder',
        });
    }
}

// --- R3 describedby-missing-id ---------------------------------------------------------------

function isInsideForEach(el: any): boolean {
    return hasAncestor(el, (a) => hasAttribute(a, 'forEach'));
}

function checkDescribedByIds(index: FormIndex, report: Report): void {
    for (const el of index.elements) {
        const describedBy = staticAttribute(el, 'aria-describedby');
        if (describedBy === undefined || isInsideForEach(el)) continue;
        for (const token of tokensOf(describedBy)) {
            if (index.staticIds.has(token)) continue;
            report({
                rule: 'describedby-missing-id',
                severity: 'error',
                message: `${describeElement(el, index)} has aria-describedby "${token}" but no element with id "${token}" exists in this file (WCAG 1.3.1)`,
                fix: `Add id="${token}" to the hint or error element, or remove the token.`,
                element: `<${tagOf(el)}>`,
                attribute: 'aria-describedby',
            });
        }
    }
}

// --- R4 hint-below-field ---------------------------------------------------------------------

function isConditional(el: any): boolean {
    return Object.keys(el?.attributes ?? {}).some(
        (name) => name === 'if' || name.startsWith('when-'),
    );
}

function lowestCommonAncestor(a: any, b: any): any {
    const ancestorsOfA = new Set<any>();
    for (let node = a; node; node = node.parentNode) ancestorsOfA.add(node);
    for (let node = b; node; node = node.parentNode) if (ancestorsOfA.has(node)) return node;
    return undefined;
}

function isErrorLike(target: any, control: any, index: FormIndex): boolean {
    const lca = lowestCommonAncestor(target, control);
    for (let node = target; node && node !== lca; node = node.parentNode) {
        if (isConditional(node)) return true;
    }
    const naming = `${staticAttribute(target, 'class') ?? ''} ${staticAttribute(target, 'id') ?? ''}`;
    if (/error|invalid/i.test(naming)) return true;
    if ((target.text ?? '').includes('{')) return true;
    const role = staticAttribute(target, 'role')?.toLowerCase();
    if (role === 'alert' || role === 'status' || hasAttribute(target, 'aria-live')) return true;
    return index.errorMessageIds.has(staticAttribute(target, 'id') ?? '');
}

function checkHintsBelowFields(index: FormIndex, report: Report): void {
    for (const el of index.elements) {
        const describedBy = staticAttribute(el, 'aria-describedby');
        if (!describedBy || !isTextEntry(el)) continue;
        for (const token of tokensOf(describedBy)) {
            const target = index.elementById.get(token);
            if (!target || hasAncestor(el, (a) => a === target)) continue;
            if (index.position.get(target)! < index.position.get(el)!) continue;
            if (isErrorLike(target, el, index)) continue;
            report({
                rule: 'hint-below-field',
                severity: 'warning',
                message: `${describeElement(el, index)} has its hint "#${token}" below the field — the mobile keyboard and autofill popovers can cover it`,
                fix: 'Move the hint element above the field; error messages may stay below.',
                element: `<${tagOf(el)}>`,
                attribute: 'aria-describedby',
            });
        }
    }
}

// --- R5 autocomplete-invalid -----------------------------------------------------------------

const AUTOCOMPLETE_TAGS = new Set(['input', 'select', 'textarea', 'form']);

function checkAutocompleteValues(index: FormIndex, report: Report): void {
    for (const el of index.elements) {
        const tag = tagOf(el);
        const value = staticAttribute(el, 'autocomplete');
        if (!AUTOCOMPLETE_TAGS.has(tag) || value === undefined || isSkippedInput(el)) continue;
        const valid =
            tag === 'form' ? /^(on|off)$/i.test(value.trim()) : isValidAutocomplete(value);
        if (valid) continue;
        const typoFix = autocompleteTypoFix(value);
        report({
            rule: 'autocomplete-invalid',
            severity: 'error',
            message: `${describeElement(el, index)} has invalid autocomplete "${value}" (WCAG 1.3.5)`,
            fix: typoFix
                ? `Use autocomplete="${typoFix}".`
                : 'Use a valid token from the HTML autofill list.',
            element: `<${tag}>`,
            attribute: 'autocomplete',
        });
    }
}

// --- R6 autocomplete-missing -----------------------------------------------------------------

const DENY_WORDS = ['search', 'q', 'coupon', 'promo', 'message', 'ip address', 'mac address'];

/** A row matches when a word appears in the name/id; `alone` rows match only the whole name/id. */
const HEURISTICS: Array<{ words: string[]; token: (el: any) => string; alone?: boolean }> = [
    { words: ['email', 'e mail'], token: () => 'email' },
    { words: ['username', 'login'], token: () => 'username' },
    { words: ['company', 'organization'], token: () => 'organization' },
    { words: ['first name', 'fname', 'given'], token: () => 'given-name' },
    { words: ['last name', 'lname', 'surname', 'family'], token: () => 'family-name' },
    { words: ['phone', 'tel', 'mobile'], token: () => 'tel' },
    { words: ['zip', 'postal', 'postcode'], token: () => 'postal-code' },
    { words: ['city', 'town'], token: () => 'address-level2' },
    { words: ['country'], token: (el) => (tagOf(el) === 'select' ? 'country' : 'country-name') },
    { words: ['address', 'street'], token: () => 'street-address' },
    { words: ['full name', 'name'], token: () => 'name', alone: true },
];

/** `zipCode` / `zip_code` / `zip-code` → `zip code`, lower-case, space separated. */
export function normalizedName(value: string): string {
    return ` ${value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .toLowerCase()
        .trim()} `;
}

function containsWord(normalized: string, word: string): boolean {
    return normalized.includes(` ${word} `);
}

function nameAndId(el: any): string[] {
    return ['name', 'id']
        .map((a) => staticAttribute(el, a))
        .filter((v): v is string => !!v)
        .map(normalizedName);
}

export function isDenyListed(el: any): boolean {
    return nameAndId(el).some((n) => DENY_WORDS.some((word) => containsWord(n, word)));
}

function suggestedToken(el: any): string | undefined {
    if (isDenyListed(el)) return undefined;
    const names = nameAndId(el);
    const row = HEURISTICS.find((h) =>
        names.some((n) =>
            h.words.some((word) => (h.alone ? n.trim() === word : containsWord(n, word))),
        ),
    );
    if (tagOf(el) === 'textarea') return row?.words.includes('address') ? row.token(el) : undefined;
    if (row) return row.token(el);
    const type = inputType(el);
    if (tagOf(el) === 'input' && (type === 'email' || type === 'tel')) return type;
    return undefined;
}

function isAutocompleteCandidate(el: any): boolean {
    const tag = tagOf(el);
    if (tag === 'select' || tag === 'textarea') return true;
    return isTextEntry(el) && inputType(el) !== 'password';
}

function checkMissingAutocomplete(index: FormIndex, report: Report, usernameField: any): void {
    for (const el of index.elements) {
        if (
            el === usernameField ||
            !isAutocompleteCandidate(el) ||
            hasAttribute(el, 'autocomplete')
        )
            continue;
        const token = suggestedToken(el);
        if (!token) continue;
        report({
            rule: 'autocomplete-missing',
            severity: 'warning',
            message: `${describeElement(el, index)} looks like an identity or contact field but has no autocomplete (WCAG 1.3.5)`,
            fix: `Add autocomplete="${token}" (or autocomplete="off" if autofill is unwanted).`,
            element: `<${tagOf(el)}>`,
            attribute: 'autocomplete',
        });
    }
}

// --- R7 password-autocomplete ----------------------------------------------------------------

const PASSWORD_TOKENS = ['current-password', 'new-password', 'one-time-code'];

function checkPasswordAutocomplete(index: FormIndex, report: Report): void {
    for (const el of index.elements) {
        if (tagOf(el) !== 'input' || inputType(el) !== 'password') continue;
        const value = el.getAttribute?.('autocomplete') ?? '';
        if (value.includes('{')) continue;
        if (tokensOf(value.toLowerCase()).some((t) => PASSWORD_TOKENS.includes(t))) continue;
        report({
            rule: 'password-autocomplete',
            severity: 'error',
            message: `${describeElement(el, index)} has no autocomplete="current-password", "new-password" or "one-time-code" — password managers can't fill or save it (WCAG 1.3.5)`,
            fix: 'Add autocomplete="current-password" on sign-in or autocomplete="new-password" when choosing a password.',
            element: '<input>',
            attribute: 'autocomplete',
        });
    }
}

// --- R8 username-autocomplete ----------------------------------------------------------------

/** Finds the sign-in name field and reports it when it lacks `username`; returns it so R6 skips it. */
function checkUsernameAutocomplete(index: FormIndex, report: Report): any {
    const password = index.elements.find(
        (el) => tagOf(el) === 'input' && inputType(el) === 'password',
    );
    if (!password) return undefined;
    const form = index.elements.find(
        (el) => tagOf(el) === 'form' && hasAncestorOrSelf(password, el),
    );
    const before = index.elements.slice(0, index.position.get(password));
    const candidate = before
        .filter((el) => !form || hasAncestorOrSelf(el, form))
        .filter((el) => tagOf(el) === 'input' && ['text', 'email'].includes(inputType(el)))
        .filter((el) => !isDenyListed(el))
        .pop();
    if (!candidate) return undefined;
    const value = autocompleteOf(candidate);
    if (value.includes('{') || tokensOf(value.toLowerCase()).includes('username')) return candidate;
    report({
        rule: 'username-autocomplete',
        severity: 'warning',
        message: `${describeElement(candidate, index)} is the sign-in name for the password field but has no autocomplete="username" (WCAG 1.3.5)`,
        fix: 'Add autocomplete="username" (or "username webauthn" with passkeys).',
        element: '<input>',
        attribute: 'autocomplete',
    });
    return candidate;
}

function autocompleteOf(el: any): string {
    return el.getAttribute?.('autocomplete') ?? '';
}

function hasAncestorOrSelf(node: any, ancestor: any): boolean {
    return node === ancestor || hasAncestor(node, (a) => a === ancestor);
}

// --- R9 error-not-associated -----------------------------------------------------------------

const ERROR_IDENTIFIER = /[A-Za-z_$][\w$]*/g;

function errorIdentifiers(text: string): string[] {
    return (text.match(ERROR_IDENTIFIER) ?? []).filter(
        (id) => /error|invalid/i.test(id) && !/(Count|Summary|List)$/.test(id),
    );
}

function conditionOf(el: any): string | undefined {
    if (hasAttribute(el, 'if')) return el.getAttribute('if');
    const when = Object.keys(el.attributes ?? {}).find((name) => name.startsWith('when-'));
    return when ? el.getAttribute(when) : undefined;
}

function looksLikeErrorElement(el: any): boolean {
    const condition = conditionOf(el);
    if (condition === undefined || condition.trim().startsWith('!')) return false;
    const bindings = (el.text ?? '').match(/\{[^}]*\}/g)?.join(' ') ?? '';
    return errorIdentifiers(`${condition} ${bindings}`).length > 0;
}

function onlyControlNear(el: any): any {
    for (const scope of [el.parentNode, el.parentNode?.parentNode]) {
        if (!scope) break;
        const controls = allElements(scope).filter(isFormControl);
        if (controls.length === 1) return controls[0];
        if (controls.length > 1) return undefined;
    }
    return undefined;
}

function checkErrorAssociation(index: FormIndex, report: Report): void {
    for (const errorEl of index.elements) {
        if (!looksLikeErrorElement(errorEl)) continue;
        const control = onlyControlNear(errorEl);
        if (!control) continue;
        const errorId = staticAttribute(errorEl, 'id');
        const describedBy = tokensOf(staticAttribute(control, 'aria-describedby') ?? '');
        const missing: string[] = [];
        if (!errorId || !describedBy.includes(errorId))
            missing.push('an id listed in its aria-describedby');
        if (!hasAttribute(control, 'aria-invalid')) missing.push('an aria-invalid attribute');
        if (missing.length === 0) continue;
        report({
            rule: 'error-not-associated',
            severity: 'warning',
            message: `${describeElement(errorEl, index)} looks like the error for ${describeElement(control, index)} but is not linked: missing ${missing.join(' and ')} (WCAG 3.3.1, 4.1.2)`,
            fix: "Give the error a static id, list it in the field's aria-describedby, and bind aria-invalid to the same state.",
            element: `<${tagOf(errorEl)}>`,
        });
    }
}
