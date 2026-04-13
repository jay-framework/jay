import chalk from 'chalk';
import path from 'path';
import { promises as fsp } from 'fs';
import { glob } from 'glob';
import {
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION,
    GenerateTarget,
    RuntimeMode,
} from '@jay-framework/compiler-shared';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    generateElementFile,
    parseContract,
    htmlElementTagNameMap,
    type ContractTag,
    type Contract,
    type JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';
import { getLogger } from '@jay-framework/logger';
import { parse as parseHtml } from 'node-html-parser';
import YAML from 'yaml';
import { loadConfig, getConfigWithDefaults } from './config';

export interface ValidateOptions {
    path?: string;
    verbose?: boolean;
    json?: boolean;
    projectRoot?: string;
}

export interface ValidationError {
    file: string;
    message: string;
    stage: 'parse' | 'generate';
}

export interface ValidationWarning {
    file: string;
    message: string;
}

export interface ContractCoverage {
    key?: string;
    contractName: string;
    totalTags: number;
    usedTags: number;
    unusedTags: string[];
    requiredUnusedTags: string[];
}

export interface FileCoverage {
    file: string;
    contracts: ContractCoverage[];
}

export interface ValidationResult {
    valid: boolean;
    jayHtmlFilesScanned: number;
    contractFilesScanned: number;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    coverage: FileCoverage[];
}

async function findJayFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_EXTENSION}`);
}

async function findContractFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_CONTRACT_EXTENSION}`);
}

// --- Tag coverage internals ---

interface TagInfo {
    path: string;
    required: boolean;
}

interface TagScope {
    importIndex: number;
    prefix: string;
}

/** @internal Exported for testing */
export function flattenContractTags(tags: ContractTag[], prefix?: string): TagInfo[] {
    const result: TagInfo[] = [];
    for (const tag of tags) {
        const tagPath = prefix ? `${prefix}.${tag.tag}` : tag.tag;
        result.push({ path: tagPath, required: tag.required === true });
        if (tag.tags) {
            result.push(...flattenContractTags(tag.tags, tagPath));
        }
    }
    return result;
}

/** @internal Exported for testing */
export function extractExpressions(text: string): string[] {
    const results: string[] = [];
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        results.push(match[1].trim());
    }
    return results;
}

/** @internal Exported for testing */
export function extractTagPath(expr: string): string | null {
    let cleaned = expr.replace(/^!/, '').trim();
    cleaned = cleaned.split(/\s*[!=]==?\s*/)[0].trim();
    if (cleaned === '.' || cleaned === '') return null;
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(cleaned)) {
        return cleaned;
    }
    return null;
}

const SKIP_ATTRS = new Set([
    'forEach',
    'if',
    'ref',
    'trackBy',
    'slowForEach',
    'jayIndex',
    'jayTrackBy',
    'when-resolved',
    'when-loading',
    'when-rejected',
    'accessor',
]);

