import selectorParser from 'postcss-selector-parser';

/** A selector's last compound (after the last combinator), as parser nodes. */
export type Compound = selectorParser.Node[];

/** The last compound of a single selector, or undefined when it does not parse. */
export function lastCompound(selector: string): Compound | undefined {
    try {
        const root = selectorParser().astSync(selector);
        const nodes = root.first?.nodes ?? [];
        const lastCombinator = findLastIndex(nodes, (n) => n.type === 'combinator');
        return nodes.slice(lastCombinator + 1).filter((n) => n.type !== 'comment');
    } catch {
        return undefined;
    }
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) if (predicate(items[i])) return i;
    return -1;
}

/** A top-level pseudo-class of the compound named `name` (`:not(:focus)` does not count as `:focus`). */
export function hasPseudo(compound: Compound, name: string): boolean {
    return compound.some((n) => n.type === 'pseudo' && n.value.toLowerCase() === name);
}

export function hasAnyPseudo(compound: Compound): boolean {
    return compound.some((n) => n.type === 'pseudo');
}

/** `:not(<inner>)` at the top level of the compound, e.g. `:not(:focus-visible)`. */
export function hasNegatedPseudo(compound: Compound, inner: string): boolean {
    return compound.some(
        (n) => n.type === 'pseudo' && n.value.toLowerCase() === ':not' && String(n).includes(inner),
    );
}

/**
 * The compound without `removedPseudo`, its simple selectors sorted and serialized; `*` when nothing
 * but the universal selector remains (`*:focus` and `:focus` both key to `*`).
 */
export function compoundKey(compound: Compound, removedPseudo?: string): string {
    const parts = compound
        .filter((n) => !(n.type === 'pseudo' && n.value.toLowerCase() === removedPseudo))
        .filter((n) => n.type !== 'universal')
        .map((n) => String(n).trim())
        .sort();
    return parts.length === 0 ? '*' : parts.join('');
}
