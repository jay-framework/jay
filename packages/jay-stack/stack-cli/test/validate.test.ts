import { describe, it, expect } from 'vitest';
import path from 'path';
import {
    validateJayFiles,
    extractRouteParams,
    extractHeadlessPropsParamNames,
    checkRefElementTypes,
    checkHeadlessInstanceProps,
    checkRegionDrift,
    checkRegionCssDrift,
    checkRegionCssScoping,
    checkNestedRegionRefs,
    checkRegionCssNoRef,
    checkRegionRecursion,
    checkRegionNotLinked,
    checkRegionOverrideNonContent,
    checkComponentNoTemplate,
    checkNoDesignSystem,
} from '../lib/validate';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { JayEnumType, JayAtomicType } from '@jay-framework/compiler-shared';
import { promises as fsp, readFileSync } from 'fs';

/** Read a file synchronously, returning undefined when it does not exist (test template loader). */
function readFileSyncSafe(filePath: string): string | undefined {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

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
        expect(result.errors[0].message).toContain(
            'exactly one <script type="application/jay-data">',
        );
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

    it('should return an error when a page uses removed jay-params (DL#156)', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'deprecated-jay-params'),
        });

        expect(result.valid).toBe(false);
        const jayParamsErrors = result.errors.filter((e) =>
            e.message.startsWith('<script type="application/jay-params">'),
        );
        expect(jayParamsErrors).toHaveLength(1);
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

