import postcss, { type AtRule, type Container, type Declaration, type Node, type Rule } from 'postcss';
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

/**
 * DL#238 — reduced-motion checks on page CSS.
 *
 * Only **movement** counts (transform, scroll, scroll-driven and view transitions). Opacity/colour fades
 * never trigger a rule. Each declaration is reported by at most one rule; findings come in rule-table
 * order, then source order. Pages only: a component's `ctx.css` lacks the page/global CSS that may gate it.
 */

const GUIDE = 'See design-system-validator agent-kit/designer/reduced-motion.md.';

const SUPPRESS_KEYS = {
    missing: 'allow-no-reduced-motion',
    blanketReset: 'allow-blanket-motion-reset',
    smoothScroll: 'allow-smooth-scroll',
    scrollTimeline: 'allow-scroll-animation',
    viewTransition: 'allow-view-transition',
    transformKept: 'allow-transform-under-reduce',
} as const;

type RuleKey = keyof typeof SUPPRESS_KEYS;

const MOVEMENT_PROPERTIES = new Set(['transform', 'translate', 'scale', 'rotate', 'all']);
const STATE_PSEUDO_SUFFIX = /(:(hover|focus|focus-visible|active))+$/;

export const validateReducedMotion: JayHtmlValidatorFn = (ctx) => {
    if (!ctx.css) return [];
    if (!ctx.filePath.includes('/pages/') && !ctx.filePath.startsWith('src/pages/')) return [];

    const overrides = ctx.validationOverrides?.['design-system'];
    const enabled = (rule: RuleKey) => overrides?.[SUPPRESS_KEYS[rule]] !== true;

    const sheet = analyzeStylesheet(postcss.parse(ctx.css));
    const findings: JayHtmlValidationFinding[] = [];
    if (enabled('missing')) findings.push(...checkMissing(sheet));
    if (enabled('blanketReset')) findings.push(...checkBlanketReset(sheet));
    if (enabled('smoothScroll')) findings.push(...checkSmoothScroll(sheet));
    if (enabled('scrollTimeline')) findings.push(...checkScrollTimeline(sheet));
    if (enabled('viewTransition')) findings.push(...checkViewTransition(sheet));
    if (enabled('transformKept')) findings.push(...checkTransformKept(sheet));
    return findings;
};

// ── Stylesheet model ─────────────────────────────────────────────────────────────────────────────

interface Stylesheet {
    root: postcss.Root;
    rules: Rule[];
    reduceRules: Rule[];
    hasReducedMotionBlock: boolean;
    movingKeyframes: Map<string, boolean>;
}

function analyzeStylesheet(root: postcss.Root): Stylesheet {
    const rules: Rule[] = [];
    root.walkRules((rule) => {
        if (!isInsideKeyframes(rule)) rules.push(rule);
    });
    let hasReducedMotionBlock = false;
    root.walkAtRules('media', (atRule) => {
        if (/prefers-reduced-motion/i.test(atRule.params)) hasReducedMotionBlock = true;
    });
    return {
        root,
        rules,
        reduceRules: rules.filter(isInReduce),
        hasReducedMotionBlock,
        movingKeyframes: collectKeyframes(root),
    };
}

function collectKeyframes(root: postcss.Root): Map<string, boolean> {
    const keyframes = new Map<string, boolean>();
    root.walkAtRules(/keyframes$/i, (atRule) => {
        let moves = false;
        atRule.walkDecls((decl) => {
            if (MOVEMENT_PROPERTIES.has(decl.prop.toLowerCase())) moves = true;
        });
        keyframes.set(atRule.params.trim(), moves || keyframes.get(atRule.params.trim()) === true);
    });
    return keyframes;
}

function isInsideKeyframes(node: Node): boolean {
    return atRuleAncestors(node, /keyframes$/i).length > 0;
}

function atRuleAncestors(node: Node, name: RegExp = /^media$/i): AtRule[] {
    const found: AtRule[] = [];
    for (let parent = node.parent; parent; parent = parent.parent as Container | undefined) {
        if (parent.type === 'atrule' && name.test((parent as AtRule).name)) {
            found.push(parent as AtRule);
        }
    }
    return found;
}