function collectUsedTags(jayHtml: JayHtmlSourceFile): Map<number, Set<string>> {
    const imports = jayHtml.headlessImports;
    const usedTags = new Map<number, Set<string>>();
    const keyMap = new Map<string, number>();

    for (let i = 0; i < imports.length; i++) {
        if (imports[i].contract) {
            usedTags.set(i, new Set<string>());
            if (imports[i].key) {
                keyMap.set(imports[i].key!, i);
            }
        }
    }

    function markUsed(importIndex: number, tagPath: string): void {
        usedTags.get(importIndex)?.add(tagPath);
    }

    function resolvePath(path: string, scopes: TagScope[]): void {
        const dot = path.indexOf('.');
        if (dot !== -1) {
            const key = path.substring(0, dot);
            const idx = keyMap.get(key);
            if (idx !== undefined) {
                markUsed(idx, path.substring(dot + 1));
                return;
            }
        }
        if (scopes.length > 0) {
            const scope = scopes[scopes.length - 1];
            const full = scope.prefix ? `${scope.prefix}.${path}` : path;
            markUsed(scope.importIndex, full);
        }
    }

    function walkElement(element: any, scopes: TagScope[]): void {
        const tagName: string | undefined = element.rawTagName?.toLowerCase();
        let childScopes = scopes;

        // <jay:contract-name> → instance scope for children
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            const idx = imports.findIndex(
                (imp) => imp.contractName === contractName && imp.contract,
            );
            if (idx !== -1) {
                childScopes = [...scopes, { importIndex: idx, prefix: '' }];
            }
        }

        // forEach → mark tag used, push scope for children
        const forEachVal = element.getAttribute?.('forEach');
        if (forEachVal) {
            const fePath = extractTagPath(forEachVal);
            if (fePath) {
                resolvePath(fePath, childScopes);
                const dot = fePath.indexOf('.');
                if (dot !== -1) {
                    const key = fePath.substring(0, dot);
                    const idx = keyMap.get(key);
                    if (idx !== undefined) {
                        childScopes = [
                            ...childScopes,
                            { importIndex: idx, prefix: fePath.substring(dot + 1) },
                        ];
                    }
                } else if (childScopes.length > 0) {
                    const scope = childScopes[childScopes.length - 1];
                    const newPrefix = scope.prefix ? `${scope.prefix}.${fePath}` : fePath;
                    childScopes = [
                        ...childScopes,
                        { importIndex: scope.importIndex, prefix: newPrefix },
                    ];
                }
            }
        }

        // <with-data accessor="X"> → push scope for children
        if (tagName === 'with-data') {
            const accessor = element.getAttribute?.('accessor');
            if (accessor && accessor !== '.' && childScopes.length > 0) {
                resolvePath(accessor, childScopes);
                const scope = childScopes[childScopes.length - 1];
                const newPrefix = scope.prefix ? `${scope.prefix}.${accessor}` : accessor;
                childScopes = [
                    ...childScopes,
                    { importIndex: scope.importIndex, prefix: newPrefix },
                ];
            }
        }

        // if attribute
        const ifVal = element.getAttribute?.('if');
        if (ifVal) {
            const ifPath = extractTagPath(ifVal);
            if (ifPath) resolvePath(ifPath, scopes);
        }

        // ref attribute
        const refVal = element.getAttribute?.('ref');
        if (refVal) {
            resolvePath(refVal, scopes);
        }

        // Other attribute expressions
        const attrs: Record<string, string> = element.attributes ?? {};
        for (const [name, value] of Object.entries(attrs)) {
            if (SKIP_ATTRS.has(name)) continue;
            for (const expr of extractExpressions(value)) {
                const p = extractTagPath(expr);
                if (p) resolvePath(p, scopes);
            }
        }

        // Walk children
        for (const child of element.childNodes ?? []) {
            if (child.nodeType === 3) {
                const text: string = child.rawText ?? child.text ?? '';
                for (const expr of extractExpressions(text)) {
                    const p = extractTagPath(expr);
                    if (p) resolvePath(p, childScopes);
                }
            } else if (child.nodeType === 1) {
                walkElement(child, childScopes);
            }
        }
    }

    walkElement(jayHtml.body, []);
    return usedTags;
}

/** @internal Exported for testing */
export function analyzeTagCoverage(jayHtml: JayHtmlSourceFile, file: string): FileCoverage | null {
    const imports = jayHtml.headlessImports;
    const withContracts = imports.filter((imp) => imp.contract);
    if (withContracts.length === 0) return null;

    const usedTagsMap = collectUsedTags(jayHtml);
    const contracts: ContractCoverage[] = [];

    for (let i = 0; i < imports.length; i++) {
        const imp = imports[i];
        if (!imp.contract) continue;

        const allTags = flattenContractTags(imp.contract.tags);
        const usedSet = usedTagsMap.get(i) ?? new Set<string>();

        // Mark parent paths as used when a child is used
        // (sub-contract containers are implicitly used if any child is)
        const expanded = new Set<string>(usedSet);
        for (const usedPath of usedSet) {
            const segments = usedPath.split('.');
            for (let j = 1; j < segments.length; j++) {
                expanded.add(segments.slice(0, j).join('.'));
            }
        }

        const unused = allTags.filter((t) => !expanded.has(t.path));
        const requiredUnused = unused.filter((t) => t.required);

        contracts.push({
            key: imp.key,
            contractName: imp.contractName,
            totalTags: allTags.length,
            usedTags: allTags.length - unused.length,
            unusedTags: unused.map((t) => t.path),
            requiredUnusedTags: requiredUnused.map((t) => t.path),
        });
    }

    return { file, contracts };
}

