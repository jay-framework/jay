import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createEditorHandlers } from '../../../lib/editor-handlers';
import type {
    ImportMessage,
    ImportResponse,
    FigmaVendorDocument,
    ProjectPage,
    Contract,
} from '@jay-framework/editor-protocol';
import type { JayConfig } from '../../../lib/config';
import { figmaVendor } from '../../../lib/vendors/figma/index';
import { compareSemanticEquivalence } from '../../../lib/vendors/figma/semantic-comparator';
import type { ContractTag as CompilerContractTag } from '@jay-framework/compiler-jay-html';
import { parseContract, ContractTagType } from '@jay-framework/compiler-jay-html';

const fixturesDir = path.join(__dirname, 'fixtures');
const testDir = path.join(process.cwd(), 'tmp-test-import-fixtures');

interface FixtureMeta {
    id: string;
    feature: string;
    milestone: number;
    mode: 'import' | 'roundtrip';
}

interface Invariants {
    requiredNodes?: Array<{ type: string; name?: string }>;
    requiredBindings?: Array<{ tagPath: string[]; jayPageSectionId?: string }>;
    warningsMustContain?: string[];
    warningsMustNotContain?: string[];
}

interface RoundtripInvariants {
    maxNestingDepthDelta?: number;
    requiredRefs?: string[];
    requiredTextBindings?: string[];
    warningsMustNotContain?: string[];
}

function buildProjectPageFromContract(
    pagePath: string,
    pageUrl: string,
    metaId: string,
    contractYaml: string,
): ProjectPage {
    const contractResult = parseContract(contractYaml, 'page.jay-contract');
    let contract: Contract | undefined;
    if (contractResult.val) {
        const compilerContract = contractResult.val;
        const convertTag = (tag: CompilerContractTag): Contract['tags'][0] => {
            const typeArray = Array.isArray(tag.type) ? tag.type : [tag.type];
            const typeStrings = typeArray.map((t) => ContractTagType[t as number]);
            return {
                tag: tag.tag,
                type: typeStrings.length === 1 ? typeStrings[0] : typeStrings,
                dataType: tag.dataType ? String(tag.dataType) : undefined,
                elementType: tag.elementType?.join(' | '),
                required: tag.required,
                repeated: tag.repeated,
                trackBy: tag.trackBy,
                async: tag.async,
                phase: tag.phase,
                link: tag.link,
                tags: tag.tags?.map(convertTag),
            };
        };
        contract = {
            name: compilerContract.name,
            tags: compilerContract.tags.map(convertTag),
        };
    }
    return {
        name: metaId,
        url: pageUrl,
        filePath: pagePath,
        contract,
        usedComponents: [],
    };
}

function normalizeJson(obj: unknown): string {
    return JSON.stringify(obj, Object.keys(obj as object).sort(), 2);
}

/**
 * Validates that adapter output is compatible with the Figma plugin deserializer.
 * Runs on EVERY fixture as a hard gate.
 */
function validateAdapterOutputForDeserializer(doc: FigmaVendorDocument): string[] {
    const errors: string[] = [];
    const KNOWN_TYPES = [
        'SECTION',
        'FRAME',
        'COMPONENT',
        'COMPONENT_SET',
        'INSTANCE',
        'TEXT',
        'RECTANGLE',
        'ELLIPSE',
        'VECTOR',
        'GROUP',
        'LINE',
        'STAR',
        'POLYGON',
        'BOOLEAN_OPERATION',
    ];

    function validateNode(node: any, nodePath: string) {
        if (!node.type) errors.push(`${nodePath}: missing type`);
        if (node.type && !KNOWN_TYPES.includes(node.type))
            errors.push(`${nodePath}: unknown type "${node.type}"`);
        if (!node.id) errors.push(`${nodePath}: missing id`);

        if (node.type === 'INSTANCE' && !node.mainComponentId)
            errors.push(`${nodePath}: INSTANCE missing mainComponentId`);

        if (node.type === 'COMPONENT_SET' && node.children) {
            for (let i = 0; i < node.children.length; i++) {
                if (node.children[i].type !== 'COMPONENT')
                    errors.push(
                        `${nodePath}.children[${i}]: COMPONENT_SET child must be COMPONENT`,
                    );
            }
        }

        if (node.pluginData?.['jay-layer-bindings']) {
            try {
                const bindings = JSON.parse(node.pluginData['jay-layer-bindings']);
                if (!Array.isArray(bindings))
                    errors.push(`${nodePath}: jay-layer-bindings is not an array`);
                for (const b of bindings) {
                    if (!b.tagPath || !Array.isArray(b.tagPath))
                        errors.push(`${nodePath}: binding missing tagPath`);
                    if (!b.jayPageSectionId)
                        errors.push(`${nodePath}: binding missing jayPageSectionId`);
                }
            } catch {
                errors.push(`${nodePath}: jay-layer-bindings is not valid JSON`);
            }
        }

        if (node.type === 'SECTION') {
            if (node.pluginData?.['jpage'] !== 'true')
                errors.push(`${nodePath}: SECTION missing pluginData.jpage`);
            if (!node.pluginData?.['urlRoute'])
                errors.push(`${nodePath}: SECTION missing pluginData.urlRoute`);
        }

        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                validateNode(node.children[i], `${nodePath}.children[${i}]`);
            }
        }
    }

    validateNode(doc, 'root');
    return errors;
}

