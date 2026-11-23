import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/a11y-validator.js';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
    JayHtmlHeadMeta,
} from '@jay-framework/compiler-shared';

/** DL#243 — swipe and touch gesture validations. Row numbers follow the design log's P0 table. */

const GUIDE = '\nSee: agent-kit/designer/swipe-gestures.md';

function makeContext(html: string, head?: JayHtmlHeadMeta, css?: string): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        head,
        css,
    };
}

function withOverrides(ctx: JayHtmlValidationContext, overrides: Record<string, boolean>) {
    return { ...ctx, validationOverrides: { a11y: overrides } };
}

const overscroll = (selector: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-SNAP-OVERSCROLL] \`${selector}\` scrolls horizontally with scroll-snap but has no overscroll-behavior-x — an over-swipe can trigger browser back/forward.`,
    suggestion:
        'Add `overscroll-behavior-x: contain;` to the same rule. Suppress with a11y: { allow-snap-overscroll: true }.' +
        GUIDE,
});

const blockedTouch = (selector: string, value: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-SNAP-BLOCKED] \`${selector}\` has scroll-snap but \`touch-action: ${value}\` — users cannot swipe it.`,
    suggestion:
        'Remove touch-action or use pan-x. Suppress with a11y: { allow-snap-blocked: true }.' +
        GUIDE,
});

const blockedOverflow = (selector: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-SNAP-BLOCKED] \`${selector}\` has scroll-snap but overflow is \`visible\`/\`clip\` on both axes — it never scrolls.`,
    suggestion: 'Set overflow-x: auto. Suppress with a11y: { allow-snap-blocked: true }.' + GUIDE,
});

const KEYBOARD_TAIL = ' Suppress with a11y: { allow-carousel-keyboard: true }.' + GUIDE;

/** Message A. `region` is the selector in backticks, or the element when it has no simple selector. */
const keyboardA = (region: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-CAROUSEL-KEYBOARD] Swipe region ${region} cannot be reached by keyboard — no prev/next buttons and nothing focusable inside.`,
    suggestion:
        'Add <button> prev/next controls (e.g. ui-kit scroll-carousel refs) or tabindex="0" with an aria-label.' +
        KEYBOARD_TAIL,
});

const keyboardB = (element: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-CAROUSEL-KEYBOARD] ${element} has no accessible name (WCAG 4.1.2).`,
    suggestion: 'Add an aria-label (or aria-labelledby) that names the carousel.' + KEYBOARD_TAIL,
});

const keyboardC = (tag: string, value: string): JayHtmlValidationFinding => ({
    severity: 'warning',
    message: `[SWIPE-CAROUSEL-KEYBOARD] <${tag} aria-roledescription="${value}"> has no role, so the role description is not announced.`,
    suggestion: 'Add role="region" (or "group") with an aria-label.' + KEYBOARD_TAIL,
});

const SNAP = 'scroll-snap-type: x mandatory; overflow-x: auto;';
const SNAP_CONTAINED = `${SNAP} overscroll-behavior-x: contain;`;
const IMAGES = '<img src="1.jpg" alt="One"><img src="2.jpg" alt="Two">';
/** A sibling prev/next button keeps Keyboard A quiet for the CSS-only rows. */
const TRACK = `<div><button type="button">Next</button><div class="track">${IMAGES}</div></div>`;

async function swipe(ctx: JayHtmlValidationContext): Promise<JayHtmlValidationFinding[]> {
    return (await validate(ctx)).filter((f) => f.message.startsWith('[SWIPE-'));
}