// --- Ref element type checking ---

const htmlTagNameMap = htmlElementTagNameMap as Record<string, string>;

/** Resolve a contract tag by dot-separated path (e.g. "filters.optionFilters.choices.isSelected"). */
function resolveContractTag(contract: Contract, tagPath: string): ContractTag | undefined {
    const segments = tagPath.split('.');
    let tags = contract.tags;
    for (let i = 0; i < segments.length; i++) {
        const tag = tags.find((t) => t.tag === segments[i]);
        if (!tag) return undefined;
        if (i === segments.length - 1) return tag;
        if (!tag.tags) return undefined;
        tags = tag.tags;
    }
    return undefined;
}

interface RefElementInfo {
    refPath: string;
    htmlTag: string;
    actualType: string;
}

/** @internal Exported for testing */
export function checkRefElementTypes(jayHtml: JayHtmlSourceFile, file: string): string[] {
    const imports = jayHtml.headlessImports;
    const keyMap = new Map<string, number>();
    for (let i = 0; i < imports.length; i++) {
        if (imports[i].key) {
            keyMap.set(imports[i].key!, i);
        }
    }

    const warnings: string[] = [];

    interface Scope {
        importIndex: number;
        prefix: string;
    }

    function checkRef(ref: RefElementInfo, scopes: Scope[]): void {
        const refPath = ref.refPath;
        const dot = refPath.indexOf('.');
        let importIndex: number | undefined;
        let tagPath: string;

        // Try keyed resolution first
        if (dot !== -1) {
            const key = refPath.substring(0, dot);
            const idx = keyMap.get(key);
            if (idx !== undefined) {
                importIndex = idx;
                tagPath = refPath.substring(dot + 1);
            }
        }

        // Fall back to scope resolution
        if (importIndex === undefined && scopes.length > 0) {
            const scope = scopes[scopes.length - 1];
            importIndex = scope.importIndex;
            tagPath = scope.prefix ? `${scope.prefix}.${refPath}` : refPath;
        }

        if (importIndex === undefined) return;

        const imp = imports[importIndex!];
        if (!imp.contract) return;

        const contractTag = resolveContractTag(imp.contract, tagPath!);
        if (!contractTag || !contractTag.elementType) return;

        // Check if actual element type is compatible with contract's declared type(s)
        const contractTypes = contractTag.elementType;
        if (contractTypes.includes('HTMLElement')) return; // HTMLElement accepts anything
        if (!contractTypes.includes(ref.actualType)) {
            const label = imp.key ? `${imp.key}.${tagPath!}` : tagPath!;
            warnings.push(
                `Ref "${label}" is on a <${ref.htmlTag}> (${ref.actualType}) ` +
                    `but the contract declares ${contractTypes.join(' | ')}`,
            );
        }
    }

    function walkElement(element: any, scopes: Scope[]): void {
        const tagName: string | undefined = element.rawTagName?.toLowerCase();
        let childScopes = scopes;

        // <jay:contract-name> → instance scope
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            const idx = imports.findIndex(
                (imp) => imp.contractName === contractName && imp.contract,
            );
            if (idx !== -1) {
                childScopes = [...scopes, { importIndex: idx, prefix: '' }];
            }
        }

        // forEach → push scope
        const forEachVal = element.getAttribute?.('forEach');
        if (forEachVal) {
            const fePath = extractTagPath(forEachVal);
            if (fePath) {
                const dot = fePath.indexOf('.');
                if (dot !== -1) {
                    const key = fePath.substring(0, dot);
                    const idx = keyMap.get(key);
                    if (idx !== undefined) {
                        childScopes = [
                            ...childScopes,
                            { importIndex: idx, prefix: fePath.substring(dot + 1) },
                        ];
                    }
                } else if (childScopes.length > 0) {
                    const scope = childScopes[childScopes.length - 1];
                    const newPrefix = scope.prefix ? `${scope.prefix}.${fePath}` : fePath;
                    childScopes = [
                        ...childScopes,
                        { importIndex: scope.importIndex, prefix: newPrefix },
                    ];
                }
            }
        }

        // with-data accessor → push scope
        if (tagName === 'with-data') {
            const accessor = element.getAttribute?.('accessor');
            if (accessor && accessor !== '.' && childScopes.length > 0) {
                const scope = childScopes[childScopes.length - 1];
                const newPrefix = scope.prefix ? `${scope.prefix}.${accessor}` : accessor;
                childScopes = [
                    ...childScopes,
                    { importIndex: scope.importIndex, prefix: newPrefix },
                ];
            }
        }

        // Check ref attribute for element type mismatch
        const refVal = element.getAttribute?.('ref');
        if (refVal && tagName) {
            const actualType = htmlTagNameMap[tagName] ?? 'HTMLElement';
            checkRef({ refPath: refVal, htmlTag: tagName, actualType }, childScopes);
        }

        // Walk children
        for (const child of element.childNodes ?? []) {
            if (child.nodeType === 1) {
                walkElement(child, childScopes);
            }
        }
    }

    walkElement(jayHtml.body, []);
    return warnings;
}

