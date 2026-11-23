import postcss, { type AtRule, type Declaration, type Node, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import type { HTMLElement } from 'node-html-parser';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
    JayHtmlValidatorFn,
} from '@jay-framework/compiler-shared';
import { hasAllowComment } from '../css-cascade.js';
import { CSS_NAMED_COLORS } from './css-color-keywords.js';
import { isPageFile } from './page-file.js';

/**
 * DL#241 — dark-theme pages must declare color-scheme (meta + property) so native controls follow the
 * theme. Every rule fires only on a dark-capable page; light-only pages never get a finding.
 */

const DARK_MODE_GUIDE = ' See agent-kit/designer/dark-mode-patterns.md';

type RuleId =
    | 'no-color-scheme-meta'
    | 'color-scheme-meta-light-only'
    | 'dark-toggle-without-color-scheme'
    | 'light-dark-without-color-scheme'
    | 'fixed-control-colors';

interface RuleFinding extends JayHtmlValidationFinding {
    ruleId: RuleId;
}

export const validateColorScheme: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css || !isPageFile(ctx.filePath)) return [];
    const signals = findDarkThemeSignals(ctx.css);
    if (!signals.firstSignal) return [];
    const overrides = ctx.validationOverrides?.['design-system'];
    return [
        ...checkColorSchemeMeta(ctx, signals),
        ...checkToggleTokens(signals),
        ...checkLightDarkEnabled(ctx, signals),
        ...checkControlColors(ctx, signals),
    ]
        .filter((finding) => overrides?.[`allow-${finding.ruleId}`] !== true)
        .map(({ ruleId, ...finding }) => finding);
};

// ── Signals ──────────────────────────────────────────────────────────────────────────────────────

const TOGGLE_CLASSES = new Set(['dark', 'dark-mode', 'theme-dark']);
const TOGGLE_ATTRIBUTES = new Set(['data-theme', 'data-color-scheme', 'data-mode']);
const ROOT_TAGS = new Set(['html', 'body']);
const DARK_MEDIA = /prefers-color-scheme\s*:\s*dark/i;

interface DarkThemeSignals {
    firstSignal?: string;
    toggleTokens: Map<string, { firstSelector: string; satisfied: boolean }>;
    lightDarkUses: Array<{ selector: string; prop: string }>;
    hasDarkColorSchemeDecl: boolean;
    root: postcss.Root;
}

function findDarkThemeSignals(css: string): DarkThemeSignals {
    const root = postcss.parse(css);
    const signals: DarkThemeSignals = {
        toggleTokens: new Map(),
        lightDarkUses: [],
        hasDarkColorSchemeDecl: false,
        root,
    };
    const satisfiedTokens = new Set<string>();
    const noteSignal = (signal: string) => (signals.firstSignal ??= signal);

    root.walk((node) => {
        if (node.type === 'rule') {
            const rule = node as Rule;
            const darkMedia = darkMediaAncestor(rule);
            if (darkMedia) noteSignal(`@media ${darkMedia.params}`);
            for (const selector of splitSelectors(rule.selector)) {
                for (const token of toggleTokensIn(selector)) {
                    noteSignal(token);
                    if (!signals.toggleTokens.has(token)) {
                        signals.toggleTokens.set(token, {
                            firstSelector: selector.toString().trim(),
                            satisfied: false,
                        });
                    }
                }
            }
        } else if (node.type === 'decl') {
            const decl = node as Declaration;
            const rule = decl.parent?.type === 'rule' ? (decl.parent as Rule) : undefined;
            if (/light-dark\(/i.test(decl.value)) {
                noteSignal('light-dark()');
                if (rule)
                    signals.lightDarkUses.push({ selector: rule.selector.trim(), prop: decl.prop });
            }
            if (decl.prop.toLowerCase() === 'color-scheme' && enablesDark(decl.value)) {
                noteSignal(`color-scheme: ${decl.value.trim()}`);
                signals.hasDarkColorSchemeDecl = true;
                if (rule) satisfiedTokensOf(rule).forEach((token) => satisfiedTokens.add(token));
            }
        }
    });
    for (const [token, entry] of signals.toggleTokens) entry.satisfied = satisfiedTokens.has(token);
    return signals;
}

function enablesDark(value: string): boolean {
    return value.toLowerCase().split(/\s+/).includes('dark');
}

function darkMediaAncestor(node: Node): AtRule | undefined {
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (
            parent.type === 'atrule' &&
            (parent as AtRule).name === 'media' &&
            DARK_MEDIA.test((parent as AtRule).params)
        ) {
            return parent as AtRule;
        }
    }
    return undefined;
}

