import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import selectorParser from 'postcss-selector-parser';
import { collectPageCssSources, formSourceName, type CssSource } from '../css/css-sources.js';
import { flattenAll, type CssDeclaration, type FlatRule } from '../css/flat-rules.js';
import { formFinding, isFormRuleSuppressed, type FormFindingSpec } from './form-rules.js';

/** DL#240 R10 (`css-invalid-early`) and R11 (`css-autofill-color-only`), on the page's `ctx.css`. */
export function checkFormCssRules(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const rules = flattenAll(collectPageCssSources(ctx));
    const findings: JayHtmlValidationFinding[] = [];
    const report = (spec: FormFindingSpec) => {
        if (!isFormRuleSuppressed(ctx, spec.rule)) findings.push(formFinding(spec));
    };
    checkInvalidEarly(rules, report);
    checkAutofillColorOnly(rules, report);
    return findings;
}

type Report = (spec: FormFindingSpec) => void;

function parseSelector(selector: string): selectorParser.Selector | undefined {
    try {
        return selectorParser().astSync(selector).first;
    } catch {
        return undefined;
    }
}

// --- R10 css-invalid-early --------------------------------------------------------------------

const RESET_VALUES = new Set(['none', '0', 'transparent', 'initial', 'unset', 'inherit', 'revert']);
const STATE_CLASSES = new Set([
    'submitted',
    'touched',
    'dirty',
    'was-validated',
    'user-interacted',
]);
const STATE_DATA_ATTRIBUTES = new Set([
    'data-touched',
    'data-submitted',
    'data-dirty',
    'data-state',
]);
const FORM_LEVEL_TAGS = new Set(['form', 'fieldset']);

type Compound = selectorParser.Node[];

function compoundsOf(selector: selectorParser.Selector): Compound[] {
    const compounds: Compound[] = [[]];
    for (const node of selector.nodes) {
        if (node.type === 'combinator') compounds.push([]);
        else if (node.type !== 'comment') compounds[compounds.length - 1].push(node);
    }
    return compounds.filter((c) => c.length > 0);
}

function pseudoName(node: selectorParser.Node): string | undefined {
    return node.type === 'pseudo' ? node.value.toLowerCase() : undefined;
}

function isGate(node: selectorParser.Node): boolean {
    if (node.type === 'class') return STATE_CLASSES.has(node.value);
    if (node.type !== 'attribute') return false;
    const name = node.attribute.toLowerCase();
    return (
        name === 'aria-invalid' || STATE_DATA_ATTRIBUTES.has(name) || name.startsWith('data-user-')
    );
}

function hasPlaceholderShownGate(compound: Compound): boolean {
    return compound.some((n) => pseudoName(n) === ':not' && /:placeholder-shown/i.test(String(n)));
}

function isFormLevel(compound: Compound): boolean {
    return compound.some((n) => n.type === 'tag' && FORM_LEVEL_TAGS.has(n.value.toLowerCase()));
}

/** True when `selector` styles `:invalid` with no "user has interacted" gate (DL#240 R10). */
function hasUngatedInvalid(selector: selectorParser.Selector, outerGated: boolean): boolean {
    const compounds = compoundsOf(selector);
    let gated = outerGated;
    return compounds.some((compound, i) => {
        gated = gated || compound.some(isGate);
        const isSubject = i === compounds.length - 1;
        const allowedFormLevel = isFormLevel(compound) && !isSubject;
        return compound.some((node) => {
            const name = pseudoName(node);
            if (name === ':invalid')
                return !gated && !hasPlaceholderShownGate(compound) && !allowedFormLevel;
            if (name === ':is' || name === ':where') return argumentsUngated(node, gated);
            if (name === ':has') return !allowedFormLevel && argumentsUngated(node, gated);
            return false;
        });
    });
}

function argumentsUngated(pseudo: selectorParser.Node, gated: boolean): boolean {
    return ((pseudo as selectorParser.Pseudo).nodes ?? []).some((argument) =>
        hasUngatedInvalid(argument as selectorParser.Selector, gated),
    );
}

function isResetOnly(declarations: CssDeclaration[]): boolean {
    return (
        declarations.length > 0 &&
        declarations.every((d) => RESET_VALUES.has(d.value.toLowerCase()))
    );
}

function checkInvalidEarly(rules: FlatRule[], report: Report): void {
    for (const rule of rules) {
        if (isResetOnly(rule.declarations)) continue;
        for (const selector of rule.selectors) {
            const parsed = parseSelector(selector);
            if (!parsed || !hasUngatedInvalid(parsed, false)) continue;
            report({
                rule: 'css-invalid-early',
                severity: 'warning',
                message: `selector "${selector}" in ${formSourceName(rule.source.origin)} styles fields as invalid before the user has typed`,
                fix: 'Use :user-invalid, or gate :invalid behind a state class such as .submitted.',
            });
        }
    }
}

// --- R11 css-autofill-color-only ---------------------------------------------------------------

const AUTOFILL = /:(-webkit-)?autofill\b/i;
const BORDER_SIDE = /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/;
const WIDTH_OR_STYLE_TOKEN =
    /^(\d*\.?\d+[a-z%]*|thin|medium|thick|none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset|auto)$/i;

interface MergedRule {
    selector: string;
    declarations: CssDeclaration[];
    source: CssSource;
}

function shorthandHasWidthOrStyle(value: string): boolean {
    return value.split(/\s+(?![^(]*\))/).some((token) => WIDTH_OR_STYLE_TOKEN.test(token));
}

function isColourOnly({ property, value }: CssDeclaration): boolean {
    if (
        ['color', 'background-color', 'outline-color', '-webkit-text-fill-color'].includes(property)
    )
        return true;
    if (/^border(-[a-z]+)*-color$/.test(property)) return true;
    if (BORDER_SIDE.test(property) || property === 'outline')
        return !shorthandHasWidthOrStyle(value);
    return false;
}

function isNonColourCue({ property, value }: CssDeclaration): boolean {
    if (['box-shadow', '-webkit-box-shadow'].includes(property))
        return value.toLowerCase() !== 'none';
    if (
        [
            'background-image',
            'outline-style',
            'outline-width',
            'text-decoration',
            'font-weight',
        ].includes(property)
    ) {
        return true;
    }
    if (/^border(-[a-z]+)*-(width|style)$/.test(property)) return true;
    if (BORDER_SIDE.test(property) || property === 'outline')
        return shorthandHasWidthOrStyle(value);
    return false;
}

function mergeAutofillRules(rules: FlatRule[]): MergedRule[] {
    const merged = new Map<string, MergedRule>();
    for (const rule of rules) {
        for (const selector of rule.selectors) {
            if (!AUTOFILL.test(selector)) continue;
            const existing = merged.get(selector);
            if (existing) existing.declarations.push(...rule.declarations);
            else
                merged.set(selector, {
                    selector,
                    declarations: [...rule.declarations],
                    source: rule.source,
                });
        }
    }
    return [...merged.values()];
}

function checkAutofillColorOnly(rules: FlatRule[], report: Report): void {
    for (const rule of mergeAutofillRules(rules)) {
        if (!rule.declarations.some(isColourOnly) || rule.declarations.some(isNonColourCue))
            continue;
        report({
            rule: 'css-autofill-color-only',
            severity: 'warning',
            message: `selector "${rule.selector}" in ${formSourceName(rule.source.origin)} signals autofill with colour only (WCAG 1.4.1)`,
            fix: "Add a non-colour cue that doesn't shift layout, e.g. box-shadow: inset 0 0 0 2px <colour>.",
        });
    }
}
