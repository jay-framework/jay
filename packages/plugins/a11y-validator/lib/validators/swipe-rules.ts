import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';
import selectorParser from 'postcss-selector-parser';
import { collectPageCssSources } from '../css/css-sources.js';
import { flattenAll, lastDeclaration, type FlatRule } from '../css/flat-rules.js';
import { allElements, hasAncestor, hasAttribute, staticAttribute, tagOf } from '../dom.js';

/**
 * DL#243 — swipe and touch gestures: SWIPE-SNAP-OVERSCROLL, SWIPE-SNAP-BLOCKED and
 * SWIPE-CAROUSEL-KEYBOARD (the TS listener rule lives in stack-cli). All warnings; every message
 * starts with its rule id and every suggestion names its suppression key and the swipe guide.
 */

export const SWIPE_GUIDE = '\nSee: agent-kit/designer/swipe-gestures.md';

interface SwipeFinding {
    key: 'allow-snap-overscroll' | 'allow-snap-blocked' | 'allow-carousel-keyboard';
    message: string;
    fix: string;
}

export function checkSwipeGestures(ctx: JayHtmlValidationContext): JayHtmlValidationFinding[] {
    const snapRules = flattenAll(collectPageCssSources(ctx)).filter(isHorizontalSnap);
    const allRules = flattenAll(collectPageCssSources(ctx));
    const found = [
        ...checkOverscroll(snapRules, allRules),
        ...checkBlocked(snapRules),
        ...checkCarouselKeyboard(ctx.body, snapRules),
    ];
    return found
        .filter((f) => ctx.validationOverrides?.a11y?.[f.key] !== true)
        .map((f) => ({
            severity: 'warning',
            message: f.message,
            suggestion: `${f.fix} Suppress with a11y: { ${f.key}: true }.${SWIPE_GUIDE}`,
        }));
}

// --- selectors -----------------------------------------------------------------------------

/** Collapses whitespace and spaces combinators uniformly, so `.w  >\n.t` equals `.w > .t`. */
export function normalizeSelector(selector: string): string {
    return selector
        .replace(/\s+/g, ' ')
        .replace(/\s*([>+~])\s*/g, ' $1 ')
        .trim();
}

function isHorizontalSnap(rule: FlatRule): boolean {
    const axis = lastDeclaration(rule, ['scroll-snap-type'])
        ?.value.trim()
        .split(/\s+/)[0]
        ?.toLowerCase();
    return axis === 'x' || axis === 'inline' || axis === 'both';
}

// --- SWIPE-SNAP-OVERSCROLL -------------------------------------------------------------------

const OVERSCROLL_PROPERTIES = [
    'overscroll-behavior-x',
    'overscroll-behavior-inline',
    'overscroll-behavior',
];

function checkOverscroll(snapRules: FlatRule[], allRules: FlatRule[]): SwipeFinding[] {
    const contained = new Set(
        allRules
            .filter((rule) => lastDeclaration(rule, OVERSCROLL_PROPERTIES) !== undefined)
            .flatMap((rule) => rule.selectors.map(normalizeSelector)),
    );
    return snapRules.flatMap((rule) =>
        rule.selectors
            .map(normalizeSelector)
            .filter((selector) => !contained.has(selector))
            .map((selector) => ({
                key: 'allow-snap-overscroll' as const,
                message: `[SWIPE-SNAP-OVERSCROLL] \`${selector}\` scrolls horizontally with scroll-snap but has no overscroll-behavior-x — an over-swipe can trigger browser back/forward.`,
                fix: 'Add `overscroll-behavior-x: contain;` to the same rule.',
            })),
    );
}

// --- SWIPE-SNAP-BLOCKED ----------------------------------------------------------------------

const HORIZONTAL_PAN = new Set(['pan-x', 'pan-left', 'pan-right']);
const NOT_SCROLLING = new Set(['visible', 'clip']);

function blockingTouchAction(rule: FlatRule): string | undefined {
    const value = lastDeclaration(rule, ['touch-action'])?.value.trim();
    if (!value) return undefined;
    const tokens = value.toLowerCase().split(/\s+/);
    if (tokens.includes('auto') || tokens.includes('manipulation')) return undefined;
    return tokens.some((t) => HORIZONTAL_PAN.has(t)) ? undefined : value;
}