/** `(prefers-reduced-motion: reduce)` or the bare `(prefers-reduced-motion)`, never `not (...: reduce)`. */
function isReduceMedia(params: string): boolean {
    if (/\bnot\s*\(\s*prefers-reduced-motion/i.test(params)) return false;
    return /\(\s*prefers-reduced-motion\s*(:\s*reduce\s*)?\)/i.test(params);
}

/** `(prefers-reduced-motion: no-preference)` or `not (prefers-reduced-motion: reduce)`. */
function isNoPreferenceMedia(params: string): boolean {
    return (
        /prefers-reduced-motion\s*:\s*no-preference/i.test(params) ||
        /\bnot\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(params)
    );
}

function isInReduce(node: Node): boolean {
    return atRuleAncestors(node).some((media) => isReduceMedia(media.params));
}

function isInNoPreference(node: Node): boolean {
    return atRuleAncestors(node).some((media) => isNoPreferenceMedia(media.params));
}

function normalizeSelector(selector: string): string {
    return selector.trim().replace(/\s+/g, ' ');
}

function selectorsOf(rule: Rule): string[] {
    return rule.selectors.map(normalizeSelector);
}

function declsOf(rule: Rule): Declaration[] {
    return (rule.nodes ?? []).filter((node): node is Declaration => node.type === 'decl');
}

function ruleOf(decl: Declaration): Rule | undefined {
    return decl.parent?.type === 'rule' ? (decl.parent as Rule) : undefined;
}

/** Every selector of `rule` has a reduce rule with the same selector whose `prop` matches `isOff`. */
function overriddenInReduce(
    sheet: Stylesheet,
    rule: Rule,
    props: string[],
    isOff: (value: string) => boolean,
): boolean {
    return selectorsOf(rule).every((selector) =>
        sheet.reduceRules.some(
            (reduceRule) =>
                selectorsOf(reduceRule).includes(selector) &&
                declsOf(reduceRule).some(
                    (decl) => props.includes(decl.prop.toLowerCase()) && isOff(decl.value),
                ),
        ),
    );
}

// ── Movement detection ───────────────────────────────────────────────────────────────────────────

const TIME = /^-?[\d.]+m?s$/i;
const EASING = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/i;
const ANIMATION_KEYWORDS =
    /^(none|infinite|normal|reverse|alternate|alternate-reverse|forwards|backwards|both|running|paused|initial|inherit|unset)$/i;
const CSS_FUNCTION = /[\w-]+\([^)]*\)/g;

function listItems(value: string): string[][] {
    return value
        .replace(CSS_FUNCTION, ' ')
        .split(',')
        .map((item) => item.trim().split(/\s+/).filter(Boolean));
}

function transitionedProperties(value: string): string[] {
    if (value.trim().toLowerCase() === 'none') return [];
    return listItems(value).map(
        (tokens) => tokens.find((token) => !TIME.test(token) && !EASING.test(token)) ?? 'all',
    );
}

function animationNames(decl: Declaration): string[] {
    if (decl.prop.toLowerCase() === 'animation-name') {
        return decl.value.split(',').map((name) => name.trim()).filter((n) => n !== 'none');
    }
    return listItems(decl.value)
        .map((tokens) =>
            tokens.find(
                (t) =>
                    !TIME.test(t) &&
                    !EASING.test(t) &&
                    !ANIMATION_KEYWORDS.test(t) &&
                    !/^[\d.]+$/.test(t),
            ),
        )
        .filter((name): name is string => name != null);
}

function isZeroDuration(value: string): boolean {
    return value.split(',').every((part) => /^\s*0(\.0+)?m?s?\s*$/i.test(part));
}