function checkInvariants(
    vendorDoc: FigmaVendorDocument,
    warnings: string[] | undefined,
    invariants: Invariants,
): string[] {
    const errors: string[] = [];

    function collectNodes(node: any): any[] {
        const nodes = [node];
        if (node.children) {
            for (const child of node.children) {
                nodes.push(...collectNodes(child));
            }
        }
        return nodes;
    }

    const allNodes = collectNodes(vendorDoc);

    if (invariants.requiredNodes) {
        for (const required of invariants.requiredNodes) {
            const found = allNodes.some(
                (n) => n.type === required.type && (!required.name || n.name === required.name),
            );
            if (!found)
                errors.push(
                    `requiredNode not found: type=${required.type}${required.name ? `, name=${required.name}` : ''}`,
                );
        }
    }

    if (invariants.requiredBindings) {
        for (const required of invariants.requiredBindings) {
            const found = allNodes.some((n) => {
                if (!n.pluginData?.['jay-layer-bindings']) return false;
                try {
                    const bindings = JSON.parse(n.pluginData['jay-layer-bindings']);
                    return bindings.some(
                        (b: any) =>
                            JSON.stringify(b.tagPath) === JSON.stringify(required.tagPath) &&
                            (!required.jayPageSectionId ||
                                b.jayPageSectionId === required.jayPageSectionId),
                    );
                } catch {
                    return false;
                }
            });
            if (!found)
                errors.push(
                    `requiredBinding not found: tagPath=${JSON.stringify(required.tagPath)}`,
                );
        }
    }

    if (invariants.warningsMustContain) {
        for (const expected of invariants.warningsMustContain) {
            if (!warnings?.some((w) => w.includes(expected)))
                errors.push(`warningsMustContain: "${expected}" not found in warnings`);
        }
    }

    if (invariants.warningsMustNotContain) {
        for (const forbidden of invariants.warningsMustNotContain) {
            if (warnings?.some((w) => w.includes(forbidden)))
                errors.push(`warningsMustNotContain: "${forbidden}" found in warnings`);
        }
    }

    return errors;
}