/** Effective overflow per axis from this rule's own declarations, last one winning. */
function effectiveOverflow(rule: FlatRule): { x?: string; y?: string } {
    const axes: { x?: string; y?: string } = {};
    for (const { property, value } of rule.declarations) {
        const tokens = value.trim().toLowerCase().split(/\s+/);
        if (property === 'overflow') {
            axes.x = tokens[0];
            axes.y = tokens[1] ?? tokens[0];
        } else if (property === 'overflow-x') axes.x = tokens[0];
        else if (property === 'overflow-y') axes.y = tokens[0];
    }
    return axes;
}

function neverScrolls(rule: FlatRule): boolean {
    const { x, y } = effectiveOverflow(rule);
    return x !== undefined && y !== undefined && NOT_SCROLLING.has(x) && NOT_SCROLLING.has(y);
}

function checkBlocked(snapRules: FlatRule[]): SwipeFinding[] {
    return snapRules.flatMap((rule) =>
        rule.selectors.map(normalizeSelector).flatMap((selector) => {
            const found: SwipeFinding[] = [];
            const touchAction = blockingTouchAction(rule);
            if (touchAction) {
                found.push({
                    key: 'allow-snap-blocked',
                    message: `[SWIPE-SNAP-BLOCKED] \`${selector}\` has scroll-snap but \`touch-action: ${touchAction}\` — users cannot swipe it.`,
                    fix: 'Remove touch-action or use pan-x.',
                });
            }
            if (neverScrolls(rule)) {
                found.push({
                    key: 'allow-snap-blocked',
                    message: `[SWIPE-SNAP-BLOCKED] \`${selector}\` has scroll-snap but overflow is \`visible\`/\`clip\` on both axes — it never scrolls.`,
                    fix: 'Set overflow-x: auto.',
                });
            }
            return found;
        }),
    );
}

// --- SWIPE-CAROUSEL-KEYBOARD -----------------------------------------------------------------

/** Tags whose implicit role is generic, so aria-roledescription on them is not announced. */
const GENERIC_TAGS = new Set(['div', 'span', 'b', 'i', 'u', 'small', 'bdi', 'bdo', 'data', 'pre']);

interface SimpleSelector {
    text: string;
    tag?: string;
    id?: string;
    classes: string[];
}

/** `.class`, `#id`, `tag` or a compound of these; anything else (combinators, pseudos, attributes) → undefined. */
function parseSimpleSelector(selector: string): SimpleSelector | undefined {
    let nodes: selectorParser.Node[];
    try {
        nodes = selectorParser().astSync(selector).first?.nodes ?? [];
    } catch {
        return undefined;
    }
    const simple: SimpleSelector = { text: selector, classes: [] };
    for (const node of nodes) {
        if (node.type === 'tag') simple.tag = node.value.toLowerCase();
        else if (node.type === 'class') simple.classes.push(node.value);
        else if (node.type === 'id') simple.id = node.value;
        else return undefined;
    }
    return nodes.length > 0 ? simple : undefined;
}

function matches(el: any, selector: SimpleSelector): boolean {
    if (selector.tag && tagOf(el) !== selector.tag) return false;
    if (selector.id && staticAttribute(el, 'id') !== selector.id) return false;
    const classes = new Set((staticAttribute(el, 'class') ?? '').split(/\s+/).filter(Boolean));
    return selector.classes.every((c) => classes.has(c));
}

function isKeyboardReachable(el: any): boolean {
    const tag = tagOf(el);
    const tabindex = staticAttribute(el, 'tabindex');
    if (tabindex !== undefined && /^\s*\d+\s*$/.test(tabindex)) return true;
    if ((tag === 'a' || tag === 'area') && hasAttribute(el, 'href')) return true;
    if (['button', 'select', 'textarea'].includes(tag)) return !isStaticallyDisabled(el);
    if (tag === 'input') {
        return (
            (staticAttribute(el, 'type') ?? '').toLowerCase() !== 'hidden' &&
            !isStaticallyDisabled(el)
        );
    }
    if (tag === 'summary')
        return tagOf(el.parentNode) === 'details' && firstElementChild(el.parentNode) === el;
    if (hasAttribute(el, 'contenteditable'))
        return staticAttribute(el, 'contenteditable')?.toLowerCase() !== 'false';
    if (tag === 'video' || tag === 'audio') return hasAttribute(el, 'controls');
    return tag === 'iframe';
}