/** A transition/animation declaration that moves (DL#238 movement table). */
function isMovement(decl: Declaration, sheet: Stylesheet): boolean {
    if (isInReduce(decl)) return false;
    const rule = ruleOf(decl);
    if (!rule) return false;
    const prop = decl.prop.toLowerCase();
    const ruleProps = declsOf(rule).map((d) => d.prop.toLowerCase());

    if (prop === 'transition' || prop === 'transition-property') {
        return transitionedProperties(decl.value).some((p) =>
            MOVEMENT_PROPERTIES.has(p.toLowerCase()),
        );
    }
    if (prop === 'transition-duration') {
        const limitedByProperty =
            ruleProps.includes('transition-property') || ruleProps.includes('transition');
        return !limitedByProperty && !isZeroDuration(decl.value);
    }
    if (prop === 'animation' || prop === 'animation-name') {
        if (ruleProps.includes('animation-timeline')) return false;
        return animationNames(decl).some((name) => sheet.movingKeyframes.get(name) !== false);
    }
    return false;
}

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────

function suppressHint(rule: RuleKey): string {
    return `If intentional, suppress with design-system: { ${SUPPRESS_KEYS[rule]}: true } in <script type="application/jay-validations">.`;
}

function finding(rule: RuleKey, message: string, fix: string): JayHtmlValidationFinding {
    return { severity: 'warning', message, suggestion: `${fix} ${GUIDE} ${suppressHint(rule)}` };
}

function checkMissing(sheet: Stylesheet): JayHtmlValidationFinding[] {
    if (sheet.hasReducedMotionBlock) return [];
    let moves = false;
    sheet.root.walkDecls((decl) => {
        if (!isInsideKeyframes(decl) && isMovement(decl, sheet)) moves = true;
    });
    if (!moves) return [];
    return [
        finding(
            'missing',
            '[reduced-motion/missing] Page moves elements (transform/animation) but has no @media (prefers-reduced-motion) rules',
            'Put movement inside @media (prefers-reduced-motion: no-preference) { ... }, or override each moving selector inside @media (prefers-reduced-motion: reduce). Keep opacity/color fades. Do not use a "*" reset.',
        ),
    ];
}

function checkBlanketReset(sheet: Stylesheet): JayHtmlValidationFinding[] {
    const seen = new Set<string>();
    for (const rule of sheet.reduceRules) {
        const targetsEverything = selectorsOf(rule).some((s) => s === '*' || /^\*:/.test(s));
        const resetsMotion = declsOf(rule).some((d) => /^(transition|animation)/i.test(d.prop));
        if (targetsEverything && resetsMotion) seen.add(selectorsOf(rule).join(', '));
    }
    return [...seen].map(() =>
        finding(
            'blanketReset',
            '[reduced-motion/blanket-reset] "*" reset inside @media (prefers-reduced-motion: reduce) removes all transitions, including fades that show state changes',
            'Reduce motion per element instead: keep opacity/color transitions, remove or replace only movement (transform, scroll, parallax).',
        ),
    );
}

/** Ungated declarations of `prop` outside reduce, deduped by the rule's selector. */
function ungatedRules(
    sheet: Stylesheet,
    matches: (decl: Declaration) => boolean,
    overrideProps: string[],
    isOff: (value: string) => boolean,
): Array<{ selector: string; decl: Declaration }> {
    const found = new Map<string, Declaration>();
    sheet.root.walkDecls((decl) => {
        const rule = ruleOf(decl);
        if (!rule || !matches(decl) || isInReduce(decl) || isInNoPreference(decl)) return;
        if (overriddenInReduce(sheet, rule, overrideProps, isOff)) return;
        const selector = selectorsOf(rule).join(', ');
        if (!found.has(selector)) found.set(selector, decl);
    });
    return [...found].map(([selector, decl]) => ({ selector, decl }));
}

function checkSmoothScroll(sheet: Stylesheet): JayHtmlValidationFinding[] {
    const isSmooth = (d: Declaration) =>
        d.prop.toLowerCase() === 'scroll-behavior' && d.value.trim().toLowerCase() === 'smooth';
    const isAuto = (value: string) => value.trim().toLowerCase() === 'auto';
    return ungatedRules(sheet, isSmooth, ['scroll-behavior'], isAuto).map(({ selector }) =>
        finding(
            'smoothScroll',
            `[reduced-motion/smooth-scroll] "${selector}" sets scroll-behavior: smooth for every user`,
            `Wrap it: @media (prefers-reduced-motion: no-preference) { ${selector} { scroll-behavior: smooth; } }.`,
        ),
    );
}

