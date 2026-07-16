import { describe, it, expect } from 'vitest';
import path from 'path';
import {
    validateJayFiles,
    extractRouteParams,
    extractHeadlessPropsParamNames,
    checkRefElementTypes,
    checkHeadlessInstanceProps,
} from '../lib/validate';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { promises as fsp } from 'fs';

describe('validateJayFiles', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should return valid result for valid jay-html file', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'valid') });

        expect(result.valid).toBe(true);
        expect(result.jayHtmlFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(0);
    });

    it('should return error for jay-html with missing jay-data script', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'missing-jay-data'),
        });

        expect(result.valid).toBe(false);
        expect(result.jayHtmlFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('jay-data');
    });

    it('should return error for jay-html with multiple jay-data scripts', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'multiple-jay-data'),
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('exactly one jay-data');
    });

    it('should validate jay-contract files', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'valid-contract'),
        });

        expect(result.valid).toBe(true);
        expect(result.contractFilesScanned).toBe(1);
        expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid jay-contract file', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'invalid-contract'),
        });

        expect(result.valid).toBe(false);
        expect(result.contractFilesScanned).toBe(1);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors[0].file).toContain('invalid.jay-contract');
    });

    it('should validate multiple files and report all errors', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'mixed-files') });

        expect(result.valid).toBe(false);
        expect(result.jayHtmlFilesScanned).toBe(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].file).toContain('invalid.jay-html');
    });

    it('should return valid result when no files found', async () => {
        const result = await validateJayFiles({ path: path.join(baseFixturesDir, 'empty') });

        expect(result.valid).toBe(true);
        expect(result.jayHtmlFilesScanned).toBe(0);
        expect(result.contractFilesScanned).toBe(0);
        expect(result.errors).toHaveLength(0);
    });
});

describe('extractRouteParams', () => {
    it('should extract params from dynamic route segments', () => {
        const params = extractRouteParams('/pages/products/[slug]/page.jay-html', '/pages');
        expect(params).toEqual(new Set(['slug']));
    });

    it('should extract optional params', () => {
        const params = extractRouteParams('/pages/[[lang]]/about/page.jay-html', '/pages');
        expect(params).toEqual(new Set(['lang']));
    });

    it('should extract catch-all params', () => {
        const params = extractRouteParams('/pages/docs/[...path]/page.jay-html', '/pages');
        expect(params).toEqual(new Set(['path']));
    });

    it('should extract multiple params', () => {
        const params = extractRouteParams('/pages/[category]/[slug]/page.jay-html', '/pages');
        expect(params).toEqual(new Set(['category', 'slug']));
    });

    it('should return empty set for static routes', () => {
        const params = extractRouteParams('/pages/products/special/page.jay-html', '/pages');
        expect(params).toEqual(new Set());
    });
});

describe('extractHeadlessPropsParamNames', () => {
    it('should extract param names from headless props', () => {
        const parsedFile = {
            headlessImports: [{ headlessProps: { slug: 'ceramic-flower-vase', category: 'home' } }],
        } as any;
        const params = extractHeadlessPropsParamNames(parsedFile);
        expect(params).toEqual(new Set(['slug', 'category']));
    });

    it('should return empty set when no headless props', () => {
        const parsedFile = {
            headlessImports: [{ contractName: 'test' }],
        } as any;
        const params = extractHeadlessPropsParamNames(parsedFile);
        expect(params).toEqual(new Set());
    });

    it('should merge props from multiple headless imports', () => {
        const parsedFile = {
            headlessImports: [
                { headlessProps: { slug: 'value' } },
                { headlessProps: { category: 'home' } },
            ],
        } as any;
        const params = extractHeadlessPropsParamNames(parsedFile);
        expect(params).toEqual(new Set(['slug', 'category']));
    });
});

describe('route param validation (integration)', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should produce no warnings when dynamic route provides contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-valid'),
        });

        expect(result.errors).toHaveLength(0);
        const routeWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Contract requires param'),
        );
        expect(routeWarnings).toHaveLength(0);
    });

    it('should produce warning when static route misses contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-missing'),
        });

        expect(result.errors).toHaveLength(0);
        const routeWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Contract requires param'),
        );
        expect(routeWarnings).toHaveLength(1);
        expect(routeWarnings[0].message).toEqual(
            'Contract requires param "slug" but the route does not provide it. ' +
                "Add a dynamic segment [slug] to the route path or provide it in the headless component's YAML body.",
        );
    });

    it('should warn when static override uses deprecated jay-params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-static-override'),
        });

        const routeWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Contract requires param'),
        );
        expect(routeWarnings.length).toBeGreaterThan(0);
    });

    it('should produce no warnings when page has no contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'valid'),
        });

        expect(result.errors).toHaveLength(0);
        const routeWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Contract requires param'),
        );
        expect(routeWarnings).toHaveLength(0);
    });
});

