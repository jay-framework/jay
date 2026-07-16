import chalk from 'chalk';
import path from 'path';
import { promises as fsp } from 'fs';
import { glob } from 'glob';
import {
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION,
    GenerateTarget,
    RuntimeMode,
    findDynamicContract,
    type JayHtmlValidationContext,
    type JayHtmlValidatorFn,
} from '@jay-framework/compiler-shared';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import {
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    generateElementFile,
    generateServerElementFile,
    parseContract,
    htmlElementTagNameMap,
    loadLinkedContract,
    getLinkedContractDir,
    type ContractTag,
    type Contract,
    type RenderingPhase,
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
    stage: 'parse' | 'generate' | 'plugin';
    source?: string;
    suggestion?: string;
}

export interface ValidationWarning {
    file: string;
    message: string;
    source?: string;
    suggestion?: string;
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
    pluginValidators: string[];
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

/** @internal Exported for testing — extracts param names from headless script tag YAML bodies (DL#156) */
export function extractHeadlessPropsParamNames(parsedFile: JayHtmlSourceFile): Set<string> {
    const names = new Set<string>();
    for (const imp of parsedFile.headlessImports) {
        if (imp.headlessProps) {
            for (const key of Object.keys(imp.headlessProps)) {
                names.add(key);
            }
        }
    }
    return names;
}

/** @internal Exported for testing */
export function checkRouteParams(
    parsedFile: JayHtmlSourceFile,
    filePath: string,
    pagesBase: string,
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

    const routeParams = extractRouteParams(filePath, pagesBase);
    const headlessProps = extractHeadlessPropsParamNames(parsedFile);
    const availableParams = new Set([...routeParams, ...headlessProps]);

    const warnings: string[] = [];
    for (const param of requiredParams) {
        if (!availableParams.has(param)) {
            warnings.push(
                `Contract requires param "${param}" but the route does not provide it. ` +
                    `Add a dynamic segment [${param}] to the route path or provide it in the headless component's YAML body.`,
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

const PHASE_ORDER: Record<string, number> = {
    slow: 0,
    fast: 1,
    'fast+interactive': 2,
};

/**
 * Resolve a binding path to its source tag and effective phase.
 * Handles keyed component paths (e.g., "p.categorySlug") and page-level paths.
 */
function resolveBindingPhase(
    bindingPath: string,
    jayHtml: JayHtmlSourceFile,
): RenderingPhase | undefined {
    const segments = bindingPath.split('.');
    const root = segments[0];

    // Check if root is a keyed headless import
    const keyedImport = jayHtml.headlessImports.find((i) => i.key === root && i.contract);
    if (keyedImport?.contract) {
        const tagPath = segments.slice(1).join('.');
        if (!tagPath) return undefined;
        const tag = resolveContractTag(keyedImport.contract, tagPath);
        if (!tag) return undefined;
        return tag.phase || 'slow';
    }

    // Check page contract
    if (jayHtml.contract) {
        const tag = resolveContractTag(jayHtml.contract, bindingPath);
        if (!tag) return undefined;
        return tag.phase || 'slow';
    }

    return undefined;
}

/**
 * Check that <jay:xxx> instance attributes match contract props (DL#124 Phase 2).
 *
 * For each <jay:xxx> element:
 * 1. Non-directive attributes should be declared as contract props
 * 2. Required contract props should be present as attributes
 * 3. Binding source phase must be ≤ prop phase (DL#152)
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

                // Check each passed prop is declared in contract (case-insensitive)
                if (passedProps.size > 0) {
                    const contractPropNamesLower = new Set(
                        (contract.props || []).map((p) => p.name.toLowerCase()),
                    );
                    for (const prop of passedProps) {
                        if (!contractPropNamesLower.has(prop.toLowerCase())) {
                            warnings.push(
                                `<jay:${contractName}> passes attribute "${prop}" but the ` +
                                    `"${contract.name}" contract does not declare it as a prop. ` +
                                    `Add to ${contractName}.jay-contract: props: [{ name: ${prop}, type: string }]`,
                            );
                        }
                    }
                }

                // Check required contract props are present (case-insensitive)
                const passedPropsLower = new Set([...passedProps].map((p) => p.toLowerCase()));
                if (contract.props) {
                    for (const contractProp of contract.props) {
                        if (
                            contractProp.required &&
                            !passedPropsLower.has(contractProp.name.toLowerCase())
                        ) {
                            warnings.push(
                                `<jay:${contractName}> is missing required prop ` +
                                    `"${contractProp.name}" declared in the "${contract.name}" contract.`,
                            );
                        }
                    }
                }

                // Check binding phase compatibility (DL#152)
                if (contract.props) {
                    const lowerAttrs: Record<string, string> = {};
                    for (const [k, v] of Object.entries(attrs)) {
                        lowerAttrs[k.toLowerCase()] = v;
                    }
                    for (const contractProp of contract.props) {
                        const attrValue = lowerAttrs[contractProp.name.toLowerCase()];
                        if (!attrValue) continue;

                        const bindingMatch = attrValue.match(/^\{(.+)\}$/);
                        if (!bindingMatch) continue;

                        const bindingPath = bindingMatch[1];
                        const sourcePhase = resolveBindingPhase(bindingPath, jayHtml);
                        if (!sourcePhase) continue;

                        const propPhase = contractProp.phase ?? 'slow';
                        const sourceOrder = PHASE_ORDER[sourcePhase] ?? 0;
                        const propOrder = PHASE_ORDER[propPhase] ?? 0;

                        if (sourceOrder > propOrder) {
                            warnings.push(
                                `<jay:${contractName}> prop "${contractProp.name}" (phase: ${propPhase}) ` +
                                    `is bound to {${bindingPath}} which is phase: ${sourcePhase}. ` +
                                    `The binding source phase must be ≤ the prop phase. ` +
                                    `Use a ${propPhase}-phase binding, a route param, or a literal value.`,
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

function resolveLinkedTags(tags: ContractTag[], contractDir: string): ContractTag[] {
    return tags.map((tag) => {
        if (tag.link) {
            const linked = loadLinkedContract(tag.link, contractDir, JAY_IMPORT_RESOLVER);
            if (linked) {
                const childDir = getLinkedContractDir(tag.link, contractDir, JAY_IMPORT_RESOLVER);
                return { ...tag, tags: resolveLinkedTags(linked.tags, childDir) };
            }
        }
        if (tag.tags) {
            return { ...tag, tags: resolveLinkedTags(tag.tags, contractDir) };
        }
        return tag;
    });
}

function resolveContractLinks(contract: Contract, contractPath: string | undefined): Contract {
    if (!contractPath) return contract;
    const contractDir = path.dirname(contractPath);
    return { ...contract, tags: resolveLinkedTags(contract.tags, contractDir) };
}

async function runPluginValidators(
    projectRoot: string,
    parsedFiles: Array<{ relativePath: string; parsed: JayHtmlSourceFile }>,
    errors: ValidationError[],
    warnings: ValidationWarning[],
): Promise<string[]> {
    const scannedPlugins = await scanPlugins({ projectRoot, includeDevDeps: true });
    const loadedValidators: string[] = [];

    for (const [, plugin] of scannedPlugins) {
        if (!plugin.manifest.validators) continue;

        for (const validatorDef of plugin.manifest.validators) {
            const source = `${plugin.name}/${validatorDef.name}`;
            let validatorFn: JayHtmlValidatorFn;
            try {
                let handlerModule: any;
                if (plugin.isLocal) {
                    const handlerPath = path.resolve(plugin.pluginPath, validatorDef.handler);
                    handlerModule = await import(handlerPath);
                } else {
                    handlerModule = await import(plugin.packageName);
                }

                validatorFn = plugin.isLocal
                    ? handlerModule.validate ?? handlerModule.default
                    : handlerModule[validatorDef.handler];

                if (typeof validatorFn !== 'function') {
                    errors.push({
                        file: `plugin:${plugin.name}`,
                        message: `Validator "${validatorDef.name}" handler does not export a "validate" function`,
                        stage: 'plugin',
                        source,
                    });
                    loadedValidators.push(source);
                    continue;
                }
            } catch (loadErr: any) {
                errors.push({
                    file: `plugin:${plugin.name}`,
                    message: `Failed to load validator "${validatorDef.name}": ${loadErr.message}`,
                    stage: 'plugin',
                    source,
                });
                loadedValidators.push(source);
                continue;
            }
            loadedValidators.push(source);

            for (const { relativePath, parsed } of parsedFiles) {
                const pageContractPath = parsed.contractRef
                    ? path.resolve(
                          path.dirname(path.resolve(projectRoot, relativePath)),
                          parsed.contractRef,
                      )
                    : undefined;
                const resolvedPageContract = parsed.contract
                    ? resolveContractLinks(parsed.contract, pageContractPath)
                    : undefined;

                const ctx: JayHtmlValidationContext = {
                    filePath: relativePath,
                    body: parsed.body,
                    css: parsed.css,
                    head: parsed.headMeta,
                    contract: resolvedPageContract
                        ? {
                              name: resolvedPageContract.name,
                              tags: resolvedPageContract.tags as any,
                              props: resolvedPageContract.props as any,
                              params: resolvedPageContract.params as any,
                          }
                        : undefined,
                    headlessImports: parsed.headlessImports.map((imp) => {
                        const resolvedContract = imp.contract
                            ? resolveContractLinks(imp.contract, imp.contractPath)
                            : undefined;
                        let providedHeadTags: string[] | undefined;
                        for (const [, p] of scannedPlugins) {
                            const entry = p.manifest.contracts?.find(
                                (c) => c.name === imp.contractName,
                            );
                            if (entry?.headTags) {
                                providedHeadTags = entry.headTags;
                                break;
                            }
                            const dynEntry = findDynamicContract(p.manifest, imp.contractName);
                            if (dynEntry?.headTags) {
                                providedHeadTags = dynEntry.headTags;
                                break;
                            }
                        }
                        return {
                            key: imp.key,
                            contractName: imp.contractName,
                            contract: resolvedContract
                                ? {
                                      name: resolvedContract.name,
                                      tags: resolvedContract.tags as any,
                                      props: resolvedContract.props as any,
                                      params: resolvedContract.params as any,
                                  }
                                : undefined,
                            providedHeadTags,
                        };
                    }),
                    projectRoot,
                };

                try {
                    const findings = await validatorFn(ctx);
                    for (const finding of findings) {
                        if (finding.severity === 'error') {
                            errors.push({
                                file: relativePath,
                                message: finding.message,
                                stage: 'plugin',
                                source,
                                suggestion: finding.suggestion,
                            });
                        } else {
                            warnings.push({
                                file: relativePath,
                                message: finding.message,
                                source,
                                suggestion: finding.suggestion,
                            });
                        }
                    }
                } catch (runErr: any) {
                    errors.push({
                        file: relativePath,
                        message: `Validator "${source}" threw: ${runErr.message}`,
                        stage: 'plugin',
                        source,
                    });
                }
            }
        }
    }

    return loadedValidators;
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
    const parsedFiles: Array<{ relativePath: string; parsed: JayHtmlSourceFile }> = [];

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

            parsedFiles.push({ relativePath, parsed: parsedFile.val! });

            // Check for deprecated jay-params (DL#156)
            if (content.includes('application/jay-params')) {
                warnings.push({
                    file: relativePath,
                    message:
                        '<script type="application/jay-params"> is deprecated. ' +
                        'Move the values into the YAML body of the headless component that uses them. ' +
                        'See agent-kit/developer/routing.md for details.',
                });
            }

            // Check route params match contract params (contract→route)
            const routeParamWarnings = checkRouteParams(parsedFile.val!, jayFile, scanDir);
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

            // Also validate server element compilation (SSR) —
            // catches binding errors inside headless instance templates
            const serverElementFile = generateServerElementFile(parsedFile.val!);
            if (serverElementFile.validations.length > 0) {
                for (const validation of serverElementFile.validations) {
                    errors.push({
                        file: relativePath,
                        message: `[SSR] ${validation}`,
                        stage: 'generate',
                    });
                }
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

    // --- Plugin validators (DL#145) ---
    const pluginValidators = await runPluginValidators(projectRoot, parsedFiles, errors, warnings);

    return {
        valid: errors.length === 0,
        jayHtmlFilesScanned: jayHtmlFiles.length,
        contractFilesScanned: contractFiles.length,
        errors,
        warnings,
        coverage,
        pluginValidators,
    };
}

export function printJayValidationResult(result: ValidationResult, options: ValidateOptions): void {
    const logger = getLogger();
    if (options.json) {
        logger.important(JSON.stringify(result, null, 2));
        return;
    }

    logger.important('');

    // --- Core validation section ---
    const coreErrors = result.errors.filter((e) => e.stage !== 'plugin');
    const coreWarnings = result.warnings.filter((w) => !w.source);

    logger.important(chalk.bold('📦 jay-stack (core)'));
    if (coreErrors.length === 0) {
        logger.important(
            chalk.green(
                `   ✅ ${result.jayHtmlFilesScanned} .jay-html files, ${result.contractFilesScanned} .jay-contract files — no errors`,
            ),
        );
    } else {
        for (const error of coreErrors) {
            logger.important(chalk.red(`   ❌ ${error.file}`));
            logger.important(chalk.gray(`      ${error.message}`));
            if (error.suggestion) {
                logger.important(chalk.blue(`      Suggestion: ${error.suggestion}`));
            }
        }
    }
    for (const warning of coreWarnings) {
        logger.important(chalk.yellow(`   ⚠ ${warning.file}`));
        logger.important(chalk.gray(`     ${warning.message}`));
        if (warning.suggestion) {
            logger.important(chalk.blue(`     Suggestion: ${warning.suggestion}`));
        }
    }

    // --- Plugin validator sections ---
    const pluginErrors = result.errors.filter((e) => e.stage === 'plugin');
    const pluginWarnings = result.warnings.filter((w) => !!w.source);

    for (const validatorName of result.pluginValidators) {
        const errs = pluginErrors.filter((e) => e.source === validatorName);
        const warns = pluginWarnings.filter((w) => w.source === validatorName);

        logger.important('');
        logger.important(chalk.bold(`📦 ${validatorName}`));

        if (errs.length === 0 && warns.length === 0) {
            logger.important(chalk.green('   ✅ No issues found'));
        }
        for (const error of errs) {
            logger.important(chalk.red(`   ❌ ${error.file}`));
            logger.important(chalk.gray(`      ${error.message}`));
            if (error.suggestion) {
                logger.important(chalk.blue(`      Suggestion: ${error.suggestion}`));
            }
        }

        const fileGroups = new Map<string, typeof warns>();
        for (const warning of warns) {
            const group = fileGroups.get(warning.file) || [];
            group.push(warning);
            fileGroups.set(warning.file, group);
        }
        for (const [file, groupWarns] of fileGroups) {
            logger.important(chalk.yellow(`   ⚠ ${file}`));
            for (const warning of groupWarns) {
                if (warning.message) {
                    logger.important(chalk.gray(`      ${warning.message}`));
                }
            }
            const suggestions = [...new Set(groupWarns.map((w) => w.suggestion).filter(Boolean))];
            if (suggestions.length > 0) {
                logger.important(chalk.blue(`      Suggestions:`));
                for (const s of suggestions) {
                    logger.important(chalk.blue(`        ${s}`));
                }
            }
        }
    }

    // --- Tag coverage section ---
    if (result.coverage.length > 0) {
        logger.important('');
        logger.important(chalk.bold('📦 Tag Coverage'));
        for (const fileCov of result.coverage) {
            logger.important(`   ${fileCov.file}`);
            for (const contract of fileCov.contracts) {
                const label = contract.key
                    ? `${contract.key} (${contract.contractName})`
                    : contract.contractName;
                logger.important(
                    `     ${label}: ${contract.usedTags}/${contract.totalTags} tags used`,
                );
                if (contract.unusedTags.length > 0) {
                    logger.important(
                        chalk.gray(`       Unused: ${contract.unusedTags.join(', ')}`),
                    );
                }
                if (contract.requiredUnusedTags.length > 0) {
                    logger.important(
                        chalk.yellow(
                            `       ⚠ Required unused: ${contract.requiredUnusedTags.join(', ')}`,
                        ),
                    );
                }
            }
        }
    }

    // --- Summary ---
    logger.important('');
    if (result.valid) {
        logger.important(chalk.green('Validation passed.'));
    } else {
        logger.important(chalk.red(`Validation failed — ${result.errors.length} error(s).`));
    }
}