function splitSelectors(selectorText: string): selectorParser.Selector[] {
    try {
        return selectorParser().astSync(selectorText).nodes;
    } catch {
        return [];
    }
}

function tokenText(node: selectorParser.Node): string | undefined {
    if (node.type === 'class' && TOGGLE_CLASSES.has(node.value)) return `.${node.value}`;
    if (
        node.type === 'attribute' &&
        TOGGLE_ATTRIBUTES.has(node.attribute) &&
        node.operator === '=' &&
        node.value === 'dark' &&
        !node.insensitive
    ) {
        return `[${node.attribute}="dark"]`;
    }
    return undefined;
}

function compoundsOf(selector: selectorParser.Selector): selectorParser.Node[][] {
    const compounds: selectorParser.Node[][] = [[]];
    for (const node of selector.nodes) {
        if (node.type === 'combinator') compounds.push([]);
        else if (node.type !== 'comment') compounds[compounds.length - 1].push(node);
    }
    return compounds;
}

function isRootNode(node: selectorParser.Node): boolean {
    return (
        (node.type === 'tag' && ROOT_TAGS.has(node.value.toLowerCase())) ||
        (node.type === 'pseudo' && node.value === ':root')
    );
}

function isMatchesPseudo(node: selectorParser.Node): node is selectorParser.Pseudo {
    return node.type === 'pseudo' && (node.value === ':is' || node.value === ':where');
}

/**
 * Toggle tokens that count as a theme signal (Q2): on a `:root`/`html`/`body` compound, or as the whole
 * first compound (plus an optional element type). Inside `:not()` never; inside `:is()`/`:where()` yes,
 * when the pseudo itself sits in such a position. `.btn.dark` and `.btn:is(.dark)` are component variants.
 */
function toggleTokensIn(selector: selectorParser.Selector): string[] {
    const tokens: string[] = [];
    compoundsOf(selector).forEach((compound, index) => {
        const onRoot = compound.some(isRootNode);
        const others = (node: selectorParser.Node) =>
            compound.filter((other) => other !== node && !(other.type === 'tag'));
        for (const node of compound) {
            const inPosition = onRoot || (index === 0 && others(node).length === 0);
            if (!inPosition) continue;
            const token = tokenText(node);
            if (token) tokens.push(token);
            if (isMatchesPseudo(node)) {
                for (const inner of node.nodes) tokens.push(...toggleTokensIn(inner));
            }
        }
    });
    return tokens;
}

/** Tokens a `color-scheme` rule satisfies: its subject compound is the token, or root + token. */
function satisfiedTokensOf(rule: Rule): string[] {
    return splitSelectors(rule.selector).flatMap((selector) => {
        const compounds = compoundsOf(selector);
        const subject = compounds[compounds.length - 1];
        const rest = subject.filter((node) => !isRootNode(node));
        const token = rest.length === 1 ? tokenText(rest[0]) : undefined;
        return token ? [token] : [];
    });
}

// ── Meta and light-dark rules ────────────────────────────────────────────────────────────────────