describe('checkRefElementTypes', () => {
    const fixturesDir = path.resolve('./test/fixtures/validate');

    async function parseFixture(fixturePath: string) {
        const jayFile = path.join(fixturesDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const filename = path.basename(jayFile.replace('.jay-html', ''));
        const dirname = path.dirname(jayFile);
        const projectRoot = dirname;
        const parsed = await parseJayFile(
            content,
            filename,
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            projectRoot,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    it('should produce no warnings when ref element types match contract', async () => {
        const jayHtml = await parseFixture('headless-coverage/page.jay-html');
        const warnings = checkRefElementTypes(jayHtml, 'test.jay-html');
        expect(warnings).toHaveLength(0);
    });

    it('should warn when ref element type does not match contract', async () => {
        const jayHtml = await parseFixture('ref-element-type-mismatch/page.jay-html');
        const warnings = checkRefElementTypes(jayHtml, 'test.jay-html');
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toEqual(
            'Ref "widget.searchInput" is on a <div> (HTMLDivElement) but the contract declares HTMLInputElement',
        );
        expect(warnings[1]).toEqual(
            'Ref "widget.items.isSelected" is on a <button> (HTMLButtonElement) but the contract declares HTMLInputElement',
        );
    });
});

describe('ref element type validation (integration)', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should produce errors for ref element type mismatches via validateJayFiles', async () => {
        const fixtureDir = path.join(baseFixturesDir, 'ref-element-type-mismatch');
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        expect(result.valid).toBe(false);
        const refErrors = result.errors.filter((e) => e.message.startsWith('Ref "'));
        expect(refErrors).toHaveLength(2);
        expect(refErrors[0].stage).toBe('generate');
    });
});

describe('route-to-contract param validation (DL#124 Phase 1)', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should produce warning when route has [slug] but contract has no params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-to-contract-missing'),
        });

        expect(result.errors).toHaveLength(0);
        const routeWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Route provides param'),
        );
        expect(routeWarnings).toHaveLength(1);
        expect(routeWarnings[0].message).toEqual(
            'Route provides param "slug" but no contract on this page declares it. ' +
                'Add params: { slug: string } to the appropriate contract.',
        );
    });

    it('should produce no warning when route has [slug] and contract declares params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-valid'),
        });

        expect(result.errors).toHaveLength(0);
        // Should have no route-to-contract warnings (existing test verifies no warnings at all)
        const routeToContractWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Route provides param'),
        );
        expect(routeToContractWarnings).toHaveLength(0);
    });

    it('should produce no warning for static routes', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'valid'),
        });

        const routeToContractWarnings = result.warnings.filter((w) =>
            w.message.startsWith('Route provides param'),
        );
        expect(routeToContractWarnings).toHaveLength(0);
    });
});