describe('SWIPE-SNAP-OVERSCROLL', () => {
    it('1: horizontal snap without overscroll-behavior', async () => {
        expect(await validate(makeContext(TRACK, undefined, `.track { ${SNAP} }`))).toEqual([
            overscroll('.track'),
        ]);
    });

    it('2 / 3: overscroll-behavior-x or the shorthand satisfies it', async () => {
        for (const decl of [
            'overscroll-behavior-x: contain',
            'overscroll-behavior: none',
            'overscroll-behavior-inline: auto',
        ]) {
            expect(
                await validate(makeContext(TRACK, undefined, `.track { ${SNAP} ${decl} }`)),
            ).toEqual([]);
        }
    });

    it('4: overscroll in a second rule with the same selector', async () => {
        const css = `.track { ${SNAP} } .track { overscroll-behavior-x: contain }`;
        expect(await validate(makeContext(TRACK, undefined, css))).toEqual([]);
    });

    it('5: vertical snap is not checked', async () => {
        expect(
            await validate(
                makeContext(
                    TRACK,
                    undefined,
                    '.track { scroll-snap-type: y mandatory; overflow-y: auto }',
                ),
            ),
        ).toEqual([]);
    });

    it('6: both and inline axes warn', async () => {
        for (const axis of ['both mandatory', 'inline proximity']) {
            const css = `.track { scroll-snap-type: ${axis}; overflow: auto }`;
            expect(await swipe(makeContext(TRACK, undefined, css))).toEqual([overscroll('.track')]);
        }
    });

    it('7: inside @media', async () => {
        const css = `@media (min-width: 600px) { .track { ${SNAP} } }`;
        expect(await swipe(makeContext(TRACK, undefined, css))).toEqual([overscroll('.track')]);
    });

    it('7a: identical selector text matches across at-rules', async () => {
        const css = `.track { overscroll-behavior-x: contain } @media (min-width: 600px) { .track { ${SNAP} } }`;
        expect(await swipe(makeContext(TRACK, undefined, css))).toEqual([]);
    });

    it('7b (optional @media case): overscroll set only inside @media still matches the top-level snap rule', async () => {
        const css = `.track { ${SNAP} } @media (max-width: 600px) { .track { overscroll-behavior-x: contain } }`;
        expect(await swipe(makeContext(TRACK, undefined, css))).toEqual([]);
    });

    it('8: allow-snap-overscroll suppresses it', async () => {
        const ctx = withOverrides(makeContext(TRACK, undefined, `.track { ${SNAP} }`), {
            'allow-snap-overscroll': true,
        });
        expect(await swipe(ctx)).toEqual([]);
    });

    it('13a: a comma list is split; each part is satisfied on its own', async () => {
        const html = `<div><button type="button">Next</button><div class="a">${IMAGES}</div><div class="b">${IMAGES}</div></div>`;
        expect(await swipe(makeContext(html, undefined, `.a, .b { ${SNAP} }`))).toEqual([
            overscroll('.a'),
            overscroll('.b'),
        ]);
        expect(
            await swipe(
                makeContext(
                    html,
                    undefined,
                    `.a, .b { ${SNAP} } .b { overscroll-behavior-x: contain }`,
                ),
            ),
        ).toEqual([overscroll('.a')]);
    });

    it('whitespace in selector text is normalised before comparing (reviewer note)', async () => {
        const html = `<div><button type="button">Next</button><div class="w"><div class="track">${IMAGES}</div></div></div>`;
        const css = `.w   >  .track { ${SNAP} } .w > .track { overscroll-behavior-x: contain }`;
        expect(await swipe(makeContext(html, undefined, css))).toEqual([]);
        expect(await swipe(makeContext(html, undefined, `.w   >\n .track { ${SNAP} }`))).toEqual([
            overscroll('.w > .track'),
        ]);
    });
});

