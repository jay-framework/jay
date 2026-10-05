import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateJayFiles } from '../lib/validate';

// DL#207 — report-only design-system scorecard. These tests assert on the ValidationResult fields
// (designSystemCoverage / designSystemReuse) with exact numbers, never on console/HTML strings.

const fixturesDir = path.resolve('./test/fixtures/validate');

describe('DL#207 — design-system coverage', () => {
    it('reports high coverage with exact covered/total for a mostly-region page', async () => {
        const root = path.join(fixturesDir, 'ds-coverage-high');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(result.designSystemCoverage).toEqual([
            {
                file: path.join('pages', 'page.jay-html'),
                // region (<jay:card>) + its 3 descendants (div.card, h3, p) = 4 covered;
                // total body elements add the hand-authored <footer> = 5.
                covered: 4,
                total: 5,
                coveragePct: 0.8,
            },
        ]);
    });

    it('reports 0% coverage and empty reuse for a hand-authored page with no template= regions', async () => {
        const root = path.join(fixturesDir, 'ds-coverage-none');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        expect(result.designSystemCoverage).toEqual([
            {
                file: path.join('pages', 'page.jay-html'),
                // body = div.hand-authored + h1 + p = 3 elements, none in a template= region.
                covered: 0,
                total: 3,
                coveragePct: 0,
            },
        ]);
        expect(result.designSystemReuse).toEqual({
            perTemplate: {},
            catalogued: 0,
            reusedMoreThanOnce: 0,
            reusedOfCatalogued: 0,
        });
    });
});

describe('DL#207 — design-system reuse (multi-page project)', () => {
    it('counts per-template reuse across pages and the K-of-M catalogued headline', async () => {
        const root = path.join(fixturesDir, 'ds-reuse');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        // card used 4× (2 on home, 2 on about), feature 2× (1 + 1), hero 1× (home only).
        expect(result.designSystemReuse.perTemplate).toEqual({
            './components/card/card.jay-html': 4,
            './components/feature/feature.jay-html': 2,
            './components/hero/hero.jay-html': 1,
        });
        // 3 catalogued templates (card, hero, feature); 2 of them (card, feature) are reused > 1.
        expect(result.designSystemReuse.catalogued).toBe(3);
        expect(result.designSystemReuse.reusedMoreThanOnce).toBe(2);
        expect(result.designSystemReuse.reusedOfCatalogued).toBe(2);
    });

    it('reports per-page coverage for every scanned page', async () => {
        const root = path.join(fixturesDir, 'ds-reuse');
        const result = await validateJayFiles({
            path: path.join(root, 'pages'),
            projectRoot: root,
        });

        const byFile = Object.fromEntries(result.designSystemCoverage.map((c) => [c.file, c]));
        // home: hero(3) + card(3) + card(3) + feature(3) = 12 elements, all covered.
        expect(byFile[path.join('pages', 'home.jay-html')]).toEqual({
            file: path.join('pages', 'home.jay-html'),
            covered: 12,
            total: 12,
            coveragePct: 1,
        });
        // about: card(3) + card(3) + feature(3) = 9 elements, all covered.
        expect(byFile[path.join('pages', 'about.jay-html')]).toEqual({
            file: path.join('pages', 'about.jay-html'),
            covered: 9,
            total: 9,
            coveragePct: 1,
        });
    });
});
