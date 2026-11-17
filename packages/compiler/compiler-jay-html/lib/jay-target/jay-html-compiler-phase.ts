/**
 * Phase-aware helpers — skip hydrate/coordinate for non-interactive bindings.
 * Extracted from jay-html-compiler.ts (Design Log #118).
 * Used by hydrate and server compilation targets.
 */
import { Contract, ContractTag, getEffectivePhase, type RenderingPhase } from '../contract';
import { camelCase } from '../case-utils';

/**
 * Walk contract tags and collect property paths whose effective phase is 'fast+interactive'.
 * These are the only bindings that need client-side adoption (adoptText / jay-coordinate).
 */
export function buildInteractivePaths(contract?: Contract): Set<string> {
    const paths = new Set<string>();
    if (!contract) return paths;

    function walk(tags: ContractTag[], parentPhase?: RenderingPhase) {
        for (const tag of tags) {
            const phase = getEffectivePhase(tag, parentPhase);
            const name = camelCase(tag.tag);
            if (phase === 'fast+interactive') {
                paths.add(name);
            }
            if (tag.tags) {
                walk(tag.tags, phase);
            }
        }
    }
    walk(contract.tags);
    return paths;
}

/**
 * Interactive root paths for a page: the page contract's paths plus the `key` of every keyed
 * headless import that may change on the client (DL#236). Without the keys, a page contract with
 * interactive tags makes the set non-empty and every `{key.x}` text / `if="key.x"` is wrongly
 * skipped as non-interactive. An empty page set already means "treat all as interactive", so it is
 * returned unchanged.
 */
export function buildPageInteractivePaths(
    contract: Contract | undefined,
    headlessImports: { key?: string; contract?: Contract }[],
): Set<string> {
    const paths = buildInteractivePaths(contract);
    if (paths.size === 0) return paths;
    for (const headless of headlessImports) {
        if (headless.key && mayChangeOnClient(headless.contract)) paths.add(headless.key);
    }
    return paths;
}

/** An unresolved contract is treated as interactive — freezing live data is worse than adopting static data. */
function mayChangeOnClient(contract: Contract | undefined): boolean {
    return !contract || buildInteractivePaths(contract).size > 0;
}

/**
 * Check whether a text string contains any `{expr}` binding whose property path
 * is in the interactive set. When `interactivePaths` is empty every binding is
 * considered non-interactive (no contract → all bindings are from fast/slow only).
 */
export function textHasInteractiveBindings(text: string, interactivePaths: Set<string>): boolean {
    if (interactivePaths.size === 0) return false;
    const re = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        // The binding expression may be `vs.prop` or just `prop`; take the root identifier.
        const expr = m[1].trim();
        const root = expr.split('.')[0].split('[')[0];
        if (interactivePaths.has(root)) return true;
    }
    return false;
}

/**
 * Extract all root identifiers from a condition expression.
 * Handles `prop`, `!prop`, `a && b`, `a || b`, comparisons, etc.
 */
export function extractConditionIdentifiers(condition: string): string[] {
    // Match word characters that start an identifier (not preceded by . which would make it a sub-property)
    const ids: string[] = [];
    const re = /(?<![.\w])([a-zA-Z_]\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(condition)) !== null) {
        // Skip JS keywords/literals
        if (['true', 'false', 'null', 'undefined', 'typeof', 'instanceof'].includes(m[1])) continue;
        ids.push(m[1]);
    }
    return ids;
}

/**
 * Check whether a conditional's `if=` expression references any interactive property.
 * When `interactivePaths` is empty (no contract), all conditionals are treated as interactive.
 */
export function conditionIsInteractive(condition: string, interactivePaths: Set<string>): boolean {
    if (interactivePaths.size === 0) return true;
    return extractConditionIdentifiers(condition).some((id) => interactivePaths.has(id));
}

/**
 * Simplify a condition expression for hydration by dropping non-interactive `&&` terms.
 * E.g. `slowFlag && fastFlag && interactiveFlag` → `interactiveFlag` when only
 * `interactiveFlag` is interactive. Non-interactive terms are always true on the client.
 * Returns the original condition if it can't be simplified (no `&&`, or `||` present).
 */
export function simplifyConditionForHydrate(
    condition: string,
    interactivePaths: Set<string>,
): string {
    if (interactivePaths.size === 0) return condition;
    // Only simplify pure && expressions (don't touch || which has different semantics)
    if (condition.includes('||')) return condition;
    const terms = condition.split('&&').map((t) => t.trim());
    const interactiveTerms = terms.filter((term) => {
        const ids = extractConditionIdentifiers(term);
        return ids.some((id) => interactivePaths.has(id));
    });
    if (interactiveTerms.length === 0) return condition;
    return interactiveTerms.join(' && ');
}