describe('SWIPE-CAROUSEL-KEYBOARD (full finding lists)', () => {
    const gallery = (inner: string, outer = '') =>
        `<div>${outer}<div class="gallery">${inner}</div></div>`;
    const css = `.gallery { ${SNAP_CONTAINED} }`;
    const run = (html: string) => validate(makeContext(html, undefined, css));

    it('9: snap row with only images and no buttons → A', async () => {
        expect(await run(gallery(IMAGES))).toEqual([keyboardA('`.gallery`')]);
    });

    it('10: a sibling button is a keyboard path', async () => {
        expect(await run(gallery(IMAGES, '<button type="button">Next</button>'))).toEqual([]);
    });

    it('11: link slides are reachable', async () => {
        expect(await run(gallery('<a href="/1">One</a><a href="/2">Two</a>'))).toEqual([]);
    });

    it('12: tabindex="0" on the container', async () => {
        const html = `<div><div class="gallery" tabindex="0" role="region" aria-label="Gallery">${IMAGES}</div></div>`;
        expect(await run(html)).toEqual([]);
    });

    it('12a: tabindex="-1" on the container does not count', async () => {
        const html = `<div><div class="gallery" tabindex="-1" role="region" aria-label="Gallery">${IMAGES}</div></div>`;
        expect(await run(html)).toEqual([keyboardA('`.gallery`')]);
    });

    it('12b: only a disabled sibling button', async () => {
        expect(await run(gallery(IMAGES, '<button type="button" disabled>Next</button>'))).toEqual([
            keyboardA('`.gallery`'),
        ]);
    });

    /**
     * Bug: a conditionally disabled button (`disabled="atStart"`, a Jay condition) counted as disabled.
     * Found in: fake-shop src/pages/ui-demo and ui-kit scroll-carousel.md Pattern 1 (DL#243 verification run).
     * Expected: only a static `disabled` / `disabled=""` / `disabled="disabled"` removes the control.
     * Actual: the guide's own prev/next buttons raised Keyboard A.
     */
    it('should count a conditionally disabled prev/next button as a keyboard path', async () => {
        expect(
            await run(gallery(IMAGES, '<button type="button" disabled="atStart">Prev</button>')),
        ).toEqual([]);
        expect(
            await run(gallery(IMAGES, '<button type="button" disabled="{atStart}">Prev</button>')),
        ).toEqual([]);
        expect(
            await run(gallery(IMAGES, '<button type="button" disabled="disabled">Prev</button>')),
        ).toEqual([keyboardA('`.gallery`')]);
    });

    it('12c: links without href', async () => {
        expect(await run(gallery('<a>One</a><a>Two</a>'))).toEqual([keyboardA('`.gallery`')]);
    });

    it('12d: contenteditable or details/summary slides are reachable', async () => {
        expect(await run(gallery('<div contenteditable="true">Edit</div>'))).toEqual([]);
        expect(await run(gallery('<details><summary>More</summary><p>x</p></details>'))).toEqual(
            [],
        );
    });

    it('12e: media with controls and iframes are reachable; video without controls is not', async () => {
        expect(await run(gallery('<video controls src="a.mp4"></video>'))).toEqual([]);
        expect(await run(gallery('<audio controls src="a.mp3"></audio>'))).toEqual([]);
        expect(await run(gallery('<iframe src="/x" title="X"></iframe>'))).toEqual([]);
        expect(await run(gallery('<video src="a.mp4"></video>'))).toEqual([
            keyboardA('`.gallery`'),
        ]);
    });

    it('12f: a sibling link is a keyboard path', async () => {
        expect(await run(gallery(IMAGES, '<a href="#next">Next</a>'))).toEqual([]);
    });

    it('13: complex selectors are skipped', async () => {
        const html = `<div class="wrap"><div class="gallery">${IMAGES}</div></div>`;
        const complex = `.wrap > .gallery { ${SNAP_CONTAINED} }`;
        expect(await validate(makeContext(html, undefined, complex))).toEqual([]);
    });

    it('13b: in a mixed list only the simple part is matched', async () => {
        const html = gallery(IMAGES);
        const mixed = `.gallery, .wrap > .x { ${SNAP_CONTAINED} }`;
        expect(await validate(makeContext(html, undefined, mixed))).toEqual([
            keyboardA('`.gallery`'),
        ]);
    });

    it('14: a nameless, role-less, unreachable carousel div raises B, C and A (reviewer note)', async () => {
        const html = `<div aria-roledescription="carousel">${IMAGES}</div>`;
        expect(await validate(makeContext(html))).toEqual([
            keyboardB('<div aria-roledescription="carousel">'),
            keyboardC('div', 'carousel'),
            keyboardA('<div aria-roledescription="carousel">'),
        ]);
    });

    it('15: a named region carousel with a button is clean', async () => {
        const html = `<div role="region" aria-roledescription="carousel" aria-label="Gallery"><button type="button">Next</button>${IMAGES}</div>`;
        expect(await validate(makeContext(html))).toEqual([]);
    });

    it('15a: empty names count as no name', async () => {
        for (const attr of ['aria-label="  "', 'aria-labelledby=""']) {
            const html = `<div role="region" aria-roledescription="carousel" ${attr}><button type="button">Next</button>${IMAGES}</div>`;
            expect(await swipe(makeContext(html))).toEqual([
                keyboardB('<div aria-roledescription="carousel">'),
            ]);
        }
    });

    it('15b: a named carousel div with no role → C', async () => {
        const html = `<div aria-roledescription="carousel" aria-label="Gallery"><button type="button">Next</button>${IMAGES}</div>`;
        expect(await validate(makeContext(html))).toEqual([keyboardC('div', 'carousel')]);
    });

    it('15c / 15d / 15e / 15f: explicit or non-generic roles pass', async () => {
        for (const html of [
            `<div role="group" aria-roledescription="carousel" aria-label="Gallery"><button type="button">Next</button>${IMAGES}</div>`,
            '<div role="button" tabindex="0" aria-roledescription="toggle">Toggle</div>',
            `<section aria-label="Gallery" aria-roledescription="carousel"><button type="button">Next</button>${IMAGES}</section>`,
            '<button type="button" aria-roledescription="toggle">Toggle</button>',
        ]) {
            expect(await validate(makeContext(html))).toEqual([]);
        }
    });

    it('15g: a span slide description is not announced, value echoed', async () => {
        expect(
            await validate(makeContext('<span aria-roledescription="slide">One</span>')),
        ).toEqual([keyboardC('span', 'slide')]);
    });

    it('Trigger C list excludes <s> (reviewer note)', async () => {
        expect(await validate(makeContext('<s aria-roledescription="note">old</s>'))).toEqual([]);
    });

    it('16: allow-carousel-keyboard suppresses A, B and C', async () => {
        const ctx = withOverrides(
            makeContext(`<div aria-roledescription="carousel">${IMAGES}</div>`),
            {
                'allow-carousel-keyboard': true,
            },
        );
        expect(await validate(ctx)).toEqual([]);
    });

    it('20: <jay:scroll-carousel> with an unreachable container child → A', async () => {
        const html = `<jay:scroll-carousel><div ref="container" class="gallery">${IMAGES}</div></jay:scroll-carousel>`;
        expect(await run(html)).toEqual([keyboardA('`.gallery`')]);
    });
});

