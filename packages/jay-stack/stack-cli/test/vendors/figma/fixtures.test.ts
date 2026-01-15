import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createEditorHandlers } from '../../../lib/editor-handlers';
import type { ExportMessage, FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { JayConfig } from '../../../lib/config';

/**
 * Fixture-based integration tests for Figma vendor
 *
 * Each fixture directory contains:
 * - page.figma.json: Input Figma document
 * - page.jay-contract: Contract definition
 * - expected.jay-html: Expected HTML output
 *
 * Tests use the full export flow (like real usage):
 * 1. Load Figma document and contract
 * 2. Send export message through editor handlers
 * 3. Verify generated jay-html file matches expected
 */

const fixturesDir = path.join(__dirname, 'fixtures');
const testDir = path.join(process.cwd(), 'tmp-test-fixtures');

/**
 * Normalizes HTML for comparison by:
 * - Removing extra whitespace
 * - Normalizing quotes
 * - Removing comments
 */
function normalizeHtml(html: string): string {
    return (
        html
            // Remove comments
            .replace(/<!--[\s\S]*?-->/g, '')
            // Normalize whitespace between tags
            .replace(/>\s+</g, '><')
            // Normalize multiple spaces to single space
            .replace(/\s+/g, ' ')
            // Trim each line
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join('\n')
            .trim()
    );
}

describe('Figma Vendor Fixtures', () => {
    const config: Required<JayConfig> = {
        devServer: {
            portRange: [3000, 3010],
            pagesBase: path.join(testDir, 'pages'),
            componentsBase: path.join(testDir, 'components'),
            publicFolder: path.join(testDir, 'public'),
            configBase: path.join(testDir, 'config'),
        },
        editorServer: {
            portRange: [3101, 3200],
            editorId: 'test-editor',
        },
    };

    // Dynamically discover all fixture directories (synchronous, at module load time)
    const fixtureEntries = fsSync.readdirSync(fixturesDir, { withFileTypes: true });
    const fixtures = fixtureEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(); // Sort for consistent test order

    console.log(`Discovered ${fixtures.length} fixture directories: ${fixtures.join(', ')}`);

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'pages'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    for (const fixtureName of fixtures) {
        it(`should correctly convert: ${fixtureName}`, async () => {
            const fixturePath = path.join(fixturesDir, fixtureName);

            // 1. Load Figma document
            const figmaDocPath = path.join(fixturePath, 'page.figma.json');
            const figmaDocRaw = await fs.readFile(figmaDocPath, 'utf-8');
            const figmaDoc: FigmaVendorDocument = JSON.parse(figmaDocRaw);

            // 2. Load expected output
            const expectedPath = path.join(fixturePath, 'expected.jay-html');
            const expectedHtml = await fs.readFile(expectedPath, 'utf-8');

            // 3. Check if fixture has page.conf.yaml or page.jay-contract
            const confPath = path.join(fixturePath, 'page.conf.yaml');
            const contractPath = path.join(fixturePath, 'page.jay-contract');

            let hasConf = false;
            let hasContract = false;
            let confYaml = '';
            let contractYaml = '';

            try {
                confYaml = await fs.readFile(confPath, 'utf-8');
                hasConf = true;
            } catch {
                // No conf file
            }

            try {
                contractYaml = await fs.readFile(contractPath, 'utf-8');
                hasContract = true;
            } catch {
                // No contract file
            }

            // 4. Determine page URL from Figma document
            const pageUrl = figmaDoc.pluginData?.urlRoute || '/';

            // 5. Determine page directory path to match editor-handlers behavior
            let pagePath: string;
            let pageDir: string;

            if (pageUrl === '/') {
                pagePath = config.devServer.pagesBase;
                pageDir = '';
            } else {
                pageDir = pageUrl.substring(1).replace(/:(\w+)/g, '[$1]');
                pagePath = path.join(config.devServer.pagesBase, pageDir);
            }

            // 6. Create page directory and write config/contract
            if (pageDir) {
                await fs.mkdir(pagePath, { recursive: true });
            }

            if (hasContract) {
                await fs.writeFile(path.join(pagePath, 'page.jay-contract'), contractYaml);
            }

            if (hasConf) {
                await fs.writeFile(path.join(pagePath, 'page.conf.yaml'), confYaml);
            }

            // 7. If fixture has plugins directory, copy it to test root src/plugins (for plugin resolution)
            const fixturePluginsDir = path.join(fixturePath, 'plugins');
            try {
                await fs.access(fixturePluginsDir);
                const testPluginsDir = path.join(testDir, 'src', 'plugins');
                await fs.mkdir(testPluginsDir, { recursive: true });

                // Copy plugin directories
                const pluginNames = await fs.readdir(fixturePluginsDir);
                for (const pluginName of pluginNames) {
                    const srcDir = path.join(fixturePluginsDir, pluginName);
                    const destDir = path.join(testPluginsDir, pluginName);
                    await fs.cp(srcDir, destDir, { recursive: true });
                }
            } catch {
                // No plugins directory in this fixture
            }

            // 7. Create editor handlers (projectRoot is testDir for plugin resolution)
            const handlers = createEditorHandlers(config, './tsconfig.json', testDir);

            // 8. Send export message (like the real flow)
            const exportMsg: ExportMessage<FigmaVendorDocument> = {
                type: 'export',
                vendorId: 'figma',
                pageUrl,
                vendorDoc: figmaDoc,
            };

            const response = await handlers.onExport(exportMsg);

            // 9. Verify export succeeded
            if (!response.success) {
                throw new Error(`Export failed for fixture "${fixtureName}": ${response.error}`);
            }

            // 10. Read generated jay-html file
            const jayHtmlPath = path.join(pagePath, 'page.jay-html');
            const actualHtml = await fs.readFile(jayHtmlPath, 'utf-8');

            // 11. Normalize both for comparison
            const normalizedActual = normalizeHtml(actualHtml);
            const normalizedExpected = normalizeHtml(expectedHtml);

            // 12. Compare - save actual output on mismatch for debugging
            if (normalizedActual !== normalizedExpected) {
                const actualDebugPath = path.join(fixturePath, 'actual-output.jay-html');
                await fs.writeFile(actualDebugPath, actualHtml);
            }

            expect(normalizedActual).toBe(normalizedExpected);
        });
    }

    it('should have fixture directories available', async () => {
        const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
        const fixtureCount = entries.filter((e) => e.isDirectory()).length;
        expect(fixtureCount).toBeGreaterThan(0);
        console.log(
            `Found ${fixtureCount} fixture directories: ${entries
                .filter((e) => e.isDirectory())
                .map((e) => e.name)
                .join(', ')}`,
        );
    });
});
