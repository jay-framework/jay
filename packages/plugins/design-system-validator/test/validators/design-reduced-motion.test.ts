import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateReducedMotion } from '../../lib/tools';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';

const FIXTURES = resolve(__dirname, '../fixtures/reduced-motion');
const GUIDE = 'See design-system-validator agent-kit/designer/reduced-motion.md.';

function fixtureCss(name: string): string {
    return readFileSync(resolve(FIXTURES, `${name}.css`), 'utf-8');
}

function makeContext(
    fixture: string,
    overrides: Partial<JayHtmlValidationContext> = {},
): JayHtmlValidationContext {
    return {
        body: parse('<body><div></div></body>').querySelector('body'),
        css: fixtureCss(fixture),
        filePath: 'src/pages/x/page.jay-html',
        projectRoot: '/tmp/no-design-md-project',
        headlessImports: [],
        ...overrides,
    };
}

function suppress(key: string): string {
    return `If intentional, suppress with design-system: { ${key}: true } in <script type="application/jay-validations">.`;
}

const missing: JayHtmlValidationFinding = {
    severity: 'warning',
    message:
        '[reduced-motion/missing] Page moves elements (transform/animation) but has no @media (prefers-reduced-motion) rules',
    suggestion:
        'Put movement inside @media (prefers-reduced-motion: no-preference) { ... }, or override each moving selector inside @media (prefers-reduced-motion: reduce). Keep opacity/color fades. Do not use a "*" reset. ' +
        `${GUIDE} ${suppress('allow-no-reduced-motion')}`,
};

const blanketReset: JayHtmlValidationFinding = {
    severity: 'warning',
    message:
        '[reduced-motion/blanket-reset] "*" reset inside @media (prefers-reduced-motion: reduce) removes all transitions, including fades that show state changes',
    suggestion:
        'Reduce motion per element instead: keep opacity/color transitions, remove or replace only movement (transform, scroll, parallax). ' +
        `${GUIDE} ${suppress('allow-blanket-motion-reset')}`,
};

function smoothScroll(selector: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `[reduced-motion/smooth-scroll] "${selector}" sets scroll-behavior: smooth for every user`,
        suggestion:
            `Wrap it: @media (prefers-reduced-motion: no-preference) { ${selector} { scroll-behavior: smooth; } }. ` +
            `${GUIDE} ${suppress('allow-smooth-scroll')}`,
    };
}

function scrollTimeline(selector: string, value: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `[reduced-motion/scroll-timeline] "${selector}" runs a scroll-driven animation (animation-timeline: ${value}) for every user`,
        suggestion:
            `Move the animation-timeline rule inside @media (prefers-reduced-motion: no-preference), or set animation: none for "${selector}" inside @media (prefers-reduced-motion: reduce). ` +
            `${GUIDE} ${suppress('allow-scroll-animation')}`,
    };
}

const viewTransition: JayHtmlValidationFinding = {
    severity: 'warning',
    message:
        '[reduced-motion/view-transition] @view-transition { navigation: auto } is enabled for every user',
    suggestion:
        'Wrap it: @media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }. ' +
        `${GUIDE} ${suppress('allow-view-transition')}`,
};

function transformKept(transformSelector: string, resetSelector: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `[reduced-motion/transform-kept] "${transformSelector}" still changes transform under reduce after "${resetSelector}" turned off its transition, so it jumps instead of moving`,
        suggestion:
            `Set transform: none for "${transformSelector}" (the selector that sets the transform) inside @media (prefers-reduced-motion: reduce), or move "${transformSelector}" inside @media (prefers-reduced-motion: no-preference). ` +
            `${GUIDE} ${suppress('allow-transform-under-reduce')}`,
    };
}