describe('SWIPE-SNAP-BLOCKED', () => {
    const run = (decls: string) =>
        swipe(
            makeContext(
                TRACK,
                undefined,
                `.track { scroll-snap-type: x mandatory; overscroll-behavior-x: contain; ${decls} }`,
            ),
        );

    it('17: touch-action: none', async () => {
        expect(await run('overflow-x: auto; touch-action: none')).toEqual([
            blockedTouch('.track', 'none'),
        ]);
    });

    it('18: touch-action without a horizontal pan keyword warns; pan-x and friends pass', async () => {
        for (const value of ['pan-y', 'pinch-zoom', 'pan-y pinch-zoom']) {
            expect(await run(`overflow-x: auto; touch-action: ${value}`)).toEqual([
                blockedTouch('.track', value),
            ]);
        }
        for (const value of [
            'pan-x',
            'pan-left',
            'pan-right',
            'pan-left pan-y',
            'manipulation',
            'auto',
        ]) {
            expect(await run(`overflow-x: auto; touch-action: ${value}`)).toEqual([]);
        }
    });

    it('19: overflow visible/clip on both axes warns', async () => {
        for (const decls of [
            'overflow: visible',
            'overflow: clip',
            'overflow-x: clip; overflow-y: visible',
        ]) {
            expect(await run(decls)).toEqual([blockedOverflow('.track')]);
        }
    });

    it('19a / 19b / 19c: scroll containers and undeclared axes pass', async () => {
        for (const decls of [
            'overflow-x: visible; overflow-y: auto',
            'overflow-x: clip; overflow-y: auto',
            'overflow-x: hidden',
            'overflow-x: visible',
            'overflow: visible auto',
            'overflow-x: visible; overflow: auto',
        ]) {
            expect(await run(decls)).toEqual([]);
        }
    });

    it('one finding per cause', async () => {
        expect(await run('overflow: visible; touch-action: none')).toEqual([
            blockedTouch('.track', 'none'),
            blockedOverflow('.track'),
        ]);
    });

    it('21: allow-snap-blocked suppresses it', async () => {
        const css = `.track { ${SNAP_CONTAINED} touch-action: none }`;
        const ctx = withOverrides(makeContext(TRACK, undefined, css), {
            'allow-snap-blocked': true,
        });
        expect(await swipe(ctx)).toEqual([]);
    });
});

describe('21a: message and guide format', () => {
    it('every swipe finding names its key and the swipe guide once, never a11y-patterns', async () => {
        const css = `.gallery { scroll-snap-type: x mandatory; overflow: visible; touch-action: none }`;
        const findings = await swipe(
            makeContext(
                `<div aria-roledescription="carousel"><div class="gallery">${IMAGES}</div></div>`,
                undefined,
                css,
            ),
        );
        expect(findings.length).toBeGreaterThanOrEqual(5);
        for (const f of findings) {
            expect(f.message).toMatch(/^\[SWIPE-[A-Z-]+\] /);
            expect(f.suggestion).toMatch(
                /Suppress with a11y: \{ allow-(snap-overscroll|snap-blocked|carousel-keyboard): true \}\./,
            );
            expect(f.suggestion?.split('swipe-gestures.md').length).toBe(2);
            expect(f.suggestion).not.toMatch(/a11y-patterns\.md/);
        }
    });
});
