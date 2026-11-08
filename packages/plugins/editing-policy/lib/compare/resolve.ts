import {
    ParsedSelector,
    parseSelector,
    selectorMatches,
    selectorSpecificity,
    compareSpecificity,
} from '../policy/selector.js';
import { RoleSelectorRule, RuleName } from '../policy/schema.js';
import { Change, ChangeKind } from '../changes/types.js';

export interface CompiledRule {
    selector: ParsedSelector;
    rules: Record<string, string>;
    spec: number[];
}

/** Compile a role's entries into matchable rules (skips entries with no selector). */
export function compileRole(entries: RoleSelectorRule[]): CompiledRule[] {
    return entries
        .filter((e) => typeof e.selector === 'string' && e.selector.trim() !== '')
        .map((e) => {
            const selector = parseSelector(e.selector);
            return {
                selector,
                rules: e.rules as Record<string, string>,
                spec: selectorSpecificity(selector),
            };
        });
}

/** The rule that governs a change kind. `sync` is always allowed, so it has no rule. */
export function ruleForKind(kind: ChangeKind): RuleName | undefined {
    switch (kind) {
        case 'content':
            return 'content';
        case 'design':
            return 'design';
        case 'css':
            return 'css';
        case 'code':
            return 'code';
        case 'dependency':
            return 'dependencies';
        case 'config':
            return 'config';
        case 'create':
            return 'create';
        case 'delete':
            return 'delete';
        case 'rename':
            return 'rename';
        case 'policy':
            return 'policy';
        case 'sync':
            return undefined;
        default:
            return undefined;
    }
}

/** Strictness rank — higher is more restrictive. Breaks specificity ties ("stricter value wins"). */
function rank(rule: string, value: string): number {
    if (rule === 'edit') return 3;
    if (value === 'no' || value === 'block') return 3;
    if (value === 'designSystemOnly' || value === 'from-template' || value === 'review') return 2;
    if (value === 'yes' || value === 'any' || value === 'direct') return 0;
    return 1;
}

interface Candidate {
    rule: CompiledRule;
    key: string;
    value: string;
}

function mostSpecific(cands: Candidate[]): Candidate | undefined {
    let best: Candidate | undefined;
    for (const c of cands) {
        if (!best) {
            best = c;
            continue;
        }
        const s = compareSpecificity(c.rule.spec, best.rule.spec);
        if (s > 0 || (s === 0 && rank(c.key, c.value) > rank(best.key, best.value))) best = c;
    }
    return best;
}

export function matchingRules(compiled: CompiledRule[], change: Change): CompiledRule[] {
    return compiled.filter((c) =>
        selectorMatches(c.selector, { path: change.path, section: change.section }),
    );
}

/** Resolve a single rule's effective value for a change (most specific; tie → stricter). */
export function resolveRule(
    compiled: CompiledRule[],
    change: Change,
    ruleName: string,
): { value?: string; selector?: string } {
    const matches = matchingRules(compiled, change);
    const cands = matches
        .filter((r) => ruleName in r.rules)
        .map((r) => ({ rule: r, key: ruleName, value: r.rules[ruleName] }));
    const winner = mostSpecific(cands);
    return winner ? { value: winner.value, selector: winner.rule.selector.raw } : {};
}

export interface Decision {
    allowed: boolean;
    /** The rule id that decided (e.g. `content`, `edit`, `create:from-template`, `unset`). */
    ruleId: string;
    selector?: string;
    /** For a violation: 'block' or 'review' (from onViolation). */
    onViolation: 'block' | 'review';
}

/**
 * Decide whether a change is allowed for a role (DL#231 §6.1 Resolution). Factors `edit: no` (freezes
 * the selector for any change) alongside the governing rule; fail-closed when no selector speaks.
 * `designSystemOnly` / `create: from-template` are not yet verifiable here (token/region analysis is a
 * follow-up), so they resolve to a (non-blocking) review — the DL's "ambiguous → stricter" default.
 */
export function decide(compiled: CompiledRule[], change: Change): Decision {
    const onViolation =
        (resolveRule(compiled, change, 'onViolation').value as 'block' | 'review') ?? 'review';

    if (change.kind === 'sync') {
        return { allowed: true, ruleId: 'sync', onViolation };
    }

    const ruleName = ruleForKind(change.kind);
    if (!ruleName) return { allowed: true, ruleId: change.kind, onViolation };

    const matches = matchingRules(compiled, change);
    const cands: Candidate[] = [];
    for (const r of matches) {
        if (ruleName in r.rules) cands.push({ rule: r, key: ruleName, value: r.rules[ruleName] });
        if ('edit' in r.rules) cands.push({ rule: r, key: 'edit', value: r.rules.edit });
    }
    const winner = mostSpecific(cands);

    if (!winner) {
        // fail-closed: no matching selector sets this rule
        return { allowed: false, ruleId: `${ruleName}:unset`, onViolation };
    }
    if (winner.key === 'edit') {
        return {
            allowed: false,
            ruleId: 'edit:no',
            selector: winner.rule.selector.raw,
            onViolation,
        };
    }

    const value = winner.value;
    const selector = winner.rule.selector.raw;
    if (value === 'yes' || value === 'any') {
        return { allowed: true, ruleId: `${ruleName}:${value}`, selector, onViolation };
    }
    if (value === 'no') {
        return { allowed: false, ruleId: `${ruleName}:no`, selector, onViolation };
    }
    // designSystemOnly / from-template: not yet verifiable → conservative review (never below review)
    return {
        allowed: false,
        ruleId: `${ruleName}:${value}`,
        selector,
        onViolation: 'review',
    };
}