// Same regex as route-scanner: matches [param], [[optional]], [...catchAll]
const PARSE_PARAM = /^\[(\[)?(\.\.\.)?([^\]]+)\]?\]$/;

/** @internal Exported for testing */
export function extractRouteParams(filePath: string, pagesBase: string): Set<string> {
    const relative = path.relative(pagesBase, filePath);
    const segments = relative.split(path.sep);
    const params = new Set<string>();
    for (const segment of segments) {
        const match = PARSE_PARAM.exec(segment);
        if (match) {
            params.add(match[3]);
        }
    }
    return params;
}

function dedentYaml(text: string): string {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return '';
    const minIndent = Math.min(...lines.map((l) => l.match(/^\s*/)?.[0].length ?? 0));
    return lines.map((l) => l.slice(minIndent)).join('\n');
}

/** @internal Exported for testing */
export function extractJayParams(content: string): Set<string> {
    const root = parseHtml(content, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });
    const head = root.querySelector('head');
    if (!head) return new Set();

    const paramScripts = head.querySelectorAll('script[type="application/jay-params"]');
    if (paramScripts.length !== 1) return new Set();

    const body = dedentYaml(paramScripts[0].textContent ?? '');
    if (!body) return new Set();

    try {
        const parsed = YAML.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return new Set(Object.keys(parsed));
        }
        return new Set();
    } catch {
        return new Set();
    }
}

/** @internal Exported for testing */
export function checkRouteParams(
    parsedFile: JayHtmlSourceFile,
    filePath: string,
    pagesBase: string,
    jayHtmlContent: string,
): string[] {
    // Collect required and catch-all param names from contracts on this page (skip optional)
    const requiredParams = new Set<string>();

    function collectParams(params: { name: string; kind: string }[]) {
        for (const p of params) {
            if (p.kind !== 'optional') {
                requiredParams.add(p.name);
            }
        }
    }

    if (parsedFile.contract?.params) {
        collectParams(parsedFile.contract.params);
    }

    for (const imp of parsedFile.headlessImports) {
        if (imp.contract?.params) {
            collectParams(imp.contract.params);
        }
    }

    if (requiredParams.size === 0) return [];

    // Collect available params from route segments and jay-params
    const routeParams = extractRouteParams(filePath, pagesBase);
    const jayParams = extractJayParams(jayHtmlContent);
    const availableParams = new Set([...routeParams, ...jayParams]);

    const warnings: string[] = [];
    for (const param of requiredParams) {
        if (!availableParams.has(param)) {
            warnings.push(
                `Contract requires param "${param}" but the route does not provide it. ` +
                    `Add a dynamic segment [${param}] to the route path or declare it in <script type="application/jay-params">.`,
            );
        }
    }

    return warnings;
}