describe('checkRegionDrift (DL#196)', () => {
    const fixturesDir = path.resolve('./test/fixtures/validate');
    const driftDir = path.join(fixturesDir, 'region-drift');

    async function parseDriftPage(fixturePath: string) {
        const jayFile = path.join(driftDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const dirname = path.dirname(jayFile);
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            driftDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    // Loads `template=` relative to the page directory, exactly as the CLI's file-system loader does.
    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(driftDir, rel.replace(/^\.\//, '')));

    it('reports the unmarked facet and suppresses the override-marked facet', async () => {
        const jayHtml = await parseDriftPage('page.jay-html');
        const warnings = checkRegionDrift(jayHtml, fsLoader);

        // Region B (unmarked <h3> text edit) is caught; region A (override="class") is not.
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toEqual({
            message:
                '<jay:card> region differs from source template "./components/card/card.jay-html": ' +
                '<h3> children changed ("{heading}" → "On sale now").',
            suggestion:
                'To keep the page\'s version, mark the node override="children"; ' +
                'to discard it and re-flatten from source, run `jay-stack sync`.' +
                ' Or, if these children are a content slot, mark the node jay-content in the template ' +
                '"./components/card/card.jay-html" so consumer edits are expected.',
        });
    });

    it('reports no drift for a region without template provenance', async () => {
        const jayHtml = await parseDriftPage('page-no-template.jay-html');
        const warnings = checkRegionDrift(jayHtml, fsLoader);
        expect(warnings).toHaveLength(0);
    });

    it('warns when the declared source template cannot be read', async () => {
        const jayHtml = await parseDriftPage('page.jay-html');
        const warnings = checkRegionDrift(jayHtml, () => undefined);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toEqual({
            message:
                '<jay:card> declares template="./components/card/card.jay-html" but its source ' +
                'template could not be read.',
            suggestion: 'Fix the path or remove the attribute.',
        });
    });
});

describe('checkRegionCssDrift (DL#196)', () => {
    const fixturesDir = path.resolve('./test/fixtures/validate');
    const cssDir = path.join(fixturesDir, 'region-css-drift');

    async function parseCssPage(fixturePath: string) {
        const jayFile = path.join(cssDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const dirname = path.dirname(jayFile);
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            cssDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(cssDir, rel.replace(/^\.\//, '')));

    it('reports the drifted declaration inside the region @scope block', async () => {
        const jayHtml = await parseCssPage('page.jay-html');
        const warnings = checkRegionCssDrift(jayHtml, fsLoader);

        // Only .card-heading color drifted (black → red); font-weight and .card-body are unchanged.
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toEqual({
            message:
                '<jay:card> region differs from source template "./components/card/card.jay-html": ' +
                'css ".card-heading" declaration "color" changed (black → red).',
            suggestion:
                "To keep the page's version, mark the CSS rule /* jay:override: color */; " +
                'to discard it and re-flatten from source, run `jay-stack sync`.',
        });
    });
});

describe('checkRegionCssScoping (DL#196 §4/§5 coalescing)', () => {
    const scopingDir = path.resolve('./test/fixtures/validate/region-css-scoping');

    async function parseScopingPage(fixturePath: string) {
        const jayFile = path.join(scopingDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
            {},
            JAY_IMPORT_RESOLVER,
            scopingDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(scopingDir, rel.replace(/^\.\//, '')));

    it('accepts a coalesced selector-list @scope block (no scoping warnings)', async () => {
        const jayHtml = await parseScopingPage('coalesced.jay-html');
        expect(checkRegionCssScoping(jayHtml)).toEqual([]);
    });

    it('reports two identical same-template blocks as not coalesced', async () => {
        const jayHtml = await parseScopingPage('not-coalesced.jay-html');
        const warnings = checkRegionCssScoping(jayHtml);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
            '2 @scope blocks (.cardStarter ; .cardPro) share template ' +
                '"./components/card/card.jay-html" and identical CSS but are not coalesced into one ' +
                'selector-list block.',
        );
        expect(warnings[0].suggestion).toBe('Run jay-stack sync to coalesce the region CSS.');
    });

    it('reports a block whose selector-list mixes two source templates', async () => {
        const jayHtml = await parseScopingPage('mixed.jay-html');
        const warnings = checkRegionCssScoping(jayHtml);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
            'A single @scope (.cardStarter, .badgeOne) block mixes refs from different source templates ' +
                "(./components/card/card.jay-html, ./components/badge/badge.jay-html); each region's CSS " +
                'must be scoped to its own template.',
        );
        expect(warnings[0].suggestion).toBe('Run jay-stack sync to re-flatten the region CSS.');
    });

    it('reports a region whose template ships CSS but the page has no @scope block', async () => {
        const jayHtml = await parseScopingPage('missing.jay-html');
        const warnings = checkRegionCssDrift(jayHtml, fsLoader);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
            '<jay:card> (template="./components/card/card.jay-html") has no @scope (.promo) CSS block ' +
                'on the page, but its source template ships CSS.',
        );
        expect(warnings[0].suggestion).toBe('Run jay-stack sync to re-flatten the region CSS.');
    });
});

describe('checkNestedRegionRefs (DL#203 — require ref on nested regions under scoped CSS)', () => {
    const nestedDir = path.resolve('./test/fixtures/validate/region-nested-ref');

    async function parseNestedPage(fixturePath: string) {
        const jayFile = path.join(nestedDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
            {},
            JAY_IMPORT_RESOLVER,
            nestedDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(nestedDir, rel.replace(/^\.\//, '')));

    it('warns when a materialisable nested region under a CSS-shipping parent has no ref', async () => {
        const jayHtml = await parseNestedPage('page-missing-ref.jay-html');
        const warnings = checkNestedRegionRefs(jayHtml, fsLoader);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
            '<jay:button> is nested inside <jay:card> (template="./components/card/card.jay-html"), ' +
                'whose CSS is scoped as an @scope (.cardStarter) donut, but <jay:button> has no ref= — ' +
                "so its region cannot be isolated from the parent's styles.",
        );
        expect(warnings[0].suggestion).toBe(
            'Add a ref= to the <jay:button> in template "./components/card/card.jay-html" so sync can ' +
                'stamp its scope-anchor class and emit the `to (.<ref>)` boundary.',
        );
    });

    it('accepts a nested region that carries a ref (no warning)', async () => {
        const jayHtml = await parseNestedPage('page-with-ref.jay-html');
        expect(checkNestedRegionRefs(jayHtml, fsLoader)).toEqual([]);
    });
});

describe('checkRegionCssNoRef (DL#209 — region ships CSS but has no ref)', () => {
    const noRefDir = path.resolve('./test/fixtures/validate/region-css-no-ref');

    async function parseNoRefPage(fixturePath: string) {
        const jayFile = path.join(noRefDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
            {},
            JAY_IMPORT_RESOLVER,
            noRefDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(noRefDir, rel.replace(/^\.\//, '')));

    it('reports a region whose template ships CSS but the tag has no ref', async () => {
        const jayHtml = await parseNoRefPage('page-no-ref.jay-html');
        const findings = checkRegionCssNoRef(jayHtml, fsLoader);
        expect(findings).toHaveLength(1);
        expect(findings[0]).toEqual({
            message:
                '<jay:card> flattens template="./components/card/card.jay-html" which ships CSS, but ' +
                'the region has no ref= — so its CSS cannot be scoped and `jay-stack sync` will silently ' +
                'drop it.',
            suggestion:
                'Add a ref= to the <jay:card> so sync can scope its CSS as an @scope (.<ref>) block ' +
                'and preserve it.',
        });
    });

    it('accepts a CSS-shipping region that carries a ref (no finding)', async () => {
        const jayHtml = await parseNoRefPage('page-with-ref.jay-html');
        expect(checkRegionCssNoRef(jayHtml, fsLoader)).toEqual([]);
    });

    it('accepts a ref-less region whose template ships no CSS (nothing to lose)', async () => {
        const jayHtml = await parseNoRefPage('page-no-css.jay-html');
        expect(checkRegionCssNoRef(jayHtml, fsLoader)).toEqual([]);
    });
});

describe('checkRegionRecursion (DL#196)', () => {
    const fixturesDir = path.resolve('./test/fixtures/validate');
    const recursionDir = path.join(fixturesDir, 'region-recursion');

    async function parseRecursionPage(fixturePath: string) {
        const jayFile = path.join(recursionDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const dirname = path.dirname(jayFile);
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            recursionDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return { content, jayHtml: parsed.val!, dirname };
    }

    it('detects a template-inclusion cycle', async () => {
        const { content, jayHtml, dirname } = await parseRecursionPage('page.jay-html');
        const errors = checkRegionRecursion(content, dirname, jayHtml, readFileSyncSafe);
        expect(errors).toHaveLength(1);
        expect(errors[0].startsWith('template inclusion cycle: <jay:loop>')).toBe(true);
    });

    it('reports no cycle for a non-recursive design-system page', async () => {
        const cssDir = path.join(fixturesDir, 'region-css-drift');
        const jayFile = path.join(cssDir, 'page.jay-html');
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsed = await parseJayFile(content, 'page', cssDir, {}, JAY_IMPORT_RESOLVER, cssDir);
        const errors = checkRegionRecursion(content, cssDir, parsed.val!, readFileSyncSafe);
        expect(errors).toHaveLength(0);
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

    it('should error when jay:xxx is missing a required contract prop', async () => {
        const fixtureDir = path.join(baseFixturesDir, 'headless-props-missing-required');
        const result = await validateJayFiles({
            path: fixtureDir,
            projectRoot: fixtureDir,
        });

        const propErrors = result.errors.filter((e) => e.message.includes('missing required prop'));
        expect(propErrors).toHaveLength(1);
        expect(propErrors[0].message).toEqual(
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

    describe('structural passthrough prop phase from tag (DL#189)', () => {
        // A no-code structural passthrough region (DL#196): props ≡ tags. The parser defaults every
        // prop's phase to slow and carries the real phase on the tags, so validation must read
        // the effective prop phase from the matching tag for structural imports.
        function makeStructuralJayHtml(options: {
            statusTagPhase: string;
            pageTagPhase: string;
            propValue: string;
        }): any {
            const { statusTagPhase, pageTagPhase, propValue } = options;
            return {
                body: {
                    childNodes: [
                        {
                            nodeType: 1,
                            rawTagName: 'jay:badge',
                            attributes: { status: propValue },
                            childNodes: [],
                        },
                    ],
                },
                headlessImports: [
                    {
                        contractName: 'badge',
                        structural: true,
                        contract: {
                            name: 'badge',
                            tags: [{ tag: 'status', type: [2], phase: statusTagPhase }],
                            // Parser defaults prop phase to slow (does not inherit from tag).
                            props: [
                                {
                                    name: 'status',
                                    dataType: { kind: 'primitive', name: 'string' },
                                    phase: 'slow',
                                },
                            ],
                        },
                    },
                ],
                contract: {
                    name: 'page',
                    tags: [{ tag: 'currentStatus', type: [2], phase: pageTagPhase }],
                },
            };
        }

        it('does not warn when a fast+interactive source drives a fast+interactive tag prop', () => {
            const jayHtml = makeStructuralJayHtml({
                statusTagPhase: 'fast+interactive',
                pageTagPhase: 'fast+interactive',
                propValue: '{currentStatus}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            const phaseWarnings = warnings.filter((w) => w.includes('phase'));
            expect(phaseWarnings).toEqual([]);
        });

        it('warns when a fast+interactive source drives a constant fast tag prop', () => {
            const jayHtml = makeStructuralJayHtml({
                statusTagPhase: 'fast',
                pageTagPhase: 'fast+interactive',
                propValue: '{currentStatus}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([
                '<jay:badge> prop "status" (phase: fast) is bound to {currentStatus} which is phase: fast+interactive. ' +
                    'The binding source phase must be ≤ the prop phase. ' +
                    'Use a fast-phase binding, a route param, or a literal value.',
            ]);
        });

        it('keeps the declared prop phase for a non-structural import even if a tag shares the name', () => {
            const jayHtml = makeStructuralJayHtml({
                statusTagPhase: 'fast+interactive',
                pageTagPhase: 'fast+interactive',
                propValue: '{currentStatus}',
            });
            // Flip to a code-backed import: props and tags are distinct, so the slow prop phase
            // stands and the fast+interactive source is (correctly) flagged.
            jayHtml.headlessImports[0].structural = false;
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([
                '<jay:badge> prop "status" (phase: slow) is bound to {currentStatus} which is phase: fast+interactive. ' +
                    'The binding source phase must be ≤ the prop phase. ' +
                    'Use a slow-phase binding, a route param, or a literal value.',
            ]);
        });
    });

    describe('enum value / binding type validation (DL#192)', () => {
        // Build a <jay:badge status="..."> instance whose `status` prop has the given data type.
        // For bindings ({currentStatus}) the page contract exposes a `currentStatus` tag whose
        // dataType is `sourceType`. equalJayTypes is instanceof-based, so tests pass real
        // JayEnumType / JayAtomicType instances (not the plain {kind,name} objects used elsewhere).
        function makeEnumJayHtml(options: {
            propType: any;
            propValue: string;
            sourceType?: any;
            structural?: boolean;
        }): any {
            const { propType, propValue, sourceType, structural } = options;
            return {
                body: {
                    childNodes: [
                        {
                            nodeType: 1,
                            rawTagName: 'jay:badge',
                            attributes: { status: propValue },
                            childNodes: [],
                        },
                    ],
                },
                headlessImports: [
                    {
                        contractName: 'badge',
                        ...(structural ? { structural: true } : {}),
                        contract: {
                            name: 'badge',
                            tags: structural
                                ? [{ tag: 'status', type: [2], dataType: propType }]
                                : [],
                            props: [{ name: 'status', dataType: propType, required: false }],
                        },
                    },
                ],
                contract: {
                    name: 'page',
                    tags: sourceType
                        ? [{ tag: 'currentStatus', type: [0], dataType: sourceType }]
                        : [{ tag: 'currentStatus', type: [0] }],
                },
            };
        }

        const status = () => new JayEnumType('Status', ['active', 'inactive', 'archived']);

        function typeErrors(warnings: string[]): string[] {
            return warnings.filter(
                (w) =>
                    w.includes('is not a declared value of enum') ||
                    w.includes('binding source type must match'),
            );
        }

        it('does not warn for a valid static enum value', () => {
            const jayHtml = makeEnumJayHtml({ propType: status(), propValue: 'active' });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([]);
        });

        it('warns for a static value that is not a member of the enum', () => {
            const jayHtml = makeEnumJayHtml({ propType: status(), propValue: 'pending' });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" = "pending" is not a declared value of ' +
                    'enum(active | inactive | archived). Use one of: active, inactive, archived.',
            ]);
        });

        it('warns for a static value whose case does not match a member exactly', () => {
            const jayHtml = makeEnumJayHtml({ propType: status(), propValue: 'Active' });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" = "Active" is not a declared value of ' +
                    'enum(active | inactive | archived). Use one of: active, inactive, archived.',
            ]);
        });

        it('does not warn for a non-enum static value', () => {
            const jayHtml = makeEnumJayHtml({
                propType: new JayAtomicType('string'),
                propValue: 'anything',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([]);
        });

        it('does not warn for a binding whose source enum has the same members in order', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: '{currentStatus}',
                sourceType: new JayEnumType('CurrentStatus', ['active', 'inactive', 'archived']),
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([]);
        });

        it('warns for a binding whose source enum has the same members in a different order', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: '{currentStatus}',
                sourceType: new JayEnumType('CurrentStatus', ['inactive', 'active', 'archived']),
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" (enum(active | inactive | archived)) is bound to ' +
                    '{currentStatus} (enum(inactive | active | archived)). ' +
                    'The binding source type must match the prop type.',
            ]);
        });

        it('warns for a binding whose source enum has different members', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: '{currentStatus}',
                sourceType: new JayEnumType('CurrentStatus', ['on', 'off']),
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" (enum(active | inactive | archived)) is bound to ' +
                    '{currentStatus} (enum(on | off)). ' +
                    'The binding source type must match the prop type.',
            ]);
        });

        it('warns for a binding whose source is a primitive bound to an enum prop', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: '{currentStatus}',
                sourceType: new JayAtomicType('string'),
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" (enum(active | inactive | archived)) is bound to ' +
                    '{currentStatus} (string). ' +
                    'The binding source type must match the prop type.',
            ]);
        });

        it('does not warn when the binding source type cannot be resolved', () => {
            // Page tag exists but declares no dataType — nothing to compare against, skip.
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: '{currentStatus}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([]);
        });

        it('does not validate a mixed literal/expression attribute value', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: 'prefix-{currentStatus}',
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([]);
        });

        it('validates a static enum value for a structural passthrough import', () => {
            const jayHtml = makeEnumJayHtml({
                propType: status(),
                propValue: 'pending',
                structural: true,
            });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(typeErrors(warnings)).toEqual([
                '<jay:badge> prop "status" = "pending" is not a declared value of ' +
                    'enum(active | inactive | archived). Use one of: active, inactive, archived.',
            ]);
        });

        it('classifies enum value and binding type mismatches as errors in validateJayFiles', async () => {
            const dir = path.join(baseFixturesDir, 'enum-value-invalid');
            const result = await validateJayFiles({ path: dir, projectRoot: dir });
            expect(result.valid).toBe(false);
            const enumErrors = result.errors.filter((e) =>
                e.message.includes('is not a declared value of enum'),
            );
            expect(enumErrors.length).toBeGreaterThan(0);
        });
    });

    describe('compiler-injected jc marker (DL#186)', () => {
        function makeJayHtmlWithAttrs(attributes: Record<string, string>): any {
            return {
                body: {
                    childNodes: [
                        {
                            nodeType: 1,
                            rawTagName: 'jay:site-header',
                            attributes,
                            childNodes: [],
                        },
                    ],
                },
                headlessImports: [
                    {
                        contractName: 'site-header',
                        contract: {
                            name: 'site-header',
                            tags: [],
                            props: [],
                        },
                    },
                ],
                contract: { name: 'page', tags: [] },
            };
        }

        it('should not warn for the compiler-injected jc attribute on an empty headfull instance', () => {
            const jayHtml = makeJayHtmlWithAttrs({ jc: 'site-header' });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([]);
        });

        it('should still warn for an author-supplied undeclared attribute (control)', () => {
            const jayHtml = makeJayHtmlWithAttrs({ jc: 'site-header', foo: 'x' });
            const warnings = checkHeadlessInstanceProps(jayHtml, 'test.jay-html');
            expect(warnings).toEqual([
                '<jay:site-header> passes attribute "foo" but the "site-header" contract does not declare it as a prop. ' +
                    'Add to site-header.jay-contract: props: [{ name: foo, type: string }]',
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

describe('prefer design-system elements (DL#200)', () => {
    const dsDir = path.resolve('./test/fixtures/validate/design-system');

    async function parseDsPage(fixture: string) {
        const jayFile = path.join(dsDir, fixture);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
            {},
            JAY_IMPORT_RESOLVER,
            dsDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return parsed.val!;
    }

    const fsLoader = (rel: string) =>
        readFileSyncSafe(path.resolve(dsDir, rel.replace(/^\.\//, '')));
    const templateAvailable = () => [{ path: './card.jay-html', variant: '' }];
    const templateUnavailable = () => [];

    describe('R1 — REGION-NOT-LINKED', () => {
        it('warns when a hand-authored region has a template available for its contract', async () => {
            const jayHtml = await parseDsPage('not-linked.jay-html');
            const findings = checkRegionNotLinked(jayHtml, templateAvailable);
            expect(findings).toEqual([
                {
                    message:
                        '<jay:card> is hand-authored, but a design-system template exists for contract ' +
                        '"card". Prefer linking it as a design-system element.',
                    suggestion:
                        'Add template="./card.jay-html" to the <script type="application/jay-headless"> ' +
                        'import and run `jay-stack sync`. For a deliberate one-off, suppress on the import ' +
                        'with jay-validations="REGION-NOT-LINKED" (or list the contract under ' +
                        'allow-inline-region in <script type="application/jay-validations">). ' +
                        'See agent-kit/designer/design-system-guide.md.',
                },
            ]);
        });

        it('stays silent when no template exists for the contract', async () => {
            const jayHtml = await parseDsPage('not-linked.jay-html');
            expect(checkRegionNotLinked(jayHtml, templateUnavailable)).toEqual([]);
        });

        it('stays silent when the region is already linked (template=)', async () => {
            const jayHtml = await parseDsPage('linked.jay-html');
            expect(checkRegionNotLinked(jayHtml, templateAvailable)).toEqual([]);
        });

        it('stays silent when suppressed on the import (jay-validations attribute)', async () => {
            const jayHtml = await parseDsPage('not-linked-suppressed.jay-html');
            expect(checkRegionNotLinked(jayHtml, templateAvailable)).toEqual([]);
        });

        it('stays silent when suppressed via allow-inline-region list', async () => {
            const jayHtml = await parseDsPage('not-linked.jay-html');
            jayHtml.validationOverrides = { 'jay-stack': { 'allow-inline-region': ['Card'] } };
            expect(checkRegionNotLinked(jayHtml, templateAvailable)).toEqual([]);
        });

        it('stays silent for a keyed import', async () => {
            const jayHtml = await parseDsPage('not-linked.jay-html');
            jayHtml.headlessImports[0].key = 'cards';
            expect(checkRegionNotLinked(jayHtml, templateAvailable)).toEqual([]);
        });
    });

    describe('R3 — REGION-OVERRIDE-NON-CONTENT', () => {
        it('stays silent for content-only drift (text + inline content markup)', async () => {
            const jayHtml = await parseDsPage('override-content.jay-html');
            expect(checkRegionOverrideNonContent(jayHtml, fsLoader)).toEqual([]);
        });

        it('warns on a style/class override', async () => {
            const jayHtml = await parseDsPage('override-style.jay-html');
            const findings = checkRegionOverrideNonContent(jayHtml, fsLoader);
            expect(findings).toEqual([
                {
                    message:
                        "<jay:card> changes its design-system template's look or structure (style, class, " +
                        'or net-new layout DOM) — that is a different design, not a content tweak.',
                    suggestion:
                        'Prefer a second design-system template (a new variant) for contract "card" ' +
                        'and link this region to it. Editing text/images, or enriching text with inline ' +
                        'markup, is fine; use conditionals only for runtime state changes, not for a ' +
                        'different design. To accept this override, suppress on the import with ' +
                        'jay-validations="REGION-OVERRIDE-NON-CONTENT". ' +
                        'See agent-kit/designer/design-system-guide.md.',
                },
            ]);
        });

        it('warns on net-new structural DOM (non-allowlisted tag)', async () => {
            const jayHtml = await parseDsPage('override-structural.jay-html');
            const findings = checkRegionOverrideNonContent(jayHtml, fsLoader);
            expect(findings).toHaveLength(1);
            expect(findings[0].message).toEqual(
                "<jay:card> changes its design-system template's look or structure (style, class, " +
                    'or net-new layout DOM) — that is a different design, not a content tweak.',
            );
        });

        it('stays silent when suppressed on the import', async () => {
            const jayHtml = await parseDsPage('override-style.jay-html');
            jayHtml.headlessImports[0].suppressedValidations = ['REGION-OVERRIDE-NON-CONTENT'];
            expect(checkRegionOverrideNonContent(jayHtml, fsLoader)).toEqual([]);
        });
    });

    describe('R2 — COMPONENT-NO-TEMPLATE', () => {
        const hasTemplate = (file: string) => file.endsWith('with-template.jay-contract');

        it('warns when a component ships no template', () => {
            const finding = checkComponentNoTemplate(
                '/x/components/banner/banner.jay-contract',
                'Banner',
                hasTemplate,
                new Set(),
            );
            expect(finding).toEqual({
                message:
                    'Component "Banner" ships no .jay-html template. If it renders UI, create a reusable ' +
                    'design-system template so consumers flatten it (template= + jay-stack sync) instead ' +
                    'of hand-authoring each usage.',
                suggestion:
                    'Author a banner.jay-html next to the contract. If this component is intentionally ' +
                    'UI-less (data/logic only), suppress project-wide with allow-no-template: ["Banner"] ' +
                    'in <script type="application/jay-validations">. ' +
                    'See agent-kit/designer/design-system-guide.md.',
            });
        });

        it('stays silent when a template exists for the component', () => {
            expect(
                checkComponentNoTemplate(
                    '/x/components/card/with-template.jay-contract',
                    'Card',
                    hasTemplate,
                    new Set(),
                ),
            ).toBeUndefined();
        });

        it('stays silent when suppressed by contract name', () => {
            expect(
                checkComponentNoTemplate(
                    '/x/components/banner/banner.jay-contract',
                    'Banner',
                    hasTemplate,
                    new Set(['banner']),
                ),
            ).toBeUndefined();
        });
    });

    describe('R4 — NO-DESIGN-SYSTEM', () => {
        it('nudges to link when regions exist but none are design-system elements', () => {
            const finding = checkNoDesignSystem(3, 0, false);
            expect(finding).toEqual({
                message:
                    'This project composes components but none are design-system elements (no template= ' +
                    'imports). Ship a .jay-html template with a reused component and flatten it so pages ' +
                    'share consistent, upgradable UI.',
                suggestion:
                    'Add template= to a headless import and run `jay-stack sync`. Suppress project-wide ' +
                    'with allow-no-design-system: true in <script type="application/jay-validations">. ' +
                    'See agent-kit/designer/design-system-guide.md.',
            });
        });

        it('nudges to adopt regions when there are no regions at all', () => {
            const finding = checkNoDesignSystem(0, 0, false);
            expect(finding).toEqual({
                message:
                    'This project shares no UI through design-system elements. Consider composing ' +
                    'reusable sections as components with .jay-html templates — regions can be used ' +
                    'without code, purely to flatten and share a design system.',
                suggestion:
                    'See agent-kit/designer/design-system-guide.md. Suppress project-wide with ' +
                    'allow-no-design-system: true in <script type="application/jay-validations">.',
            });
        });

        it('stays silent when the project has at least one design-system element', () => {
            expect(checkNoDesignSystem(5, 1, false)).toBeUndefined();
        });

        it('stays silent when suppressed project-wide', () => {
            expect(checkNoDesignSystem(3, 0, true)).toBeUndefined();
        });
    });
});