const PROVIDED_COLOR_SCHEME_META = /<meta\b[^>]*\bname\s*=\s*["']?color-scheme\b/i;

function hasProvidedMeta(ctx: JayHtmlValidationContext): boolean {
    return ctx.headlessImports.some((imported) =>
        (imported.providedHeadTags ?? []).some((tag) => PROVIDED_COLOR_SCHEME_META.test(tag)),
    );
}

type MetaState = { kind: 'none' } | { kind: 'dynamic' } | { kind: 'static'; content: string };

function colorSchemeMeta(ctx: JayHtmlValidationContext): MetaState {
    const meta = ctx.head?.meta.find((entry) => entry.name?.toLowerCase() === 'color-scheme');
    if (!meta) return { kind: 'none' };
    if (meta.content.some((part) => part.kind !== 'static')) return { kind: 'dynamic' };
    return {
        kind: 'static',
        content: meta.content
            .map((part) => part.value)
            .join('')
            .trim(),
    };
}

function checkColorSchemeMeta(
    ctx: JayHtmlValidationContext,
    signals: DarkThemeSignals,
): RuleFinding[] {
    if (hasProvidedMeta(ctx)) return [];
    const meta = colorSchemeMeta(ctx);
    if (meta.kind === 'none') {
        return [
            {
                ruleId: 'no-color-scheme-meta',
                severity: 'warning',
                message: `Page has a dark theme (${signals.firstSignal}) but no <meta name="color-scheme"> in <head>. The meta is read before any CSS loads, so without it dark-mode users can see a white flash.`,
                suggestion: `Add <meta name="color-scheme" content="light dark"> to <head>. Suppress: design-system: { allow-no-color-scheme-meta: true }.${DARK_MODE_GUIDE}`,
            },
        ];
    }
    if (meta.kind === 'static' && !enablesDark(meta.content)) {
        return [
            {
                ruleId: 'color-scheme-meta-light-only',
                severity: 'warning',
                message: `<meta name="color-scheme" content="${meta.content}"> does not enable dark, but the page has a dark theme (${signals.firstSignal}).`,
                suggestion: `Use content="light dark". Suppress: design-system: { allow-color-scheme-meta-light-only: true }.${DARK_MODE_GUIDE}`,
            },
        ];
    }
    return [];
}

function checkToggleTokens(signals: DarkThemeSignals): RuleFinding[] {
    return [...signals.toggleTokens]
        .filter(([, entry]) => !entry.satisfied)
        .map(([token, entry]) => ({
            ruleId: 'dark-toggle-without-color-scheme' as const,
            severity: 'warning' as const,
            message: `Dark theme "${token}" (first used in "${entry.firstSelector}") never sets color-scheme: dark. Native inputs, selects and scrollbars stay light.`,
            suggestion: `Add a rule "${token} { color-scheme: dark; }". Suppress: design-system: { allow-dark-toggle-without-color-scheme: true }.${DARK_MODE_GUIDE}`,
        }));
}

function checkLightDarkEnabled(
    ctx: JayHtmlValidationContext,
    signals: DarkThemeSignals,
): RuleFinding[] {
    const firstUse = signals.lightDarkUses[0];
    if (!firstUse || signals.hasDarkColorSchemeDecl || hasProvidedMeta(ctx)) return [];
    const meta = colorSchemeMeta(ctx);
    if (meta.kind === 'dynamic' || (meta.kind === 'static' && enablesDark(meta.content))) return [];
    return [
        {
            ruleId: 'light-dark-without-color-scheme',
            severity: 'warning',
            message: `light-dark() is used (${firstUse.selector} { ${firstUse.prop} }) but nothing enables a dark color-scheme, so it always resolves to the light value.`,
            suggestion: `Add <meta name="color-scheme" content="light dark"> or color-scheme: light dark on :root. Suppress: design-system: { allow-light-dark-without-color-scheme: true }.${DARK_MODE_GUIDE}`,
        },
    ];
}

// ── fixed-control-colors ─────────────────────────────────────────────────────────────────────────

const CONTROL_PROPS = new Set(['color', 'background-color', 'background']);
const NON_TEXT_INPUT_TYPES = new Set([
    'submit',
    'button',
    'reset',
    'checkbox',
    'radio',
    'range',
    'color',
    'image',
    'hidden',
]);
const COLOR_FUNCTIONS = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)$/i;
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const bucketOf = (prop: string) => (prop === 'color' ? 'color' : 'background');

function isCheckedControl(el: HTMLElement): boolean {
    const tag = el.rawTagName?.toLowerCase();
    if (tag === 'select' || tag === 'textarea') return true;
    return (
        tag === 'input' &&
        !NON_TEXT_INPUT_TYPES.has((el.getAttribute('type') ?? 'text').toLowerCase())
    );
}