/**
 * Check that route params are declared in at least one contract on the page (DL#124 Phase 1).
 *
 * Reverse of checkRouteParams: if the route provides params (e.g., [slug]),
 * at least one contract (page-level or headless) should declare that param.
 * Different params may be consumed by different components.
 *
 * @internal Exported for testing
 */
export function checkRouteToContractParams(
    parsedFile: JayHtmlSourceFile,
    filePath: string,
    pagesBase: string,
): string[] {
    const routeParams = extractRouteParams(filePath, pagesBase);
    if (routeParams.size === 0) return [];

    // Check if ANY contract exists on this page
    const hasAnyContract =
        !!parsedFile.contract || parsedFile.headlessImports.some((imp) => !!imp.contract);
    if (!hasAnyContract) return [];

    // Collect ALL declared params across all contracts
    const declaredParams = new Set<string>();

    if (parsedFile.contract?.params) {
        for (const p of parsedFile.contract.params) {
            declaredParams.add(p.name);
        }
    }

    for (const imp of parsedFile.headlessImports) {
        if (imp.contract?.params) {
            for (const p of imp.contract.params) {
                declaredParams.add(p.name);
            }
        }
    }

    const warnings: string[] = [];
    for (const routeParam of routeParams) {
        if (!declaredParams.has(routeParam)) {
            warnings.push(
                `Route provides param "${routeParam}" but no contract on this page declares it. ` +
                    `Add params: { ${routeParam}: string } to the appropriate contract.`,
            );
        }
    }

    return warnings;
}

// --- Headless instance prop checking (DL#124 Phase 2) ---

/** Attributes on <jay:xxx> that are NOT props — directives and framework attributes */
const HEADLESS_SKIP_ATTRS = new Set([
    'foreach',
    'if',
    'ref',
    'trackby',
    'slowforeach',
    'jayindex',
    'jaytrackby',
    'when-resolved',
    'when-loading',
    'when-rejected',
    'accessor',
    'props',
    'key',
    'jay-coordinate-base',
    'jay-scope',
]);

/**
 * Check that <jay:xxx> instance attributes match contract props (DL#124 Phase 2).
 *
 * For each <jay:xxx> element:
 * 1. Non-directive attributes should be declared as contract props
 * 2. Required contract props should be present as attributes
 *
 * @internal Exported for testing
 */
export function checkHeadlessInstanceProps(jayHtml: JayHtmlSourceFile, file: string): string[] {
    const imports = jayHtml.headlessImports;
    const warnings: string[] = [];

    function walkElement(element: any): void {
        const tagName: string | undefined = element.rawTagName?.toLowerCase();

        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            const imp = imports.find((i) => i.contractName === contractName && i.contract);

            if (imp?.contract) {
                const contract = imp.contract;
                const attrs: Record<string, string> = element.attributes ?? {};

                // Collect non-directive attributes as prop candidates
                const passedProps = new Set<string>();
                for (const attrName of Object.keys(attrs)) {
                    if (!HEADLESS_SKIP_ATTRS.has(attrName.toLowerCase())) {
                        passedProps.add(attrName);
                    }
                }

                // Check each passed prop is declared in contract
                if (passedProps.size > 0) {
                    const contractPropNames = new Set((contract.props || []).map((p) => p.name));
                    for (const prop of passedProps) {
                        if (!contractPropNames.has(prop)) {
                            const label = imp.key ? `${imp.key} (${contractName})` : contractName;
                            warnings.push(
                                `<jay:${contractName}> passes attribute "${prop}" but the ` +
                                    `"${contract.name}" contract does not declare it as a prop. ` +
                                    `Add to ${contractName}.jay-contract: props: [{ name: ${prop}, type: string }]`,
                            );
                        }
                    }
                }

                // Check required contract props are present
                if (contract.props) {
                    for (const contractProp of contract.props) {
                        if (contractProp.required && !passedProps.has(contractProp.name)) {
                            warnings.push(
                                `<jay:${contractName}> is missing required prop ` +
                                    `"${contractProp.name}" declared in the "${contract.name}" contract.`,
                            );
                        }
                    }
                }
            }
        }

        // Walk children
        for (const child of element.childNodes ?? []) {
            if (child.nodeType === 1) {
                walkElement(child);
            }
        }
    }

    walkElement(jayHtml.body);
    return warnings;
}

