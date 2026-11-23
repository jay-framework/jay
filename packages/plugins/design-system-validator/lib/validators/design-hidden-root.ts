import postcss, { type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { HTMLElement } from 'node-html-parser';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { isPageFile } from './page-file.js';

/**
 * DL#242 Rule 2 — anti-flicker: the page root (html/:root/body, or a direct child of body) hidden with
 * base-level `opacity: 0` or `visibility: hidden` until a script reveals it. Pages only.
 */

const EXCLUDED_AT_RULES = new Set([
    'media',
    'keyframes',
    'starting-style',
    'supports',
    'container',
]);
const ROOT_TAGS = new Set(['html', 'body']);
const LEGACY_PSEUDO_ELEMENTS = new Set([':before', ':after', ':first-line', ':first-letter']);

const TAIL =
    'The page stays invisible until a script reveals it (anti-flicker). This delays LCP and leaves invisible content clickable.';
const SUGGESTION =
    'Remove it. If content must wait for a script, use <script blocking="render" jay-script="allow"> (inline, or an external URL; local src files are not allowed) instead, see designer/script-tags.md. ' +
    'If intentional, suppress with design-system: { allow-hidden-root: true } in <script type="application/jay-validations">. ' +
    'See agent-kit/designer/layout-stability.md';

export const validateHiddenRoot: JayHtmlValidatorFn = (ctx) => {
    if (!isPageFile(ctx.filePath)) return [];
    if (ctx.validationOverrides?.['design-system']?.['allow-hidden-root'] === true) return [];
    const body = ctx.body as HTMLElement;
    return [...cssFindings(ctx.css, body), ...inlineFindings(body)];
};

/** `opacity: 0` (also `0.0`, `0%`) or `visibility: hidden`, ignoring `!important`. */
function hidingValue(property: string, value: string): string | undefined {
    const clean = value.replace(/!\s*important/i, '').trim();
    const prop = property.toLowerCase();
    if (prop === 'opacity' && /^0*(\.0+)?%?$/.test(clean) && /0/.test(clean)) return clean;
    if (prop === 'visibility' && clean.toLowerCase() === 'hidden') return clean;
    return undefined;
}

function cssFindings(css: string | undefined, body: HTMLElement): JayHtmlValidationFinding[] {
    if (!css) return [];
    const findings: JayHtmlValidationFinding[] = [];
    postcss.parse(css).walkRules((rule) => {
        if (isExcludedContext(rule)) return;
        const hidden = rule.nodes
            .filter((node): node is postcss.Declaration => node.type === 'decl')
            .map((decl) => ({ property: decl.prop, value: hidingValue(decl.prop, decl.value) }))
            .filter((entry) => entry.value != null);
        if (hidden.length === 0) return;
        for (const selector of rule.selectors.map((s) => s.trim())) {
            if (!targetsRoot(selector) && !targetsDirectChild(selector, body)) continue;
            for (const { property, value } of hidden) {
                findings.push({
                    severity: 'warning',
                    message: `"${selector}" sets ${property}: ${value}. ${TAIL}`,
                    suggestion: SUGGESTION,
                    element: selector,
                });
            }
        }
    });
    return findings;
}

/** Excluded at-rules, and nested CSS (a rule inside a rule — known gap). `@layer` counts as base. */
function isExcludedContext(rule: Rule): boolean {
    for (
        let parent: postcss.Node | undefined = rule.parent as postcss.Node | undefined;
        parent;
        parent = parent.parent as postcss.Node | undefined
    ) {
        if (parent.type === 'rule') return true;
        if (
            parent.type === 'atrule' &&
            EXCLUDED_AT_RULES.has((parent as postcss.AtRule).name.toLowerCase())
        ) {
            return true;
        }
    }
    return false;
}

function rightmostCompound(selector: string): selectorParser.Node[] | undefined {
    try {
        const parsed = selectorParser().astSync(selector).first;
        const nodes = parsed.nodes;
        const lastCombinator = nodes.map((node) => node.type).lastIndexOf('combinator');
        return nodes.slice(lastCombinator + 1);
    } catch {
        return undefined;
    }
}

function isPseudoElement(node: selectorParser.Node): boolean {
    return (
        node.type === 'pseudo' &&
        (node.value.startsWith('::') || LEGACY_PSEUDO_ELEMENTS.has(node.value.toLowerCase()))
    );
}

/** The rightmost compound has a top-level `html`/`body`/`:root` (extra classes are runtime state). */
function targetsRoot(selector: string): boolean {
    const compound = rightmostCompound(selector);
    if (!compound || compound.some(isPseudoElement)) return false;
    return compound.some(
        (node) =>
            (node.type === 'tag' && ROOT_TAGS.has(node.value.toLowerCase())) ||
            (node.type === 'pseudo' && node.value === ':root'),
    );
}

function targetsDirectChild(selector: string, body: HTMLElement): boolean {
    const compound = rightmostCompound(selector);
    if (!compound || compound.some(isPseudoElement)) return false;
    return elementChildren(body).some((child) => {
        try {
            return child.closest(selector) === child;
        } catch {
            return false;
        }
    });
}

function elementChildren(el: HTMLElement): HTMLElement[] {
    return el.childNodes.filter((node): node is HTMLElement => node.nodeType === 1);
}

function inlineFindings(body: HTMLElement): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    for (const el of [body, ...elementChildren(body)]) {
        const style = el.getAttribute('style');
        if (!style) continue;
        for (const declaration of style.split(';')) {
            const [property, ...rest] = declaration.split(':');
            if (!property || rest.length === 0) continue;
            const value = hidingValue(property.trim(), rest.join(':'));
            if (value == null) continue;
            const tag = el.rawTagName.toLowerCase();
            findings.push({
                severity: 'warning',
                message: `<${tag}> style sets ${property.trim()}: ${value}. ${TAIL}`,
                suggestion: SUGGESTION,
                element: `<${tag}>`,
                attribute: 'style',
            });
        }
    }
    return findings;
}