/** A literal colour in a raw value (Q5/Q7): hex, colour function or CSS named colour. */
function hasLiteralColor(value: string): boolean {
    if (/var\(|light-dark\(/i.test(value)) return false;
    return valueParser(value).nodes.some(
        (node) =>
            (node.type === 'word' &&
                (HEX.test(node.value) || CSS_NAMED_COLORS.has(node.value.toLowerCase()))) ||
            (node.type === 'function' && COLOR_FUNCTIONS.test(node.value)),
    );
}

function matchControls(body: HTMLElement, selector: string): HTMLElement[] {
    if (!selector) return [];
    try {
        return body.querySelectorAll(selector).filter(isCheckedControl);
    } catch {
        return []; // unsupported pseudo-class or unparseable selector → no finding
    }
}

interface DarkOverride {
    selector: string;
    bucket: string;
}

function checkControlColors(
    ctx: JayHtmlValidationContext,
    signals: DarkThemeSignals,
): RuleFinding[] {
    const overrides: DarkOverride[] = [];
    const baseDecls: Array<{ decl: Declaration; selector: string }> = [];

    signals.root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        if (!CONTROL_PROPS.has(prop) || decl.parent?.type !== 'rule') return;
        const rule = decl.parent as Rule;
        const inDarkMedia = darkMediaAncestor(rule) != null;
        for (const selector of splitSelectors(rule.selector)) {
            const isToggle = toggleTokensIn(selector).length > 0;
            if (inDarkMedia || isToggle) {
                overrides.push({ selector: darkContextSelector(selector), bucket: bucketOf(prop) });
            } else if (hasLiteralColor(decl.value) && !hasAllowComment(decl)) {
                baseDecls.push({ decl, selector: selector.toString().trim() });
            }
        }
    });

    const findings = new Map<string, RuleFinding>();
    for (const { decl, selector } of baseDecls) {
        const prop = decl.prop.toLowerCase();
        for (const el of matchControls(ctx.body, selector)) {
            const overridden = overrides.some(
                (override) =>
                    override.bucket === bucketOf(prop) &&
                    matchControls(ctx.body, override.selector).includes(el),
            );
            const tag = el.rawTagName.toLowerCase();
            const key = `${selector}|${prop}|${tag}`;
            if (overridden || findings.has(key)) continue;
            findings.set(key, {
                ruleId: 'fixed-control-colors',
                severity: 'warning',
                message: `${tag} gets ${prop}: ${decl.value.trim()} from "${selector}" on a page with a dark theme, and no dark rule overrides it.`,
                suggestion: `Use a theme token (var(--…)), light-dark(), or Field/FieldText, or add a dark override. Suppress one line with /* design-system: allow */, or the page with design-system: { allow-fixed-control-colors: true }.${DARK_MODE_GUIDE}`,
            });
        }
    }
    return [...findings.values()];
}

/**
 * A dark-context selector as it would match in the static, body-rooted tree: toggle tokens removed
 * (an emptied `:is()` branch dropped), then a leading empty or bare `html`/`:root`/`body` compound
 * dropped with its combinator. `[data-theme="dark"] input` → `input`; `html.dark input` → `input`.
 */
function darkContextSelector(selector: selectorParser.Selector): string {
    const copy = selector.clone() as selectorParser.Selector;
    copy.walk((node) => {
        if (tokenText(node) && !isInsideNot(node)) node.remove();
    });
    copy.walkPseudos((pseudo) => {
        if (!isMatchesPseudo(pseudo)) return;
        pseudo.nodes.filter((inner) => inner.nodes.length === 0).forEach((inner) => inner.remove());
        if (pseudo.nodes.length === 0) pseudo.remove();
    });
    dropLeadingRootCompound(copy);
    return copy.toString().trim();
}

function isInsideNot(node: selectorParser.Node): boolean {
    for (let parent = node.parent; parent; parent = parent.parent as any) {
        if (parent.type === 'pseudo' && parent.value === ':not') return true;
    }
    return false;
}

function dropLeadingRootCompound(selector: selectorParser.Selector): void {
    const combinatorIndex = selector.nodes.findIndex((node) => node.type === 'combinator');
    if (combinatorIndex < 0) return;
    const first = selector.nodes
        .slice(0, combinatorIndex)
        .filter((node) => node.type !== 'comment');
    const removable = first.length === 0 || (first.length === 1 && isRootNode(first[0]));
    if (!removable) return;
    selector.nodes.slice(0, combinatorIndex + 1).forEach((node) => node.remove());
    if (selector.first) selector.first.spaces.before = '';
}