export async function validateJayFiles(options: ValidateOptions = {}): Promise<ValidationResult> {
    const config = loadConfig();
    const resolvedConfig = getConfigWithDefaults(config);
    const projectRoot = options.projectRoot ?? process.cwd();

    // Use provided path or default to pagesBase from config
    const scanDir = options.path
        ? path.resolve(options.path)
        : path.resolve(resolvedConfig.devServer.pagesBase);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const coverage: FileCoverage[] = [];

    // Find all jay files
    const jayHtmlFiles = await findJayFiles(scanDir);
    const contractFiles = await findContractFiles(scanDir);

    if (options.verbose) {
        getLogger().info(chalk.gray(`Scanning directory: ${scanDir}`));
        getLogger().info(chalk.gray(`Found ${jayHtmlFiles.length} .jay-html files`));
        getLogger().info(chalk.gray(`Found ${contractFiles.length} .jay-contract files\n`));
    }

    // Validate .jay-contract files first (they may be referenced by jay-html)
    for (const contractFile of contractFiles) {
        const relativePath = path.relative(projectRoot, contractFile);

        try {
            const content = await fsp.readFile(contractFile, 'utf-8');
            const result = parseContract(content, path.basename(contractFile));

            if (result.validations.length > 0) {
                for (const validation of result.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'parse',
                    });
                }
                if (options.verbose) {
                    getLogger().info(chalk.red(`❌ ${relativePath}`));
                }
            } else if (options.verbose) {
                getLogger().info(chalk.green(`✓ ${relativePath}`));
            }
        } catch (error: any) {
            errors.push({
                file: relativePath,
                message: error.message,
                stage: 'parse',
            });
            if (options.verbose) {
                getLogger().info(chalk.red(`❌ ${relativePath}`));
            }
        }
    }

    // Validate .jay-html files
    for (const jayFile of jayHtmlFiles) {
        const relativePath = path.relative(projectRoot, jayFile);
        const filename = path.basename(jayFile.replace(JAY_EXTENSION, ''));
        const dirname = path.dirname(jayFile);

        try {
            // Parse the jay-html file
            const content = await fsp.readFile(jayFile, 'utf-8');
            const parsedFile = await parseJayFile(
                content,
                filename,
                dirname,
                {},
                JAY_IMPORT_RESOLVER,
                projectRoot,
            );

            if (parsedFile.validations.length > 0) {
                for (const validation of parsedFile.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'parse',
                    });
                }
                if (options.verbose) {
                    getLogger().info(chalk.red(`❌ ${relativePath}`));
                }
                continue; // Skip generation if parsing failed
            }

            // Check route params match contract params (contract→route)
            const routeParamWarnings = checkRouteParams(parsedFile.val!, jayFile, scanDir, content);
            for (const msg of routeParamWarnings) {
                warnings.push({ file: relativePath, message: msg });
            }

            // Check route params are declared in contracts (route→contract, DL#124)
            const routeToContractWarnings = checkRouteToContractParams(
                parsedFile.val!,
                jayFile,
                scanDir,
            );
            for (const msg of routeToContractWarnings) {
                warnings.push({ file: relativePath, message: msg });
            }

            // Check ref element types match contract declarations
            const refTypeErrors = checkRefElementTypes(parsedFile.val!, relativePath);
            for (const msg of refTypeErrors) {
                errors.push({ file: relativePath, message: msg, stage: 'generate' });
            }

            // Check headless instance props match contract (DL#124 Phase 2)
            const headlessPropWarnings = checkHeadlessInstanceProps(parsedFile.val!, relativePath);
            for (const msg of headlessPropWarnings) {
                warnings.push({ file: relativePath, message: msg });
            }

            // Analyze tag coverage for headless imports
            const fileCoverage = analyzeTagCoverage(parsedFile.val!, relativePath);
            if (fileCoverage) {
                coverage.push(fileCoverage);
            }

            // Try to generate the code (without writing to disk)
            const generatedFile = generateElementFile(
                parsedFile.val!,
                RuntimeMode.MainTrusted,
                GenerateTarget.jay,
            );

            if (generatedFile.validations.length > 0) {
                for (const validation of generatedFile.validations) {
                    errors.push({
                        file: relativePath,
                        message: validation,
                        stage: 'generate',
                    });
                }
                if (options.verbose) {
                    getLogger().info(chalk.red(`❌ ${relativePath}`));
                }
            } else if (options.verbose) {
                getLogger().info(chalk.green(`✓ ${relativePath}`));
            }
        } catch (error: any) {
            errors.push({
                file: relativePath,
                message: error.message,
                stage: 'parse',
            });
            if (options.verbose) {
                getLogger().info(chalk.red(`❌ ${relativePath}`));
            }
        }
    }

    return {
        valid: errors.length === 0,
        jayHtmlFilesScanned: jayHtmlFiles.length,
        contractFilesScanned: contractFiles.length,
        errors,
        warnings,
        coverage,
    };
}

