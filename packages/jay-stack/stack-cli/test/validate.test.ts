import { describe, it, expect } from 'vitest';
import path from 'path';
import {
    validateJayFiles,
    extractRouteParams,
    extractJayParams,
    checkRouteParams,
    checkRefElementTypes,
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

describe('extractJayParams', () => {
    it('should extract param names from jay-params script', () => {
        const html = `<html><head>
            <script type="application/jay-params">
              slug: ceramic-flower-vase
              category: home
            </script>
        </head><body></body></html>`;
        const params = extractJayParams(html);
        expect(params).toEqual(new Set(['slug', 'category']));
    });

    it('should return empty set when no jay-params script', () => {
        const html = `<html><head>
            <script type="application/jay-data">
              data:
                title: string
            </script>
        </head><body></body></html>`;
        const params = extractJayParams(html);
        expect(params).toEqual(new Set());
    });

    it('should return empty set when no head', () => {
        const html = `<div>No head</div>`;
        const params = extractJayParams(html);
        expect(params).toEqual(new Set());
    });
});

describe('route param validation (integration)', () => {
    const baseFixturesDir = path.resolve('./test/fixtures/validate');

    it('should produce no warnings when dynamic route provides contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-valid'),
        });

        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
    });

    it('should produce no warnings when jay-params provides contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-static-override'),
        });

        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
    });

    it('should produce warning when static route misses contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'route-params-missing'),
        });

        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].message).toEqual(
            'Contract requires param "slug" but the route does not provide it. ' +
                'Add a dynamic segment [slug] to the route path or declare it in <script type="application/jay-params">.',
        );
    });

    it('should produce no warnings when page has no contract params', async () => {
        const result = await validateJayFiles({
            path: path.join(baseFixturesDir, 'valid'),
        });

        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
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
