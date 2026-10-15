import type { JayHtmlValidationContext, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const FOCUS_PSEUDOS = new Set(['focus', 'focus-within', 'focus-visible']);
const MAX_CSS_PARSE_CACHE = 16;

function pseudoAttributeName(pseudoValue: string): string {
    return pseudoValue.replace(/^::?/, '').toLowerCase();
}

function declaresReveal(declarations: postcss.Declaration[]): boolean {
    for (const decl of declarations) {
        const prop = decl.prop.toLowerCase();
        const value = decl.value.trim().toLowerCase();
        if (prop === 'display' && value !== 'none') return true;
        if (prop === 'visibility' && value !== 'hidden' && value !== 'collapse') return true;
        if (prop === 'opacity') {
            const numeric = parseFloat(value);
            if (!Number.isNaN(numeric) && numeric > 0) return true;
        }
    }
    return false;
}

function declaresHide(declarations: postcss.Declaration[]): boolean {
    for (const decl of declarations) {
        const prop = decl.prop.toLowerCase();
        const value = decl.value.trim().toLowerCase();
        if (prop === 'display' && value === 'none') return true;
        if (prop === 'visibility' && (value === 'hidden' || value === 'collapse')) return true;
        if (prop === 'opacity') {
            const numeric = parseFloat(value);
            if (!Number.isNaN(numeric) && numeric === 0) return true;
        }
    }
    return false;
}

function splitSelectorCompounds(selector: string): string[] {
    const root = selectorParser().astSync(selector);
    const compounds: string[] = [];
    for (const node of root.nodes) {
        if (node.type !== 'selector') continue;
        let parts: selectorParser.Node[] = [];
        for (const part of node.nodes) {
            if (part.type === 'combinator') {
                if (parts.length > 0) {
                    compounds.push(parts.map((p) => p.toString()).join(''));
                    parts = [];
                }
            } else {
                parts.push(part);
            }
        }
        if (parts.length > 0) {
            compounds.push(parts.map((p) => p.toString()).join(''));
        }
    }
    return compounds;
}

function normalizeCompound(compound: string): string {
    return compound.replace(/\s+/g, ' ').trim();
}

function selectorContainsFocusPseudo(selector: string): boolean {
    if (!selector.includes('focus')) return false;
    let found = false;
    try {
        selectorParser((selectors) => {
            selectors.walkPseudos((pseudo) => {
                if (FOCUS_PSEUDOS.has(pseudoAttributeName(pseudo.value))) found = true;
            });
        }).processSync(selector);
    } catch {
        return false;
    }
    return found;
}

function compoundTextHasHover(compound: string): boolean {
    let found = false;
    try {
        selectorParser((selectors) => {
            selectors.walkPseudos((pseudo) => {
                if (pseudo.value === ':hover' || pseudo.value === 'hover') found = true;
            });
        }).processSync(compound);
    } catch {
        return false;
    }
    return found;
}

function compoundHasHoverInExcludedContext(compound: string): boolean {
    let excluded = false;
    try {
        selectorParser((selectors) => {
            selectors.walkPseudos((pseudo) => {
                if (pseudo.value !== ':hover' && pseudo.value !== 'hover') return;
                let parent = pseudo.parent;
                while (parent) {
                    if (parent.type === 'pseudo') {
                        const parentName = pseudoAttributeName(
                            (parent as selectorParser.Pseudo).value,
                        );
                        if (parentName === 'not' || parentName === 'has') {
                            excluded = true;
                            return false;
                        }
                    }
                    parent = parent.parent;
                }
            });
        }).processSync(compound);
    } catch {
        return false;
    }
    return excluded;
}

function compoundTextHasFocusPseudo(compound: string): boolean {
    let found = false;
    try {
        selectorParser((selectors) => {
            selectors.walkPseudos((pseudo) => {
                if (FOCUS_PSEUDOS.has(pseudoAttributeName(pseudo.value))) found = true;
            });
        }).processSync(compound);
    } catch {
        return false;
    }
    return found;
}

function lastCompoundHasDecorativePseudoElement(compound: string): boolean {
    let found = false;
    try {
        selectorParser((selectors) => {
            selectors.walkPseudos((pseudo) => {
                const name = pseudoAttributeName(pseudo.value);
                if (name === 'before' || name === 'after') found = true;
            });
        }).processSync(compound);
    } catch {
        return false;
    }
    return found;
}

function normalizeSelectorKey(selector: string): string {
    return selector.replace(/\s+/g, ' ').trim();
}

function serializeWithoutPseudo(
    selector: string,
    remove: (name: string) => boolean,
): string | undefined {
    const parsed = selectorParser((selectors) => {
        selectors.walk((sel) => {
            if (sel.type !== 'selector') return;
            const selectorNode = sel as selectorParser.Selector;
            selectorNode.nodes = selectorNode.nodes.filter((node) => {
                if (node.type !== 'pseudo') return true;
                const name = pseudoAttributeName(node.value);
                return !remove(name);
            });
        });
    });
    try {
        return normalizeSelectorKey(parsed.processSync(selector));
    } catch {
        return undefined;
    }
}

function isSelfPairedHover(selector: string): boolean {
    let paired = false;
    try {
        selectorParser((selectors) => {
            selectors.walk((sel) => {
                if (sel.type !== 'selector') return;
                const selectorNode = sel as selectorParser.Selector;
                let hasHover = false;
                let hasFocus = false;
                selectorNode.walkPseudos((pseudo) => {
                    const name = pseudoAttributeName(pseudo.value);
                    if (name === 'hover') hasHover = true;
                    if (FOCUS_PSEUDOS.has(name)) hasFocus = true;
                });
                if (hasHover && hasFocus) paired = true;
            });
        }).processSync(selector);
    } catch {
        return false;
    }
    return paired;
}

function selectorHasHover(selector: string): boolean {
    return selector.includes(':hover');
}

const cssParseCache = new Map<string, postcss.Root>();

function parseCssCached(css: string): postcss.Root | undefined {
    const cached = cssParseCache.get(css);
    if (cached) return cached;
    if (cssParseCache.size >= MAX_CSS_PARSE_CACHE) {
        const oldest = cssParseCache.keys().next().value;
        if (oldest !== undefined) {
            cssParseCache.delete(oldest);
        }
    }
    try {
        const root = postcss.parse(css);
        cssParseCache.set(css, root);
        return root;
    } catch {
        return undefined;
    }
}

/**
 * Flags CSS that reveals content on :hover without a matching focus twin
 * (keyboard and touch users). Algorithm matches DL#221 hover-only-disclosure spec.
 */
export function checkHoverOnlyDisclosureCss(
    ctx: JayHtmlValidationContext,
): JayHtmlValidationFinding[] {
    const css = ctx.css?.trim();
    if (!css) return [];
    if (!css.includes(':hover') && !css.includes('focus')) return [];

    const root = parseCssCached(css);
    if (!root) return [];

    const twinKeys = new Set<string>();
    root.walkRules((rule) => {
        for (const selector of rule.selectors) {
            if (!selectorContainsFocusPseudo(selector)) continue;
            const key = serializeWithoutPseudo(selector, (name) => FOCUS_PSEUDOS.has(name));
            if (key) twinKeys.add(key);
        }
    });

    const hiddenLastCompounds = new Set<string>();
    root.walkRules((rule) => {
        if (!declaresHide(rule.nodes.filter((n): n is postcss.Declaration => n.type === 'decl'))) {
            return;
        }
        for (const selector of rule.selectors) {
            if (selectorHasHover(selector)) continue;
            const compounds = splitSelectorCompounds(selector);
            const last = compounds[compounds.length - 1];
            if (last) hiddenLastCompounds.add(normalizeCompound(last));
        }
    });

    const findings: JayHtmlValidationFinding[] = [];
    const reportedSelectors = new Set<string>();

    root.walkRules((rule) => {
        if (!declaresReveal(rule.nodes.filter((n): n is postcss.Declaration => n.type === 'decl'))) {
            return;
        }

        for (const selector of rule.selectors) {
            if (!selector.includes(':hover')) continue;
            if (isSelfPairedHover(selector)) continue;

            const compounds = splitSelectorCompounds(selector);
            if (compounds.length < 2) continue;

            const lastCompound = compounds[compounds.length - 1];
            if (lastCompoundHasDecorativePseudoElement(lastCompound)) continue;
            if (!hiddenLastCompounds.has(normalizeCompound(lastCompound))) continue;

            for (let index = 0; index < compounds.length - 1; index++) {
                const compound = compounds[index];
                if (!compoundTextHasHover(compound)) continue;
                if (compoundHasHoverInExcludedContext(compound)) continue;
                if (compoundTextHasFocusPseudo(compound)) continue;

                const hoverKey = serializeWithoutPseudo(selector, (name) => name === 'hover');
                if (hoverKey && twinKeys.has(hoverKey)) continue;

                if (reportedSelectors.has(selector)) break;
                reportedSelectors.add(selector);

                findings.push({
                    severity: 'warning',
                    ruleId: 'a11y/allow-hover-only-disclosure',
                    suppressKey: 'allow-hover-only-disclosure',
                    message: `Hover-only disclosure — add a :focus-within twin for selector "${selector}" (WCAG 2.1.1)`,
                    suggestion:
                        'Mirror the reveal rule with .parent:focus-within …, or use :is(:hover, :focus-within). ' +
                        'Prefer <details>, popover, or a visible keyboard path.',
                });
                break;
            }
        }
    });

    return findings;
}
