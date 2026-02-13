import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { convertJayHtmlToFigmaDoc } from '../../../lib/vendors/figma/converters/from-jay-html';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

/**
 * Fixture-based tests for jay-html → FigmaVendorDocument conversion
 *
 * Each fixture directory in `from-jay-html-fixtures/` contains:
 *   - input.jay-html:      A valid jay-html file (with <html>, <head>, jay-data script, <body>)
 *   - expected.figma.json: The expected FigmaVendorDocument output
 *   - meta.json (optional): Test metadata { pageUrl }
 *
 * Uses the real compiler parseJayFile + JAY_IMPORT_RESOLVER — the same code path
 * as the production import flow in editor-handlers.ts.
 *
 * To add a new test case:
 *   1. Create a new folder under from-jay-html-fixtures/
 *   2. Add input.jay-html with valid jay-html content
 *   3. Write the expected.figma.json (or run once, inspect actual-output.figma.json, then copy)
 *   4. Optionally add meta.json for { pageUrl }
 *   5. For fixtures with headless imports, add a src/plugins/ directory with real plugin files
 *
 * The test runner auto-discovers all fixture directories.
 */

const fixturesDir = path.join(__dirname, 'from-jay-html-fixtures');

// ─── Fixture Metadata ────────────────────────────────────────────────────────

interface FixtureMeta {
    /** Page URL passed to the converter. Default: "/" */
    pageUrl?: string;
}

function loadMeta(fixturePath: string): FixtureMeta {
    const metaPath = path.join(fixturePath, 'meta.json');
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
        return {};
    }
}

// ─── JSON Normalization ──────────────────────────────────────────────────────

/**
 * Strips undefined values from the result (JSON roundtrip)
 * so we can compare cleanly with the expected JSON file.
 */
function normalizeJson(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Removes root-level x/y from a FigmaVendorDocument.
 *
 * The root SECTION node's x/y is its position on the Figma canvas — this is
 * irrelevant for the conversion (the plugin places the section on the stage).
 * Inner node x/y is position within the parent and IS important.
 *
 * See Design Log #90 — Testing: Root node position decision.
 */
function stripRootPosition(doc: FigmaVendorDocument): FigmaVendorDocument {
    const { x, y, ...rest } = doc;
    return rest as FigmaVendorDocument;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Jay-HTML → Figma JSON (from-jay-html)', () => {
    // Dynamically discover fixture directories
    const fixtureEntries = fs.readdirSync(fixturesDir, { withFileTypes: true });
    const fixtures = fixtureEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    it('should have fixture directories available', () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const fixtureName of fixtures) {
        it(`should correctly convert: ${fixtureName}`, async () => {
            const fixturePath = path.join(fixturesDir, fixtureName);

            // 1. Read input jay-html (a valid jay-html file)
            const jayHtmlContent = fs.readFileSync(
                path.join(fixturePath, 'input.jay-html'),
                'utf-8',
            );

            // 2. Read expected output
            const expectedJson: FigmaVendorDocument = JSON.parse(
                fs.readFileSync(
                    path.join(fixturePath, 'expected.figma.json'),
                    'utf-8',
                ),
            );

            // 3. Load optional metadata
            const meta = loadMeta(fixturePath);
            const pageUrl = meta.pageUrl ?? '/';

            // 4. Parse using the real compiler + real resolver
            //    (same code path as editor-handlers.ts import flow)
            const parsedResult = await parseJayFile(
                jayHtmlContent,
                'page',                  // filename — matches real page naming
                fixturePath,             // filePath — fixture dir as context
                { relativePath: '' },    // tsconfig options
                JAY_IMPORT_RESOLVER,     // real resolver — handles imports, contracts, plugins
                fixturePath,             // projectRoot — fixture dir acts as project root
            );

            // 5. Verify parsing succeeded
            if (parsedResult.validations.length > 0) {
                throw new Error(
                    `parseJayFile failed for fixture "${fixtureName}":\n  ${parsedResult.validations.join('\n  ')}`,
                );
            }

            // 6. Run the converter
            const result = convertJayHtmlToFigmaDoc(parsedResult.val, pageUrl);

            // 7. Normalize and compare
            const normalizedResult = normalizeJson(result) as FigmaVendorDocument;

            // Strip root-level x/y — canvas placement is irrelevant for conversion
            const comparableResult = stripRootPosition(normalizedResult);
            const comparableExpected = stripRootPosition(expectedJson);

            // On mismatch, write actual output for debugging
            try {
                expect(comparableResult).toEqual(comparableExpected);
            } catch (err) {
                const actualPath = path.join(fixturePath, 'actual-output.figma.json');
                fs.writeFileSync(
                    actualPath,
                    JSON.stringify(normalizedResult, null, 2) + '\n',
                );
                console.log(
                    `\n  ⚠ Mismatch for "${fixtureName}" — actual output written to:\n    ${actualPath}\n`,
                );
                throw err;
            }
        });
    }
});
