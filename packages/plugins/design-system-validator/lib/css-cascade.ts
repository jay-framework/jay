import postcss, { type Rule, type Declaration, type Comment, type AtRule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { selectorSpecificity } from '@csstools/selector-specificity';
import type { HTMLElement } from 'node-html-parser';

export interface ResolvedStyle {
    property: string;
    value: string;
    selector: string;
    specificity: [number, number, number];
    sourceIndex: number;
    important: boolean;
    allowed: boolean;
}

interface CssRule {
    selector: string;
    specificity: [number, number, number];
    declarations: Array<{ property: string; value: string; important: boolean; allowed: boolean }>;
    sourceIndex: number;
    mediaQuery?: string;
}

const ALLOW_COMMENT = 'design-system: allow';

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

function hasAllowComment(decl: Declaration): boolean {
    const next = decl.next();
    if (next?.type === 'comment' && (next as Comment).text.trim() === ALLOW_COMMENT) {
        return true;
    }
    const raw = decl.raws.value;
    if (raw && typeof raw === 'object' && 'raw' in raw) {
        const rawStr = (raw as any).raw as string;
        if (rawStr.includes(`/*${ALLOW_COMMENT}*/`) || rawStr.includes(`/* ${ALLOW_COMMENT} */`)) {
            return true;
        }
    }
    return false;
}

function getMediaQuery(rule: Rule): string | undefined {
    let node: postcss.Container | postcss.Document | undefined = rule.parent;
    while (node && 'type' in node) {
        if (node.type === 'atrule' && (node as AtRule).name === 'media') {
            return (node as AtRule).params;
        }
        node = (node as any).parent;
    }
    return undefined;
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
                allowed: hasAllowComment(decl),
            });
        });

        const mediaQuery = getMediaQuery(rule);

        for (const selector of rule.selectors) {
            const trimmed = selector.trim();
            if (!trimmed) continue;
            rules.push({
                selector: trimmed,
                specificity: computeSpecificity(trimmed),
                declarations,
                sourceIndex: ruleIndex,
                mediaQuery,
            });
        }
        ruleIndex++;
    });

    return rules;
}

function parseInlineStyles(
    style: string,
): Array<{ property: string; value: string; allowed: boolean }> {
    const declarations: Array<{ property: string; value: string; allowed: boolean }> = [];
    for (const part of style.split(';')) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const prop = part.substring(0, colonIdx).trim();
        const val = part.substring(colonIdx + 1).trim();
        if (prop && val) {
            declarations.push({ property: prop, value: val, allowed: false });
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
                allowed: decl.allowed,
            };
        }
    }

    const jayDesignAllow = element.getAttribute('jay-design') === 'allow';
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
                specificity: [1, 0, 0],
                sourceIndex: Infinity,
                important: false,
                allowed: jayDesignAllow,
            };
        }
    }

    return resolved;
}

export function resolveCascade(
    cssSources: string[],
    root: HTMLElement,
): Map<HTMLElement, Record<string, ResolvedStyle>> {
    let offset = 0;
    const allRules: CssRule[] = [];
    for (const css of cssSources) {
        const rules = parseRules(css, offset);
        allRules.push(...rules);
        offset += rules.length;
    }

    const result = new Map<HTMLElement, Record<string, ResolvedStyle>>();

    function walk(el: HTMLElement) {
        const resolved = resolveForElement(el, allRules, root);
        if (Object.keys(resolved).length > 0) {
            result.set(el, resolved);
        }
        for (const child of el.childNodes) {
            if (child.nodeType === 1) walk(child as HTMLElement);
        }
    }

    for (const child of root.childNodes) {
        if (child.nodeType === 1) walk(child as HTMLElement);
    }

    return result;
}

/**
 * Resolve cascade per media query breakpoint.
 * Returns a map of breakpoint condition → per-element resolved styles.
 * The base (no media query) is keyed as undefined.
 */
export function resolveCascadeByBreakpoint(
    cssSources: string[],
    root: HTMLElement,
): Map<string | undefined, Map<HTMLElement, Record<string, ResolvedStyle>>> {
    let offset = 0;
    const allRules: CssRule[] = [];
    for (const css of cssSources) {
        const rules = parseRules(css, offset);
        allRules.push(...rules);
        offset += rules.length;
    }

    const breakpoints = new Set<string | undefined>();
    for (const rule of allRules) {
        breakpoints.add(rule.mediaQuery);
    }

    const result = new Map<string | undefined, Map<HTMLElement, Record<string, ResolvedStyle>>>();

    for (const breakpoint of breakpoints) {
        const rulesForBreakpoint = allRules.filter(
            (r) => r.mediaQuery === undefined || r.mediaQuery === breakpoint,
        );

        const breakpointResult = new Map<HTMLElement, Record<string, ResolvedStyle>>();

        function walk(el: HTMLElement) {
            const resolved = resolveForElement(el, rulesForBreakpoint, root);
            if (Object.keys(resolved).length > 0) {
                breakpointResult.set(el, resolved);
            }
            for (const child of el.childNodes) {
                if (child.nodeType === 1) walk(child as HTMLElement);
            }
        }

        for (const child of root.childNodes) {
            if (child.nodeType === 1) walk(child as HTMLElement);
        }

        result.set(breakpoint, breakpointResult);
    }

    return result;
}
