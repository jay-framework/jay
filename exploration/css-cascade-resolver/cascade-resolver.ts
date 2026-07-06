import postcss, { type Rule, type Declaration } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { selectorSpecificity } from '@csstools/selector-specificity';
import { parse as parseHtml, type HTMLElement } from 'node-html-parser';

export interface ResolvedStyle {
    property: string;
    value: string;
    selector: string;
    specificity: [number, number, number];
    sourceIndex: number;
    important: boolean;
}

export interface ElementStyles {
    element: HTMLElement;
    styles: Record<string, ResolvedStyle>;
}

interface CssRule {
    selector: string;
    specificity: [number, number, number];
    declarations: Array<{ property: string; value: string; important: boolean }>;
    sourceIndex: number;
}

function computeSpecificity(selector: string): [number, number, number] {
    let result: [number, number, number] = [0, 0, 0];
    selectorParser((selectors) => {
        const first = selectors.first;
        if (first) {
            const s = selectorSpecificity(first);
            result = [s.a, s.b, s.c];
        }
    }).processSync(selector);
    return result;
}

function parseRules(css: string, sourceIndexOffset: number = 0): CssRule[] {
    const rules: CssRule[] = [];
    let ruleIndex = sourceIndexOffset;

    const root = postcss.parse(css);
    root.walkRules((rule: Rule) => {
        const declarations: CssRule['declarations'] = [];
        rule.walkDecls((decl: Declaration) => {
            declarations.push({
                property: decl.prop,
                value: decl.value,
                important: decl.important,
            });
        });

        for (const selector of rule.selectors) {
            const trimmed = selector.trim();
            if (!trimmed) continue;
            rules.push({
                selector: trimmed,
                specificity: computeSpecificity(trimmed),
                declarations,
                sourceIndex: ruleIndex,
            });
        }
        ruleIndex++;
    });

    return rules;
}

function parseInlineStyles(style: string): Array<{ property: string; value: string }> {
    const declarations: Array<{ property: string; value: string }> = [];
    for (const part of style.split(';')) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const prop = part.substring(0, colonIdx).trim();
        const val = part.substring(colonIdx + 1).trim();
        if (prop && val) {
            declarations.push({ property: prop, value: val });
        }
    }
    return declarations;
}

function matchesSelector(element: HTMLElement, selector: string, root: HTMLElement): boolean {
    try {
        const matches = root.querySelectorAll(selector);
        return matches.some((el) => el === element);
    } catch {
        return false;
    }
}

function compareSpecificity(a: [number, number, number], b: [number, number, number]): number {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
}

/**
 * Resolve the cascade for a single element.
 * Returns the winning value for each CSS property.
 */
function resolveForElement(
    element: HTMLElement,
    rules: CssRule[],
    root: HTMLElement,
): Record<string, ResolvedStyle> {
    const resolved: Record<string, ResolvedStyle> = {};

    const matchingRules = rules.filter((rule) => matchesSelector(element, rule.selector, root));

    matchingRules.sort((a, b) => {
        const specCmp = compareSpecificity(a.specificity, b.specificity);
        if (specCmp !== 0) return specCmp;
        return a.sourceIndex - b.sourceIndex;
    });

    for (const rule of matchingRules) {
        for (const decl of rule.declarations) {
            const existing = resolved[decl.property];
            if (existing?.important && !decl.important) continue;

            resolved[decl.property] = {
                property: decl.property,
                value: decl.value,
                selector: rule.selector,
                specificity: rule.specificity,
                sourceIndex: rule.sourceIndex,
                important: decl.important,
            };
        }
    }

    const inlineStyle = element.getAttribute('style');
    if (inlineStyle) {
        const inlineDecls = parseInlineStyles(inlineStyle);
        for (const decl of inlineDecls) {
            const existing = resolved[decl.property];
            if (existing?.important) continue;

            resolved[decl.property] = {
                property: decl.property,
                value: decl.value,
                selector: '[inline]',
                specificity: [1, 0, 0, 0] as any,
                sourceIndex: Infinity,
                important: false,
            };
        }
    }

    return resolved;
}

/**
 * Parse CSS sources and an HTML document, resolve the cascade for every element.
 */
export function resolveCascade(
    cssSources: string[],
    html: string,
): Map<HTMLElement, Record<string, ResolvedStyle>> {
    let offset = 0;
    const allRules: CssRule[] = [];
    for (const css of cssSources) {
        const rules = parseRules(css, offset);
        allRules.push(...rules);
        offset += rules.length;
    }

    const root = parseHtml(html, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });

    const body = root.querySelector('body') || root;
    const result = new Map<HTMLElement, Record<string, ResolvedStyle>>();

    function walk(el: HTMLElement) {
        const resolved = resolveForElement(el, allRules, body);
        if (Object.keys(resolved).length > 0) {
            result.set(el, resolved);
        }
        for (const child of el.childNodes) {
            if (child.nodeType === 1) walk(child as HTMLElement);
        }
    }

    for (const child of body.childNodes) {
        if (child.nodeType === 1) walk(child as HTMLElement);
    }

    return result;
}

/**
 * Convenience: resolve cascade for a single element found by selector.
 */
export function resolveElementStyles(
    cssSources: string[],
    html: string,
    targetSelector: string,
): Record<string, ResolvedStyle> | undefined {
    let offset = 0;
    const allRules: CssRule[] = [];
    for (const css of cssSources) {
        const rules = parseRules(css, offset);
        allRules.push(...rules);
        offset += rules.length;
    }

    const root = parseHtml(html, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });
    const body = root.querySelector('body') || root;
    const target = body.querySelector(targetSelector);
    if (!target) return undefined;

    return resolveForElement(target, allRules, body);
}