/** A static `disabled` only; `disabled="atStart"` / `disabled="{x}"` is a Jay condition and may be false. */
function isStaticallyDisabled(el: any): boolean {
    if (!hasAttribute(el, 'disabled')) return false;
    const value = (el.getAttribute('disabled') ?? '').trim().toLowerCase();
    return value === '' || value === 'disabled';
}

function firstElementChild(el: any): any {
    return (el?.childNodes ?? []).find((child: any) => child.nodeType === 1);
}

function isPrevNextControl(el: any): boolean {
    if (tagOf(el) === 'button') return !isStaticallyDisabled(el);
    return tagOf(el) === 'a' && hasAttribute(el, 'href');
}

function hasKeyboardPath(container: any): boolean {
    if (isKeyboardReachable(container) || allElements(container).some(isKeyboardReachable))
        return true;
    const outside = allElements(container.parentNode).filter(
        (el) => el !== container && !hasAncestor(el, (a) => a === container),
    );
    return outside.some(isPrevNextControl);
}

function hasName(el: any): boolean {
    return ['aria-label', 'aria-labelledby'].some(
        (a) => (el.getAttribute?.(a) ?? '').trim() !== '',
    );
}

function roleDescriptionTag(el: any): string {
    return `<${tagOf(el)} aria-roledescription="${el.getAttribute('aria-roledescription')}">`;
}

/** Carousel elements in document order, each with the text Message A names it by. */
function carouselRegions(elements: any[], snapRules: FlatRule[]): Map<any, string> {
    const selectors = snapRules
        .flatMap((rule) => rule.selectors.map(normalizeSelector))
        .map(parseSimpleSelector)
        .filter((s): s is SimpleSelector => s !== undefined);
    const regions = new Map<any, string>();
    for (const el of elements) {
        const bySelector = selectors.find((s) => matches(el, s));
        if (bySelector) regions.set(el, `\`${bySelector.text}\``);
        else if (isCarouselRole(el)) regions.set(el, roleDescriptionTag(el));
    }
    return regions;
}

function isCarouselRole(el: any): boolean {
    return (staticAttribute(el, 'aria-roledescription') ?? '').trim().toLowerCase() === 'carousel';
}

function checkCarouselKeyboard(body: any, snapRules: FlatRule[]): SwipeFinding[] {
    const elements = allElements(body);
    const regions = carouselRegions(elements, snapRules);
    const tail = { key: 'allow-carousel-keyboard' as const };
    return elements.flatMap((el) => {
        const found: SwipeFinding[] = [];
        if (isCarouselRole(el) && !hasName(el)) {
            found.push({
                ...tail,
                message: `[SWIPE-CAROUSEL-KEYBOARD] ${roleDescriptionTag(el)} has no accessible name (WCAG 4.1.2).`,
                fix: 'Add an aria-label (or aria-labelledby) that names the carousel.',
            });
        }
        if (
            hasAttribute(el, 'aria-roledescription') &&
            !hasAttribute(el, 'role') &&
            GENERIC_TAGS.has(tagOf(el))
        ) {
            found.push({
                ...tail,
                message: `[SWIPE-CAROUSEL-KEYBOARD] ${roleDescriptionTag(el)} has no role, so the role description is not announced.`,
                fix: 'Add role="region" (or "group") with an aria-label.',
            });
        }
        const region = regions.get(el);
        if (region && !hasKeyboardPath(el)) {
            found.push({
                ...tail,
                message: `[SWIPE-CAROUSEL-KEYBOARD] Swipe region ${region} cannot be reached by keyboard — no prev/next buttons and nothing focusable inside.`,
                fix: 'Add <button> prev/next controls (e.g. ui-kit scroll-carousel refs) or tabindex="0" with an aria-label.',
            });
        }
        return found;
    });
}