function checkScrollTimeline(sheet: Stylesheet): JayHtmlValidationFinding[] {
    const isScrollTimeline = (d: Declaration) =>
        d.prop.toLowerCase() === 'animation-timeline' &&
        !/^(auto|none)$/i.test(d.value.trim());
    const isNone = (value: string) => value.trim().toLowerCase() === 'none';
    return ungatedRules(sheet, isScrollTimeline, ['animation', 'animation-name'], isNone).map(
        ({ selector, decl }) =>
            finding(
                'scrollTimeline',
                `[reduced-motion/scroll-timeline] "${selector}" runs a scroll-driven animation (animation-timeline: ${decl.value.trim()}) for every user`,
                `Move the animation-timeline rule inside @media (prefers-reduced-motion: no-preference), or set animation: none for "${selector}" inside @media (prefers-reduced-motion: reduce).`,
            ),
    );
}

function checkViewTransition(sheet: Stylesheet): JayHtmlValidationFinding[] {
    const findings: JayHtmlValidationFinding[] = [];
    sheet.root.walkAtRules(/^view-transition$/i, (atRule) => {
        if (isInNoPreference(atRule)) return;
        const enabled = (atRule.nodes ?? []).some(
            (node) =>
                node.type === 'decl' &&
                node.prop.toLowerCase() === 'navigation' &&
                node.value.trim().toLowerCase() === 'auto',
        );
        if (!enabled) return;
        findings.push(
            finding(
                'viewTransition',
                '[reduced-motion/view-transition] @view-transition { navigation: auto } is enabled for every user',
                'Wrap it: @media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }.',
            ),
        );
    });
    return findings;
}

function turnsTransitionOff(rule: Rule): boolean {
    return declsOf(rule).some((decl) => {
        const prop = decl.prop.toLowerCase();
        const value = decl.value.trim().toLowerCase();
        if (prop === 'transition' || prop === 'transition-property') {
            return value === 'none' || isZeroDuration(value);
        }
        return prop === 'transition-duration' && isZeroDuration(value);
    });
}

function setsTransform(rule: Rule, value: (v: string) => boolean): boolean {
    return declsOf(rule).some((d) => d.prop.toLowerCase() === 'transform' && value(d.value.trim()));
}

/** Rule index in source order — a reduce override only wins when it comes after the transform. */
function sourceIndex(sheet: Stylesheet, rule: Rule): number {
    return sheet.rules.indexOf(rule);
}

function checkTransformKept(sheet: Stylesheet): JayHtmlValidationFinding[] {
    const resetSelectors = sheet.reduceRules
        .filter(turnsTransitionOff)
        .flatMap(selectorsOf);
    const findings = new Map<string, JayHtmlValidationFinding>();

    for (const rule of sheet.rules) {
        if (isInReduce(rule) || isInNoPreference(rule)) continue;
        if (!setsTransform(rule, (v) => v.toLowerCase() !== 'none')) continue;

        for (const transformSelector of selectorsOf(rule)) {
            if (!STATE_PSEUDO_SUFFIX.test(transformSelector)) continue;
            const resetSelector = transformSelector.replace(STATE_PSEUDO_SUFFIX, '');
            if (!resetSelectors.includes(resetSelector) || findings.has(transformSelector)) continue;
            const fixedLater = sheet.reduceRules.some(
                (reduceRule) =>
                    selectorsOf(reduceRule).includes(transformSelector) &&
                    setsTransform(reduceRule, (v) => v.toLowerCase() === 'none') &&
                    sourceIndex(sheet, reduceRule) > sourceIndex(sheet, rule),
            );
            if (fixedLater) continue;
            findings.set(
                transformSelector,
                finding(
                    'transformKept',
                    `[reduced-motion/transform-kept] "${transformSelector}" still changes transform under reduce after "${resetSelector}" turned off its transition, so it jumps instead of moving`,
                    `Set transform: none for "${transformSelector}" (the selector that sets the transform) inside @media (prefers-reduced-motion: reduce), or move "${transformSelector}" inside @media (prefers-reduced-motion: no-preference).`,
                ),
            );
        }
    }
    return [...findings.values()];
}