describe('validateReducedMotion (DL#238)', () => {
    describe('reduced-motion/missing', () => {
        /**
         * Bug: the reduced-motion check only ran when DESIGN.md had animation tokens.
         * Found in: DL#238 Problem 2 (design-tokens.ts validateTokens returns [] without DESIGN.md).
         * Expected: a transform transition on a page without DESIGN.md is reported.
         * Actual: nothing is checked.
         */
        it('should warn on a transform transition when the project has no DESIGN.md', async () => {
            expect(await validateReducedMotion(makeContext('missing-transform'))).toEqual([
                missing,
            ]);
        });

        it('should warn on an animation whose keyframes rotate (name not the first token)', async () => {
            expect(await validateReducedMotion(makeContext('missing-keyframes'))).toEqual([
                missing,
            ]);
        });

        /**
         * Bug: an opacity fade was reported as missing reduced motion.
         * Found in: DL#238 Problem 2 (old design-tokens.test.ts expected a warning for a fade).
         * Expected: fades are not movement, no warning.
         */
        it('should not warn on an opacity fade', async () => {
            expect(await validateReducedMotion(makeContext('missing-fade'))).toEqual([]);
        });

        it('should not warn on a zero transition-duration', async () => {
            expect(await validateReducedMotion(makeContext('missing-zero-duration'))).toEqual([]);
        });

        it('should not check component files (pages only)', async () => {
            const ctx = makeContext('missing-transform', {
                filePath: 'src/components/x.jay-html',
            });
            expect(await validateReducedMotion(ctx)).toEqual([]);
        });
    });

    describe('reduced-motion/blanket-reset', () => {
        it('should warn on a "*" reset inside reduce', async () => {
            expect(await validateReducedMotion(makeContext('blanket-reset-star'))).toEqual([
                blanketReset,
            ]);
        });

        it('should warn when "*" is mixed with named selectors', async () => {
            expect(await validateReducedMotion(makeContext('blanket-reset-mixed'))).toEqual([
                blanketReset,
            ]);
        });

        it('should not warn on a reset of named selectors', async () => {
            expect(await validateReducedMotion(makeContext('blanket-reset-named'))).toEqual([]);
        });
    });

    describe('reduced-motion/smooth-scroll', () => {
        it('should warn on ungated scroll-behavior: smooth', async () => {
            expect(await validateReducedMotion(makeContext('smooth-scroll-ungated'))).toEqual([
                smoothScroll('html'),
            ]);
        });

        it('should report missing before smooth-scroll', async () => {
            expect(await validateReducedMotion(makeContext('smooth-scroll-and-missing'))).toEqual(
                [missing, smoothScroll('html')],
            );
        });

        it('should not warn inside no-preference', async () => {
            expect(
                await validateReducedMotion(makeContext('smooth-scroll-no-preference')),
            ).toEqual([]);
        });

        it('should not warn when reduce sets scroll-behavior: auto on the same selector', async () => {
            expect(
                await validateReducedMotion(makeContext('smooth-scroll-reduce-override')),
            ).toEqual([]);
        });
    });

    describe('reduced-motion/scroll-timeline', () => {
        it('should warn on an ungated scroll-driven animation', async () => {
            expect(await validateReducedMotion(makeContext('scroll-timeline-ungated'))).toEqual([
                scrollTimeline('.bar', 'scroll()'),
            ]);
        });

        it('should not warn when reduce sets animation: none', async () => {
            expect(
                await validateReducedMotion(makeContext('scroll-timeline-reduce-override')),
            ).toEqual([]);
        });

        it('should not warn on a @supports not fallback and a gated @supports rule', async () => {
            expect(
                await validateReducedMotion(makeContext('scroll-timeline-supports-fallback')),
            ).toEqual([]);
        });

        it('should not warn inside @media not (prefers-reduced-motion: reduce)', async () => {
            expect(await validateReducedMotion(makeContext('scroll-timeline-not-reduce'))).toEqual(
                [],
            );
        });
    });

    describe('reduced-motion/view-transition', () => {
        it('should warn on an ungated @view-transition', async () => {
            expect(await validateReducedMotion(makeContext('view-transition-ungated'))).toEqual([
                viewTransition,
            ]);
        });

        it('should not warn inside no-preference', async () => {
            expect(
                await validateReducedMotion(makeContext('view-transition-no-preference')),
            ).toEqual([]);
        });
    });

    describe('bare (prefers-reduced-motion) query is treated as reduce', () => {
        it('should not warn on a transition reset under the bare query', async () => {
            expect(await validateReducedMotion(makeContext('bare-query-transition'))).toEqual([]);
        });

        it('should not warn on smooth scroll overridden under the bare query', async () => {
            expect(await validateReducedMotion(makeContext('bare-query-smooth-scroll'))).toEqual(
                [],
            );
        });
    });

    describe('reduced-motion/transform-kept', () => {
        it('should warn when reduce turns off the transition but the hover transform stays', async () => {
            expect(
                await validateReducedMotion(makeContext('transform-kept-transition-only')),
            ).toEqual([transformKept('.slide:hover', '.slide')]);
        });

        it('should warn when transform: none is set on the less specific selector', async () => {
            expect(
                await validateReducedMotion(makeContext('transform-kept-wrong-selector')),
            ).toEqual([transformKept('.slide:hover', '.slide')]);
        });

        it('should warn when the exact override comes before the transform in source order', async () => {
            expect(
                await validateReducedMotion(makeContext('transform-kept-override-before')),
            ).toEqual([transformKept('.slide:hover', '.slide')]);
        });

        it('should not warn when reduce resets the exact hover selector', async () => {
            expect(await validateReducedMotion(makeContext('transform-kept-fixed'))).toEqual([]);
        });

        it('should not warn when the hover transform is inside no-preference', async () => {
            expect(
                await validateReducedMotion(makeContext('transform-kept-no-preference')),
            ).toEqual([]);
        });

        it('should not warn when there is no transform anywhere', async () => {
            expect(
                await validateReducedMotion(makeContext('transform-kept-no-transform')),
            ).toEqual([]);
        });
    });

    describe('suppression', () => {
        const cases: Array<[string, string]> = [
            ['allow-no-reduced-motion', 'missing-transform'],
            ['allow-blanket-motion-reset', 'blanket-reset-star'],
            ['allow-smooth-scroll', 'smooth-scroll-ungated'],
            ['allow-scroll-animation', 'scroll-timeline-ungated'],
            ['allow-view-transition', 'view-transition-ungated'],
            ['allow-transform-under-reduce', 'transform-kept-transition-only'],
        ];

        it.each(cases)('%s silences its rule', async (key, fixture) => {
            const ctx = makeContext(fixture, {
                validationOverrides: { 'design-system': { [key]: true } },
            });
            expect(await validateReducedMotion(ctx)).toEqual([]);
        });
    });
});