describe('headless instance props validation (DL#124 Phase 2)', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should warn when jay:xxx passes attribute not declared as contract prop', async () => {
        const fixtureDir = path.join(baseFixturesDir, 'headless-props-undeclared');
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        const propWarnings = result.warnings.filter((w) => w.message.includes('passes attribute'));
        expect(propWarnings).toHaveLength(1);
        expect(propWarnings[0].message).toEqual(
            '<jay:test-widget> passes attribute "itemId" but the "Widget" contract does not declare it as a prop. ' +
                'Add to test-widget.jay-contract: props: [{ name: itemId, type: string }]',
        );
    });

    it('should warn when jay:xxx is missing a required contract prop', async () => {
        const fixtureDir = path.join(baseFixturesDir, 'headless-props-missing-required');
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        const propWarnings = result.warnings.filter((w) =>
            w.message.includes('missing required prop'),
        );
        expect(propWarnings).toHaveLength(1);
        expect(propWarnings[0].message).toEqual(
            '<jay:test-widget> is missing required prop "itemId" declared in the "Widget" contract.',
        );
    });

    it('should not warn when props match contract', async () => {
        // The headless-coverage fixture has a widget used as <jay:test-widget> with keyed access
        // It has no props passed, and no props declared — should be clean
        const fixtureDir = path.join(baseFixturesDir, 'headless-coverage');
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        const propWarnings = result.warnings.filter(
            (w) =>
                w.message.includes('passes attribute') ||
                w.message.includes('missing required prop'),
        );
        expect(propWarnings).toHaveLength(0);
    });

    describe('prop binding phase validation (DL#152)', () => {
        function makeJayHtml(options: {
            pageTagPhase?: string;
            propPhase?: string;
            propValue: string;
        }): any {
            const { pageTagPhase, propPhase, propValue } = options;
            return {
                body: {
                    childNodes: [
                        {
                            nodeType: 1,
                            rawTagName: 'jay:category-products',
                            attributes: { categoryslug: propValue },
                            childNodes: [],
                        },
                    ],
                },
                headlessImports: [
                    {
                        contractName: 'category-products',
                        contract: {
                            name: 'category-products',
                            tags: [],
                            props: [
                                {
                                    name: 'categorySlug',
                                    dataType: { kind: 'primitive', name: 'string' },
                                    ...(propPhase ? { phase: propPhase } : {}),
                                },
                            ],
                        },
                    },
                    {
                        key: 'p',
                        contractName: 'product-page',
                        contract: {
                            name: 'product-page',
                            tags: [
                                {
                                    tag: 'categorySlug',
                                    type: [0],
                                    ...(pageTagPhase ? { phase: pageTagPhase } : {}),
                                },
                            ],
                        },
                    },
                ],
                contract: { name: 'page', tags: [] },
            };
        }

        it('should warn when fast-phase binding is used for slow-phase prop', () => {
            const jayHtml = makeJayHtml({
                pageTagPhase: 'fast+interactive',
                propValue: '{p.categorySlug}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([
                '<jay:category-products> prop "categorySlug" (phase: slow) is bound to {p.categorySlug} which is phase: fast+interactive. ' +
                    'The binding source phase must be ≤ the prop phase. ' +
                    'Use a slow-phase binding, a route param, or a literal value.',
            ]);
        });

        it('should not warn when slow-phase binding is used for fast-phase prop', () => {
            const jayHtml = makeJayHtml({
                pageTagPhase: 'slow',
                propPhase: 'fast',
                propValue: '{p.categorySlug}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            const phaseWarnings = warnings.filter((w) => w.includes('phase'));
            expect(phaseWarnings).toEqual([]);
        });

        it('should not warn for literal prop values', () => {
            const jayHtml = makeJayHtml({
                propValue: 'best-sellers',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            const phaseWarnings = warnings.filter((w) => w.includes('phase'));
            expect(phaseWarnings).toEqual([]);
        });

        it('should not warn when phases match', () => {
            const jayHtml = makeJayHtml({
                pageTagPhase: 'slow',
                propValue: '{p.categorySlug}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            const phaseWarnings = warnings.filter((w) => w.includes('phase'));
            expect(phaseWarnings).toEqual([]);
        });

        it('should warn when fast binding used for prop with no explicit phase (defaults slow)', () => {
            const jayHtml = makeJayHtml({
                pageTagPhase: 'fast',
                propValue: '{p.categorySlug}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([
                '<jay:category-products> prop "categorySlug" (phase: slow) is bound to {p.categorySlug} which is phase: fast. ' +
                    'The binding source phase must be ≤ the prop phase. ' +
                    'Use a slow-phase binding, a route param, or a literal value.',
            ]);
        });
    });

    describe('plugin validators (DL#145)', () => {
        const pluginFixtureDir = path.join(baseFixturesDir, 'plugin-validator');

        it('should report error for missing title', async () => {
            const result = await validateJayFiles({
                path: pluginFixtureDir,
                projectRoot: pluginFixtureDir,
            });

            const titleErrors = result.errors.filter(
                (e) => e.source === 'test-validator/check-title',
            );
            expect(titleErrors).toHaveLength(1);
            expect(titleErrors[0].message).toBe('Page is missing a <title> element');
            expect(titleErrors[0].suggestion).toBe('Add a <title> element inside <head>');
        });

        it('should warn on wix-image binding without resize params', async () => {
            const result = await validateJayFiles({
                path: pluginFixtureDir,
                projectRoot: pluginFixtureDir,
            });

            const imageWarnings = result.warnings.filter(
                (w) => w.source === 'test-validator/check-wix-image',
            );
            expect(imageWarnings).toHaveLength(1);
            expect(imageWarnings[0].message).toBe(
                'Wix image binding {heroImage} missing resize params',
            );
            expect(imageWarnings[0].suggestion).toBeDefined();
        });

        it('should warn on img without alt attribute', async () => {
            const result = await validateJayFiles({
                path: pluginFixtureDir,
                projectRoot: pluginFixtureDir,
            });

            const altWarnings = result.warnings.filter(
                (w) => w.source === 'test-validator/check-alt',
            );
            expect(altWarnings).toHaveLength(1);
            expect(altWarnings[0].message).toBe('Image element missing alt attribute');
        });

        it('should not fail when no plugins exist', async () => {
            const result = await validateJayFiles({
                path: path.join(baseFixturesDir, 'valid'),
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