export function printJayValidationResult(result: ValidationResult, options: ValidateOptions): void {
    const logger = getLogger();
    if (options.json) {
        logger.important(JSON.stringify(result, null, 2));
        return;
    }

    logger.important('');

    if (result.valid) {
        logger.important(chalk.green('✅ Jay Stack validation successful!\n'));
        logger.important(
            `Scanned ${result.jayHtmlFilesScanned} .jay-html files, ${result.contractFilesScanned} .jay-contract files`,
        );
        logger.important('No errors found.');
    } else {
        logger.important(chalk.red('❌ Jay Stack validation failed\n'));
        logger.important('Errors:');

        for (const error of result.errors) {
            logger.important(chalk.red(`  ❌ ${error.file}`));
            logger.important(chalk.gray(`     ${error.message}`));
            logger.important('');
        }

        const validFiles =
            result.jayHtmlFilesScanned + result.contractFilesScanned - result.errors.length;
        logger.important(
            chalk.red(`${result.errors.length} error(s) found, ${validFiles} file(s) valid.`),
        );
    }

    if (result.warnings.length > 0) {
        logger.important('');
        logger.important(chalk.yellow('Warnings:'));
        for (const warning of result.warnings) {
            logger.important(chalk.yellow(`  ⚠ ${warning.file}`));
            logger.important(chalk.gray(`    ${warning.message}`));
            logger.important('');
        }
    }

    if (result.coverage.length > 0) {
        logger.important('');
        logger.important('Tag Coverage:');
        for (const fileCov of result.coverage) {
            logger.important(`  ${fileCov.file}`);
            for (const contract of fileCov.contracts) {
                const label = contract.key
                    ? `${contract.key} (${contract.contractName})`
                    : contract.contractName;
                logger.important(
                    `    ${label}: ${contract.usedTags}/${contract.totalTags} tags used`,
                );
                if (contract.unusedTags.length > 0) {
                    logger.important(chalk.gray(`      Unused: ${contract.unusedTags.join(', ')}`));
                }
                if (contract.requiredUnusedTags.length > 0) {
                    logger.important(
                        chalk.yellow(
                            `      ⚠ Required unused: ${contract.requiredUnusedTags.join(', ')}`,
                        ),
                    );
                }
            }
        }
    }
}