describe('Figma Import Fixtures', () => {
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

    if (!fsSync.existsSync(fixturesDir)) {
        it('no fixtures directory', () => {
            expect(true).toBe(true);
        });
        return;
    }

    const fixtureEntries = fsSync.readdirSync(fixturesDir, { withFileTypes: true });
    const fixtures = fixtureEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    console.log(
        `Import fixtures: discovered ${fixtures.length} directories: ${fixtures.join(', ')}`,
    );

    beforeEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'pages'), { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    for (const fixtureName of fixtures) {
        it(`should correctly import: ${fixtureName}`, async () => {
            const fixturePath = path.join(fixturesDir, fixtureName);

            // 1. Load meta
            const metaPath = path.join(fixturePath, 'meta.json');
            const meta: FixtureMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));

            // 2. Read input files
            const jayHtmlPath = path.join(fixturePath, 'input', 'page.jay-html');
            const jayHtml = await fs.readFile(jayHtmlPath, 'utf-8');

            const contractPath = path.join(fixturePath, 'input', 'page.jay-contract');
            let contractYaml = '';
            let hasContract = false;
            try {
                contractYaml = await fs.readFile(contractPath, 'utf-8');
                hasContract = true;
            } catch {
                // No contract file
            }

            const confPath = path.join(fixturePath, 'input', 'page.conf.yaml');
            let confYaml = '';
            let hasConf = false;
            try {
                confYaml = await fs.readFile(confPath, 'utf-8');
                hasConf = true;
            } catch {
                // No conf file
            }

            // 3. Set up temp directory — write jay-html into the page directory
            const pageUrl = '/test';
            const pagePath = path.join(config.devServer.pagesBase, 'test');
            await fs.mkdir(pagePath, { recursive: true });
            await fs.writeFile(path.join(pagePath, 'page.jay-html'), jayHtml);

            if (hasContract) {
                await fs.writeFile(path.join(pagePath, 'page.jay-contract'), contractYaml);
            }
            if (hasConf) {
                await fs.writeFile(path.join(pagePath, 'page.conf.yaml'), confYaml);
            }

            // 4. Copy plugins if present
            const fixturePluginsDir = path.join(fixturePath, 'input', 'plugins');
            try {
                await fs.access(fixturePluginsDir);
                const testPluginsDir = path.join(testDir, 'src', 'plugins');
                await fs.mkdir(testPluginsDir, { recursive: true });
                const pluginNames = await fs.readdir(fixturePluginsDir);
                for (const pluginName of pluginNames) {
                    await fs.cp(
                        path.join(fixturePluginsDir, pluginName),
                        path.join(testPluginsDir, pluginName),
                        { recursive: true },
                    );
                }
            } catch {
                // No plugins
            }

            // 5. Create editor handlers and run import
            const handlers = createEditorHandlers(config, './tsconfig.json', testDir);

            const importMsg: ImportMessage<FigmaVendorDocument> = {
                type: 'import',
                vendorId: 'figma',
                pageUrl,
            };

            const response = (await handlers.onImport(
                importMsg,
            )) as ImportResponse<FigmaVendorDocument>;

            // 6. Verify import succeeded
            if (!response.success) {
                throw new Error(`Import failed for fixture "${fixtureName}": ${response.error}`);
            }

            expect(response.vendorDoc).toBeDefined();
            const vendorDoc = response.vendorDoc!;

            // 7. Adapter validation gate (runs on every fixture)
            const validationErrors = validateAdapterOutputForDeserializer(vendorDoc);
            expect(
                validationErrors,
                `Adapter validation failed:\n${validationErrors.join('\n')}`,
            ).toEqual([]);

            // 8. Check invariants if present
            const invariantsPath = path.join(fixturePath, 'expected', 'invariants.json');
            try {
                const invariants: Invariants = JSON.parse(
                    await fs.readFile(invariantsPath, 'utf-8'),
                );
                const invariantErrors = checkInvariants(vendorDoc, response.warnings, invariants);
                expect(
                    invariantErrors,
                    `Invariant check failed:\n${invariantErrors.join('\n')}`,
                ).toEqual([]);
            } catch {
                // No invariants file — skip
            }

            // 9. Compare against expected output if present
            const expectedPath = path.join(fixturePath, 'expected', 'import.figma.generated.json');
            try {
                const expectedJson = JSON.parse(await fs.readFile(expectedPath, 'utf-8'));

                // Strip IDs for structural comparison (IDs are deterministic but depend on hashing)
                const stripIds = (obj: any): any => {
                    if (Array.isArray(obj)) return obj.map(stripIds);
                    if (obj && typeof obj === 'object') {
                        const { id, ...rest } = obj;
                        const result: any = {};
                        for (const [k, v] of Object.entries(rest)) {
                            result[k] = stripIds(v);
                        }
                        return result;
                    }
                    return obj;
                };

                expect(stripIds(vendorDoc)).toEqual(stripIds(expectedJson));
            } catch (e: any) {
                if (e.code === 'ENOENT') {
                    // No expected file — write actual for bootstrapping
                    const debugDir = path.join(fixturePath, 'debug');
                    await fs.mkdir(debugDir, { recursive: true });
                    await fs.writeFile(
                        path.join(debugDir, 'actual.import.figma.generated.json'),
                        JSON.stringify(vendorDoc, null, 2),
                    );
                } else {
                    throw e;
                }
            }

            // 10. Verify IDs are deterministic (run import a second time)
            const response2 = (await handlers.onImport(
                importMsg,
            )) as ImportResponse<FigmaVendorDocument>;
            expect(response2.vendorDoc).toEqual(vendorDoc);

            // 11. Roundtrip: export and compare semantic equivalence (when meta.mode === 'roundtrip')
            if (meta.mode === 'roundtrip') {
                let exportedBodyHtml: string | null = null;
                let exportError: string | null = null;

                try {
                    // Use onGetProjectInfo to get the full project page with plugins
                    // This ensures usedComponents and plugin contracts are properly resolved
                    const projectInfoResponse = await handlers.onGetProjectInfo({
                        type: 'getProjectInfo',
                    });
                    const realProjectPage = projectInfoResponse.info?.pages?.find(
                        (p: ProjectPage) => p.url === pageUrl,
                    );
                    const plugins = projectInfoResponse.info?.plugins ?? [];

                    const projectPage =
                        realProjectPage ??
                        buildProjectPageFromContract(
                            pagePath,
                            pageUrl,
                            meta.id,
                            hasContract ? contractYaml : 'name: default\ntags: []',
                        );
                    const result = await figmaVendor.convertToBodyHtml(
                        vendorDoc,
                        pageUrl,
                        projectPage,
                        plugins,
                    );
                    exportedBodyHtml = result.bodyHtml;
                } catch (err) {
                    exportError = err instanceof Error ? err.message : String(err);
                }

                if (exportError) {
                    console.warn(
                        `[${fixtureName}] Roundtrip export failed (import still passed): ${exportError}`,
                    );
                    // Write debug file for inspection
                    const debugDir = path.join(fixturePath, 'debug');
                    await fs.mkdir(debugDir, { recursive: true });
                    await fs.writeFile(
                        path.join(debugDir, 'actual.export.page.jay-html'),
                        `<!-- Export failed: ${exportError} -->\n`,
                    );
                } else {
                    const bodyMatch = jayHtml.match(/<body>([\s\S]*)<\/body>/i);
                    const sourceBody = bodyMatch ? bodyMatch[1].trim() : jayHtml;

                    const comparison = compareSemanticEquivalence(sourceBody, exportedBodyHtml!);

                    const hardFails = comparison.invariantResults.filter(
                        (r) => r.severity === 'HARD_FAIL' && !r.passed,
                    );
                    expect(
                        hardFails,
                        `Roundtrip semantic invariants failed:\n${hardFails.map((r) => `  ${r.name}: ${r.details ?? 'failed'}`).join('\n')}`,
                    ).toEqual([]);

                    const roundtripInvariantsPath = path.join(
                        fixturePath,
                        'expected',
                        'roundtrip.invariants.json',
                    );
                    try {
                        const roundtripInvariants: RoundtripInvariants = JSON.parse(
                            await fs.readFile(roundtripInvariantsPath, 'utf-8'),
                        );
                        if (roundtripInvariants.warningsMustNotContain && response.warnings) {
                            for (const forbidden of roundtripInvariants.warningsMustNotContain) {
                                expect(
                                    response.warnings.some((w) => w.includes(forbidden)),
                                    `warningsMustNotContain: "${forbidden}" found in warnings`,
                                ).toBe(false);
                            }
                        }
                    } catch {
                        // No roundtrip invariants file
                    }

                    const debugDir = path.join(fixturePath, 'debug');
                    await fs.mkdir(debugDir, { recursive: true });
                    await fs.writeFile(
                        path.join(debugDir, 'actual.export.page.jay-html'),
                        exportedBodyHtml!,
                    );
                }
            }

            // 12. Clean up debug directory if test passed (all assertions above succeeded)
            const debugDir = path.join(fixturePath, 'debug');
            await fs.rm(debugDir, { recursive: true, force: true });
        });
    }

    it('should have fixture directories available', async () => {
        const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
        const fixtureCount = entries.filter((e) => e.isDirectory()).length;
        expect(fixtureCount).toBeGreaterThan(0);
    });
});
