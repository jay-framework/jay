import postcss, { type ChildNode, type Container, type Rule } from 'postcss';
import type { CssSource } from './css-sources.js';

export interface CssDeclaration {
    property: string;
    value: string;
}

/** A style rule with CSS Nesting resolved: full selectors, its own declarations, its source line. */
export interface FlatRule {
    selectors: string[];
    declarations: CssDeclaration[];
    line: number | undefined;
    source: CssSource;
}

/**
 * Parses one source and flattens nesting (DL#239): `&` is replaced by each parent selector, a nested
 * selector without `&` gets an implicit `& ` prefix, lists are cross-multiplied, and rules inside
 * at-rules are kept as if unconditional. Unparseable CSS yields no rules (rules never fire on it).
 */
export function flattenRules(source: CssSource): FlatRule[] {
    let root: postcss.Root;
    try {
        root = postcss.parse(source.css);
    } catch {
        return [];
    }
    const rules: FlatRule[] = [];
    collectRules(root, [], source, rules);
    return rules;
}

export function flattenAll(sources: CssSource[]): FlatRule[] {
    return sources.flatMap(flattenRules);
}

function collectRules(
    container: Container,
    parentSelectors: string[],
    source: CssSource,
    into: FlatRule[],
): void {
    for (const node of container.nodes ?? []) {
        if (node.type === 'rule') {
            const selectors = resolveSelectors(node as Rule, parentSelectors);
            into.push({
                selectors,
                declarations: ownDeclarations(node),
                line: node.source?.start?.line,
                source,
            });
            collectRules(node as Rule, selectors, source, into);
        } else if (node.type === 'atrule') {
            collectRules(node as Container, parentSelectors, source, into);
        }
    }
}

function resolveSelectors(rule: Rule, parentSelectors: string[]): string[] {
    const own = rule.selectors.map((s) => s.trim());
    if (parentSelectors.length === 0) return own;
    return parentSelectors.flatMap((parent) =>
        own.map((child) =>
            child.includes('&') ? child.split('&').join(parent) : `${parent} ${child}`,
        ),
    );
}

function ownDeclarations(node: ChildNode): CssDeclaration[] {
    return ((node as Container).nodes ?? [])
        .filter((child) => child.type === 'decl')
        .map((decl) => ({
            property: (decl as postcss.Declaration).prop.toLowerCase(),
            value: (decl as postcss.Declaration).value.trim(),
        }));
}

/** The last declaration of any of `properties` in the rule (the one that wins in the cascade). */
export function lastDeclaration(rule: FlatRule, properties: string[]): CssDeclaration | undefined {
    return [...rule.declarations].reverse().find((d) => properties.includes(d.property));
}

/** Parses a `style=""` value as a declaration list. Unparseable → empty. */
export function parseInlineStyle(style: string): CssDeclaration[] {
    const source: CssSource = { label: 'inline', css: `x{${style}}`, reportsLines: false };
    return flattenRules(source)[0]?.declarations ?? [];
}
