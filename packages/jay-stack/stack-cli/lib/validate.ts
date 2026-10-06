import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { glob } from 'glob';
import {
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION,
    GenerateTarget,
    RuntimeMode,
    findDynamicContract,
    equalJayTypes,
    isEnumType,
    type JayType,
    type JayHtmlValidationContext,
    type JayHtmlValidatorFn,
} from '@jay-framework/compiler-shared';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import {
    hasTemplateForContractFile,
    listTemplatesForContractFile,
    type TemplateVariant,
} from '@jay-framework/stack-server-build';
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
    type JayHeadlessImports,
} from '@jay-framework/compiler-jay-html';
import { getLogger } from '@jay-framework/logger';
import {
    diffBodies,
    diffCss,
    materialise,
    isRegionTag,
    facetLabel,
    overrideSpecFor,
    type DiffEntry,
} from '@jay-framework/compiler-inline-composition';
import { parse as parseHtml, HTMLElement, NodeType } from 'node-html-parser';
import { loadConfig, getConfigWithDefaults } from './config';
import { buildMaterialiseOptions } from './materialise-context';
import { extractScopeBlock, splitScopeBlocks } from './scope-css';
import { buildRouteOracle, collectPublicAssets, checkInternalLinks } from './check-internal-links';

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

/**
 * DL#207 — per-page design-system coverage: how much of a page's markup is composed of `template=`-backed
 * `<jay:X>` regions. `coveragePct = covered / total` (DOM element count; `0` when the page has no elements).
 * Report-only metric — never affects `valid`/exit code and emits no warnings.
 */
export interface DesignSystemCoverage {
    file: string;
    coveragePct: number;
    covered: number;
    total: number;
}

/**
 * DL#207 — project-wide design-system reuse. `perTemplate` counts how many `template=`-backed regions
 * resolve to each template path (project-relative key); same-page repeats count. `catalogued` is the size
 * of the known template universe (design-system index); `reusedMoreThanOnce` is how many used templates
 * have count ≥ 2; `reusedOfCatalogued` is how many *catalogued* templates have count ≥ 2 (the "K of M").
 * Report-only metric.
 */
export interface DesignSystemReuse {
    perTemplate: Record<string, number>;
    catalogued: number;
    reusedMoreThanOnce: number;
    reusedOfCatalogued: number;
}

export interface ValidationResult {
    valid: boolean;
    jayHtmlFilesScanned: number;
    contractFilesScanned: number;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    coverage: FileCoverage[];
    pluginValidators: string[];
    // DL#207 — report-only design-system scorecard.
    designSystemCoverage: DesignSystemCoverage[];
    designSystemReuse: DesignSystemReuse;
}

async function findJayFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_EXTENSION}`);
}

async function findContractFiles(dir: string): Promise<string[]> {
    return await glob(`${dir}/**/*${JAY_CONTRACT_EXTENSION}`);
}

// DL#200/204 — template availability (`hasTemplateForContractFile`) and enumeration
// (`listTemplatesForContractFile`) are imported from stack-server-build, which associates a template
// with a contract by the template's declared `contract=` reference rather than by filename.

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

// --- Page component export check ---

function checkPageComponentExport(jayHtmlPath: string): string | null {
    const dirname = path.dirname(jayHtmlPath);
    const compPath = path.join(dirname, 'page.ts');
    if (!fs.existsSync(compPath)) return null;

    let content: string;
    try {
        content = fs.readFileSync(compPath, 'utf-8');
    } catch {
        return null;
    }

    const exportName = 'page';
    const patterns = [
        new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`, 'm'),
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${exportName}\\b`),
        new RegExp(`export\\s+(?:const|let|var)\\s+${exportName}\\b`),
    ];

    if (patterns.some((p) => p.test(content))) return null;

    return (
        `${path.relative(dirname, compPath)} exists but does not export "${exportName}". ` +
        `Remove the file or add the export.`
    );
}

// --- Direct document access check ---

const DOCUMENT_ACCESS_PATTERNS = [
    /document\.getElementById\b/,
    /document\.querySelector\b/,
    /document\.querySelectorAll\b/,
    /document\.getElementsBy\w+/,
    /document\.createElement\b/,
    /document\.body\.appendChild\b/,
    /document\.addEventListener\b/,
];

const DOM_SUPPRESS_COMMENT = 'jay-dom: allow';

function checkDirectDocumentAccess(jayHtmlPath: string): string[] {
    const dirname = path.dirname(jayHtmlPath);
    const basename = path.basename(jayHtmlPath, JAY_EXTENSION);
    const candidates = [path.join(dirname, `${basename}.ts`), path.join(dirname, 'page.ts')];
    const compPath = candidates.find((p) => fs.existsSync(p));
    if (!compPath) return [];
    const compName = path.basename(compPath);

    let content: string;
    try {
        content = fs.readFileSync(compPath, 'utf-8');
    } catch {
        return [];
    }

    const warnings: string[] = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(DOM_SUPPRESS_COMMENT)) continue;
        for (const pattern of DOCUMENT_ACCESS_PATTERNS) {
            const match = pattern.exec(line);
            if (match) {
                warnings.push(
                    `${compName}:${i + 1} — Direct DOM access "${match[0]}" — use Jay refs instead. ` +
                        `Suppress with // ${DOM_SUPPRESS_COMMENT} on the same line. ` +
                        `See agent-kit/developer/component-refs.md`,
                );
                break;
            }
        }
    }
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
    'jc', // component-provenance marker stamped on a flattened <jay:X> region (DL#196)
]);

const PHASE_ORDER: Record<string, number> = {
    slow: 0,
    fast: 1,
    'fast+interactive': 2,
};

/**
 * Resolve a binding path to its source contract tag.
 * Handles keyed component paths (e.g., "p.categorySlug") and page-level paths.
 */
function resolveBindingTag(
    bindingPath: string,
    jayHtml: JayHtmlSourceFile,
): ContractTag | undefined {
    const segments = bindingPath.split('.');
    const root = segments[0];

    // Check if root is a keyed headless import
    const keyedImport = jayHtml.headlessImports.find((i) => i.key === root && i.contract);
    if (keyedImport?.contract) {
        const tagPath = segments.slice(1).join('.');
        if (!tagPath) return undefined;
        return resolveContractTag(keyedImport.contract, tagPath);
    }

    // Check page contract
    if (jayHtml.contract) {
        return resolveContractTag(jayHtml.contract, bindingPath);
    }

    return undefined;
}

/** Resolve a binding path to its source tag's effective phase (DL#152). */
function resolveBindingPhase(
    bindingPath: string,
    jayHtml: JayHtmlSourceFile,
): RenderingPhase | undefined {
    const tag = resolveBindingTag(bindingPath, jayHtml);
    return tag ? tag.phase || 'slow' : undefined;
}

/** Resolve a binding path to its source tag's declared data type (DL#192). */
function resolveBindingDataType(
    bindingPath: string,
    jayHtml: JayHtmlSourceFile,
): JayType | undefined {
    return resolveBindingTag(bindingPath, jayHtml)?.dataType;
}

/** Human-readable label for a prop/tag data type, used in validation messages (DL#192). */
function typeLabel(t: JayType): string {
    return isEnumType(t) ? `enum(${t.values.join(' | ')})` : t.name;
}

/** Collect every `<jay:X>` region element in a body subtree, including nested regions. */
function collectRegionElements(root: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const visit = (el: HTMLElement) => {
        for (const child of el.childNodes) {
            if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
            const childEl = child as HTMLElement;
            if (isRegionTag(childEl)) out.push(childEl);
            visit(childEl);
        }
    };
    visit(root);
    return out;
}

/**
 * The *direct* child regions of a region: `<jay:Y>` reachable under `region` without descending through a
 * nested region first (mirrors the materialiser's `directRegions`). These are the regions a parent's DL#203
 * `@scope (…) to (…)` donut names as its boundary.
 */
function directChildRegions(region: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const visit = (el: HTMLElement) => {
        for (const child of el.childNodes) {
            if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
            const childEl = child as HTMLElement;
            if (isRegionTag(childEl)) out.push(childEl);
            else visit(childEl);
        }
    };
    visit(region);
    return out;
}

/** A region-drift finding: the factual `message` plus a separate remediation `suggestion` (DL#196 §4). */
interface RegionDriftFinding {
    message: string;
    suggestion?: string;
}

/** Format one facet drift entry as a validation warning (DL#196 §4). */
function formatRegionDrift(
    contractName: string,
    template: string,
    entry: DiffEntry,
): RegionDriftFinding {
    const label = facetLabel(entry.facet);
    const values =
        entry.change === 'added'
            ? ` (now ${entry.regionValue ?? ''})`
            : entry.change === 'removed'
              ? ` (was ${entry.sourceValue ?? ''})`
              : ` (${entry.sourceValue ?? ''} → ${entry.regionValue ?? ''})`;
    const spec = overrideSpecFor(entry.facet);
    const mark =
        spec.target === 'markup-attribute'
            ? `mark the node override="${spec.value}"`
            : spec.value
              ? `mark the CSS rule /* jay:override: ${spec.value} */`
              : 'mark the CSS rule /* jay:override */';
    // DL#202 — for a content (`children`) drift, offer the template-side content-slot marker as the
    // resilient alternative: a consumer owning the copy, not a per-page override.
    const contentSlotHint =
        entry.facet.kind === 'children'
            ? ` Or, if these children are a content slot, mark the node jay-content in the template "${template}" so consumer edits are expected.`
            : '';
    return {
        message:
            `<jay:${contractName}> region differs from source template "${template}": ` +
            `${label} ${entry.change}${values}.`,
        suggestion: `To keep the page's version, ${mark}; to discard it and re-flatten from source, run \`jay-stack sync\`.${contentSlotHint}`,
    };
}

/**
 * DL#196 §4 — report drift between a flattened `<jay:X>` region's inline body and its source template.
 *
 * A headless import carrying `template=` provenance is diffed, facet-granular, against the current
 * source template (`diffBodies`). Unmarked deviations are warnings; the author resolves each by marking
 * the drifted node `override="<facet>"` (the page owns that facet, so it is neither reported nor touched
 * by sync) or by running `jay-stack sync` to re-flatten from source. A region without `template=` has no
 * provenance and is not drift-checked.
 *
 * Template loading is injected so this stays pure and unit-testable; the CLI supplies a filesystem
 * reader resolving `template=` relative to the page directory.
 *
 * @internal Exported for testing
 */
export function checkRegionDrift(
    jayHtml: JayHtmlSourceFile,
    loadTemplate: (relativeTemplatePath: string) => string | undefined,
): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const warnings: RegionDriftFinding[] = [];
    // A page may flatten the same source template into several regions — parse each template once.
    const templateBodyCache = new Map<string, HTMLElement | null>();

    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = (region.rawTagName ?? '').toLowerCase().substring(4);
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        if (!imp?.template) continue;

        let templateBody = templateBodyCache.get(imp.template);
        if (templateBody === undefined) {
            const content = loadTemplate(imp.template);
            templateBody = (content ? parseHtml(content).querySelector('body') : null) ?? null;
            templateBodyCache.set(imp.template, templateBody);
            if (!templateBody) {
                warnings.push({
                    message:
                        `<jay:${contractName}> declares template="${imp.template}" but its source ` +
                        `template could not be read.`,
                    suggestion: 'Fix the path or remove the attribute.',
                });
            }
        }
        if (!templateBody) continue;

        for (const entry of diffBodies(templateBody, region)) {
            warnings.push(formatRegionDrift(contractName, imp.template, entry));
        }
    }
    return warnings;
}

/** Concatenate the CSS of every `<style>` in a template's raw HTML source. */
function extractStyleCss(templateHtml: string): string {
    return parseHtml(templateHtml)
        .querySelectorAll('style')
        .map((s) => s.textContent)
        .join('\n\n');
}

/**
 * DL#196 §4 — report CSS drift between a flattened region's `@scope (.<ref>)` block and its source
 * template's CSS.
 *
 * The materialiser wraps each design-system region's copied CSS in `@scope (.<ref>)` (the region's `ref`).
 * We isolate that block from the page's aggregated CSS and diff it, facet-granular (`diffCss`, with
 * `@scope` transparent), against the source template's `<style>` CSS. Unmarked deviations are warnings;
 * the author keeps the page's version with a `/​* jay:override *​/` pragma or re-flattens with `jay-stack
 * sync`. A region without `template=` (no provenance) or without a `ref` (no CSS was scoped) is skipped.
 *
 * @internal Exported for testing
 */
export function checkRegionCssDrift(
    jayHtml: JayHtmlSourceFile,
    loadTemplate: (relativeTemplatePath: string) => string | undefined,
): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const pageCss = jayHtml.css ?? '';
    const warnings: RegionDriftFinding[] = [];
    // Parse each source template's CSS once even when flattened into several regions.
    const templateCssCache = new Map<string, string | null>();

    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = (region.rawTagName ?? '').toLowerCase().substring(4);
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        if (!imp?.template) continue;

        const ref = region.getAttribute('ref');
        if (!ref) continue; // no scope selector → the materialiser scoped no CSS for this region

        let templateCss = templateCssCache.get(imp.template);
        if (templateCss === undefined) {
            const content = loadTemplate(imp.template);
            if (content === undefined) {
                templateCss = null;
            } else {
                // DL#206 — the materialiser now emits component CSS verbatim inside `@scope (.<ref>)` (the
                // real roots are descendants of the scope-anchor wrapper, so no root→`:scope` rewrite), so a
                // correctly flattened region reports no drift when compared against the source CSS as-is.
                templateCss = extractStyleCss(content);
            }
            templateCssCache.set(imp.template, templateCss);
        }
        if (templateCss === null) continue; // unreadable template already reported by checkRegionDrift

        const pageBlock = extractScopeBlock(pageCss, `.${ref}`) ?? '';
        if (!templateCss.trim() && !pageBlock.trim()) continue;

        // CSS-SCOPE-MISSING — the template ships CSS but the page has no @scope block for this region's
        // ref. Without a block there is nothing to drift-check; a re-flatten would (re)introduce it, so
        // report it rather than silently pass as "no drift" (DL#196 §4/§5 — validate-clean ⇔ sync-clean).
        if (templateCss.trim() && !pageBlock.trim()) {
            warnings.push({
                message:
                    `<jay:${contractName}> (template="${imp.template}") has no @scope (.${ref}) CSS ` +
                    `block on the page, but its source template ships CSS.`,
                suggestion: 'Run jay-stack sync to re-flatten the region CSS.',
            });
            continue;
        }

        for (const entry of diffCss(templateCss, pageBlock)) {
            warnings.push(formatRegionDrift(contractName, imp.template, entry));
        }
    }
    return warnings;
}

/**
 * DL#196 §4/§5 — validate that the page's `@scope` CSS is in canonical, coalesced form so `jay-stack sync`'s
 * assumptions hold (one scoped block per template+overrides group; each ref in exactly one block). Two
 * block-level rules that per-region drift cannot see:
 *
 *  - **CSS-SCOPE-MIXED-TEMPLATE** — one block's selector-list mixes refs from *different* source templates.
 *    Its single body cannot be correct for all members, and `sync` never produces such a block.
 *  - **CSS-SCOPE-NOT-COALESCED** — two blocks share the same template *and* an identical body but are
 *    emitted separately; they should be one selector-list block (the duplication this refinement removes).
 *
 * @internal Exported for testing
 */
export function checkRegionCssScoping(jayHtml: JayHtmlSourceFile): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const pageCss = jayHtml.css ?? '';
    if (!pageCss.trim()) return [];

    // Map each region's scope-anchor selector (`.<ref>`) to its source template path.
    const templateOf = new Map<string, string>();
    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = (region.rawTagName ?? '').toLowerCase().substring(4);
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        const ref = region.getAttribute('ref');
        if (imp?.template && ref) templateOf.set(`.${ref}`, imp.template);
    }

    const warnings: RegionDriftFinding[] = [];
    // Group blocks by (template, body) to detect same-group duplicates; flag mixed-template blocks inline.
    const groups = new Map<string, string[]>();
    for (const { selectors, to, block } of splitScopeBlocks(pageCss)) {
        const known = selectors.filter((s) => templateOf.has(s));
        if (known.length === 0) continue; // a hand-authored scope unrelated to any region — ignore
        const templates = [...new Set(known.map((s) => templateOf.get(s)!))];
        if (templates.length > 1) {
            warnings.push({
                message:
                    `A single @scope (${selectors.join(', ')}) block mixes refs from different source ` +
                    `templates (${templates.join(', ')}); each region's CSS must be scoped to its own template.`,
                suggestion: 'Run jay-stack sync to re-flatten the region CSS.',
            });
            continue; // mixed block cannot be keyed for the coalesce check
        }
        // DL#203 - fold the sorted `to (...)` boundary into the key: two blocks sharing a template and
        // body but with different donut boundaries stay separate, so they must not be flagged to coalesce.
        const key = `${templates[0]} ${scopeBody(block)} ${[...to].sort().join(',')}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(selectors.join(', '));
    }
    for (const [key, blockSelectors] of groups) {
        if (blockSelectors.length < 2) continue;
        const template = key.split(' ')[0];
        warnings.push({
            message:
                `${blockSelectors.length} @scope blocks (${blockSelectors.join(' ; ')}) share template ` +
                `"${template}" and identical CSS but are not coalesced into one selector-list block.`,
            suggestion: 'Run jay-stack sync to coalesce the region CSS.',
        });
    }
    return warnings;
}

/**
 * DL#203 — require a `ref` on every materialisable nested region that sits inside a region whose template
 * ships CSS. That parent region's CSS is emitted as a `@scope (.<parentRef>) to (.<childRef>…)` donut so it
 * stops at each nested region; the boundary `.<childRef>` only exists because the materialiser stamps the
 * child's `ref` as a class on the flattened region root. A ref-less nested region has no anchor to stamp, so
 * it cannot be named in the `to (…)` list — the parent's descendant selectors would bleed into it. Flag it
 * so the author adds a `ref=` in the template.
 *
 * (A non-materialisable child — a `<jay:Y>` imported without `template=` — is never flattened or stamped, so
 * it cannot be a donut boundary regardless; it is out of scope for this rule.)
 *
 * Template loading is injected (mirrors `checkRegionDrift`) so this stays pure and unit-testable.
 *
 * @internal Exported for testing
 */
export function checkNestedRegionRefs(
    jayHtml: JayHtmlSourceFile,
    loadTemplate: (relativeTemplatePath: string) => string | undefined,
): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const warnings: RegionDriftFinding[] = [];
    const shipsCssCache = new Map<string, boolean>();
    const templateShipsCss = (rel: string): boolean => {
        let v = shipsCssCache.get(rel);
        if (v === undefined) {
            const content = loadTemplate(rel);
            v = content !== undefined && extractStyleCss(content).trim() !== '';
            shipsCssCache.set(rel, v);
        }
        return v;
    };

    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = (region.rawTagName ?? '').toLowerCase().substring(4);
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        if (!imp?.template) continue;
        const parentRef = region.getAttribute('ref');
        if (!parentRef) continue; // no scope selector -> no @scope block -> no donut emitted for this region
        if (!templateShipsCss(imp.template)) continue; // template ships no CSS -> no @scope block -> no donut

        for (const child of directChildRegions(region)) {
            const childName = (child.rawTagName ?? '').toLowerCase().substring(4);
            const childImp = importsWithTemplate.find((i) => i.contractName === childName);
            if (!childImp?.template) continue; // non-materialisable child — cannot be a donut boundary anyway
            if (child.getAttribute('ref')) continue;
            warnings.push({
                message:
                    `<jay:${childName}> is nested inside <jay:${contractName}> (template="${imp.template}"), ` +
                    `whose CSS is scoped as an @scope (.${parentRef}) donut, but <jay:${childName}> has no ref= — ` +
                    `so its region cannot be isolated from the parent's styles.`,
                suggestion:
                    `Add a ref= to the <jay:${childName}> in template "${imp.template}" so sync can stamp its ` +
                    `scope-anchor class and emit the \`to (.<ref>)\` boundary.`,
            });
        }
    }
    return warnings;
}

/**
 * DL#209 — REGION-CSS-NO-REF (error): a region that flattens a `template=` which ships CSS, but whose
 * `<jay:X>` tag has **no `ref=`**, silently loses that CSS on `sync`.
 *
 * Without a `ref` there is no scope anchor (`.<ref>`), so the materialiser can only emit the region's CSS
 * **unscoped/global**; `mergeScopeCss` then re-emits only `@scope` blocks it owns, so the unscoped block is
 * never carried back into the page `<style>` and the styling vanishes with no other diagnostic. The fix is
 * **not** to carry the unscoped CSS (that would leak the region's selectors page-wide, defeating DL#203) —
 * it is to require a `ref` so the CSS can be scoped and survive. This fills a real gap: `checkRegionCssDrift`
 * skips ref-less regions entirely, and `checkNestedRegionRefs` (DL#203) only covers the nested-child case.
 *
 * Severity is **error** (not warning like the sibling region-CSS rules): unlike drift, this silently
 * deletes authored styling — a correctness loss the author should fix before it is lost.
 *
 * Template loading is injected (mirrors `checkNestedRegionRefs`) so this stays pure and unit-testable.
 *
 * @internal Exported for testing
 */
export function checkRegionCssNoRef(
    jayHtml: JayHtmlSourceFile,
    loadTemplate: (relativeTemplatePath: string) => string | undefined,
): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const findings: RegionDriftFinding[] = [];
    const shipsCssCache = new Map<string, boolean>();
    const templateShipsCss = (rel: string): boolean => {
        let v = shipsCssCache.get(rel);
        if (v === undefined) {
            const content = loadTemplate(rel);
            v = content !== undefined && extractStyleCss(content).trim() !== '';
            shipsCssCache.set(rel, v);
        }
        return v;
    };

    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = (region.rawTagName ?? '').toLowerCase().substring(4);
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        if (!imp?.template) continue; // not a design-system region (REGION-NOT-LINKED covers that)
        if (region.getAttribute('ref')) continue; // has a scope anchor -> CSS can be scoped and survives
        if (!templateShipsCss(imp.template)) continue; // nothing to lose -> no diagnostic

        findings.push({
            message:
                `<jay:${contractName}> flattens template="${imp.template}" which ships CSS, but the region ` +
                `has no ref= — so its CSS cannot be scoped and \`jay-stack sync\` will silently drop it.`,
            suggestion:
                `Add a ref= to the <jay:${contractName}> so sync can scope its CSS as an ` +
                `@scope (.<ref>) block and preserve it.`,
        });
    }
    return findings;
}

/**
 * DL#200 — the content-tag allowlist. Net-new DOM made *only* of these tags is content enrichment (a bare
 * text turned into text + bold/span/icon/image, a bullet list, a table) — not a different design, so it does
 * not fire `REGION-OVERRIDE-NON-CONTENT`. Any added element *outside* this set (`div`, `section`, `form`,
 * layout wrappers, custom components) is structural rework → a new design variant. Tunable: a single constant.
 */
const CONTENT_TAGS = new Set<string>([
    // inline text semantics
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'small',
    'mark',
    'sub',
    'sup',
    'abbr',
    'cite',
    'q',
    'code',
    'kbd',
    'samp',
    'var',
    'del',
    'ins',
    'time',
    'data',
    'bdi',
    'bdo',
    'ruby',
    'rt',
    'rp',
    // links & line breaks
    'a',
    'br',
    'wbr',
    // media (content, not layout)
    'img',
    'picture',
    'source',
    'svg',
    'use',
    'path',
    'icon',
    'figure',
    'figcaption',
    'audio',
    'video',
    // lists
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    // tables
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'caption',
    'colgroup',
    'col',
    // text blocks & headings
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'hr',
    // form labels/copy (not controls, which imply structure)
    'label',
]);

/** DL#200 — is this drift entry a *non-content* override (fires `REGION-OVERRIDE-NON-CONTENT`)? */
function isNonContentOverride(entry: DiffEntry, contentTags: Set<string>): boolean {
    switch (entry.facet.kind) {
        case 'style-declaration':
        case 'css-rule':
        case 'css-declaration':
            return true; // restyle — changes the look
        case 'attribute':
            return entry.facet.name.toLowerCase() === 'class'; // class = restyle; src/alt/href/… are content
        case 'children':
            // Net-new DOM: content iff every added element tag is on the allowlist (text-only change → []).
            return (entry.addedElementTags ?? []).some((tag) => !contentTags.has(tag));
    }
}

/** DL#200 — contract name backing a `<jay:X>` region tag (tag name minus the `jay:` prefix). */
function regionContractName(region: HTMLElement): string {
    return (region.rawTagName ?? '').toLowerCase().substring(4);
}

/**
 * DL#200 — is a region-scoped rule suppressed for this import? Primary: `jay-validations="RULE"` on the
 * `application/jay-headless` import (per region type). Addition (REGION-NOT-LINKED only): a contract-keyed
 * `allow-inline-region: [Contract, …]` list in the `application/jay-validations` script.
 */
function isRegionRuleSuppressed(
    imp: JayHeadlessImports | undefined,
    jayHtml: JayHtmlSourceFile,
    ruleId: string,
): boolean {
    if (imp?.suppressedValidations?.includes(ruleId)) return true;
    if (ruleId === 'REGION-NOT-LINKED' && imp) {
        const allow = jayHtml.validationOverrides?.['jay-stack']?.['allow-inline-region'];
        const list = Array.isArray(allow) ? allow.map((v) => String(v).toLowerCase()) : [];
        if (list.includes(imp.contractName.toLowerCase())) return true;
    }
    return false;
}

/**
 * DL#200 — `REGION-NOT-LINKED` (warning, per region type). A `<jay:X>` region whose import has no
 * `template=` while a design-system template *exists for its contract* is a hand-authored instance that
 * could be a managed design-system element. Keyed imports and already-linked regions are skipped; a region
 * whose contract has no template anywhere stays silent (nothing to link — `COMPONENT-NO-TEMPLATE` covers the
 * authoring side). One finding per region type.
 *
 * `templatesFor` is injected (enumeration by contract identity, DL#204) so this stays pure and
 * unit-testable; the suggestion names the real template path(s) instead of a placeholder.
 *
 * @internal Exported for testing
 */
export function checkRegionNotLinked(
    jayHtml: JayHtmlSourceFile,
    templatesFor: (imp: JayHeadlessImports) => TemplateVariant[],
): RegionDriftFinding[] {
    const findings: RegionDriftFinding[] = [];
    const seen = new Set<string>();
    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = regionContractName(region);
        if (seen.has(contractName)) continue;
        const imp = jayHtml.headlessImports.find((i) => i.contractName === contractName);
        if (!imp) continue;
        if (imp.key || imp.template) continue; // keyed, or already a design-system element
        const templates = templatesFor(imp);
        if (templates.length === 0) continue; // no template for this contract → nothing to link
        if (isRegionRuleSuppressed(imp, jayHtml, 'REGION-NOT-LINKED')) continue;
        seen.add(contractName);
        const templateHint =
            templates.length === 1
                ? `template="${templates[0].path}"`
                : `template= one of: ${templates.map((t) => `"${t.path}"`).join(', ')}`;
        findings.push({
            message:
                `<jay:${contractName}> is hand-authored, but a design-system template exists for contract ` +
                `"${imp.contractName}". Prefer linking it as a design-system element.`,
            suggestion:
                `Add ${templateHint} to the <script type="application/jay-headless"> ` +
                `import and run \`jay-stack sync\`. For a deliberate one-off, suppress on the import with ` +
                `jay-validations="REGION-NOT-LINKED" (or list the contract under allow-inline-region in ` +
                `<script type="application/jay-validations">). See agent-kit/designer/design-system-guide.md.`,
        });
    }
    return findings;
}

/**
 * DL#200 — `REGION-OVERRIDE-NON-CONTENT` (warning, per linked region type). A region that *has* `template=`
 * but drifts from its source template by a *non-content* override (style, class, CSS, or net-new DOM with any
 * non-allowlisted tag) is becoming its own variant. Fire on the first such override — no threshold. Content
 * drift (text / `src` / `alt`, and net-new DOM made only of allowlisted content tags) never fires; that is
 * what flattening is for. One finding per region type.
 *
 * @internal Exported for testing
 */
export function checkRegionOverrideNonContent(
    jayHtml: JayHtmlSourceFile,
    loadTemplate: (relativeTemplatePath: string) => string | undefined,
    contentTags: Set<string> = CONTENT_TAGS,
): RegionDriftFinding[] {
    const importsWithTemplate = jayHtml.headlessImports.filter((imp) => imp.template);
    if (importsWithTemplate.length === 0) return [];

    const findings: RegionDriftFinding[] = [];
    const seen = new Set<string>();
    const templateBodyCache = new Map<string, HTMLElement | null>();

    for (const region of collectRegionElements(jayHtml.body)) {
        const contractName = regionContractName(region);
        if (seen.has(contractName)) continue;
        const imp = importsWithTemplate.find((i) => i.contractName === contractName);
        if (!imp?.template) continue;
        if (isRegionRuleSuppressed(imp, jayHtml, 'REGION-OVERRIDE-NON-CONTENT')) continue;

        let templateBody = templateBodyCache.get(imp.template);
        if (templateBody === undefined) {
            const content = loadTemplate(imp.template);
            templateBody = (content ? parseHtml(content).querySelector('body') : null) ?? null;
            templateBodyCache.set(imp.template, templateBody);
        }
        if (!templateBody) continue; // unreadable template already reported by checkRegionDrift

        const hasNonContent = diffBodies(templateBody, region).some((entry) =>
            isNonContentOverride(entry, contentTags),
        );
        if (!hasNonContent) continue;
        seen.add(contractName);
        findings.push({
            message:
                `<jay:${contractName}> changes its design-system template's look or structure (style, class, ` +
                `or net-new layout DOM) — that is a different design, not a content tweak.`,
            suggestion:
                `Prefer a second design-system template (a new variant) for contract "${imp.contractName}" ` +
                `and link this region to it. Editing text/images, or enriching text with inline markup, is ` +
                `fine; use conditionals only for runtime state changes, not for a different design. To accept ` +
                `this override, suppress on the import with jay-validations="REGION-OVERRIDE-NON-CONTENT". ` +
                `See agent-kit/designer/design-system-guide.md.`,
        });
    }
    return findings;
}

/**
 * DL#200 — `COMPONENT-NO-TEMPLATE` (warning, per component). A headless component (`.jay-contract` under the
 * components tree) that ships no `.jay-html` template for its contract cannot be flattened as a design-system
 * element — every consumer must hand-author it. Suppress for genuinely UI-less (data/logic-only) components
 * via `allow-no-template: [Contract, …]` (project-wide, in any page's `application/jay-validations`) since a
 * data-only component has no `.jay-html` to host a `jay-validations=` attribute.
 *
 * @internal Exported for testing
 */
export function checkComponentNoTemplate(
    contractFile: string,
    contractName: string,
    hasTemplate: (contractFile: string) => boolean,
    allowNoTemplate: Set<string>,
): RegionDriftFinding | undefined {
    if (hasTemplate(contractFile)) return undefined;
    const base = path.basename(contractFile, JAY_CONTRACT_EXTENSION).toLowerCase();
    if (allowNoTemplate.has(contractName.toLowerCase()) || allowNoTemplate.has(base))
        return undefined;
    return {
        message:
            `Component "${contractName}" ships no .jay-html template. If it renders UI, create a reusable ` +
            `design-system template so consumers flatten it (template= + jay-stack sync) instead of ` +
            `hand-authoring each usage.`,
        suggestion:
            `Author a ${base}.jay-html next to the contract. If this component is intentionally UI-less ` +
            `(data/logic only), suppress project-wide with allow-no-template: ["${contractName}"] in ` +
            `<script type="application/jay-validations">. See agent-kit/designer/design-system-guide.md.`,
    };
}

/**
 * DL#200 — `NO-DESIGN-SYSTEM` (warning, project summary, once). After the per-file pass, if the whole project
 * flattens zero design-system elements (no import carries `template=`), nudge adoption. Two messages: one when
 * regions exist but none are linked, one when there are no regions at all. Suppress project-wide with
 * `allow-no-design-system: true`.
 *
 * @internal Exported for testing
 */
export function checkNoDesignSystem(
    regionsSeen: number,
    templateImportsSeen: number,
    suppressed: boolean,
): RegionDriftFinding | undefined {
    if (suppressed || templateImportsSeen > 0) return undefined;
    if (regionsSeen > 0) {
        return {
            message:
                'This project composes components but none are design-system elements (no template= imports). ' +
                'Ship a .jay-html template with a reused component and flatten it so pages share consistent, ' +
                'upgradable UI.',
            suggestion:
                'Add template= to a headless import and run `jay-stack sync`. Suppress project-wide with ' +
                'allow-no-design-system: true in <script type="application/jay-validations">. ' +
                'See agent-kit/designer/design-system-guide.md.',
        };
    }
    return {
        message:
            'This project shares no UI through design-system elements. Consider composing reusable sections ' +
            'as components with .jay-html templates — regions can be used without code, purely to flatten and ' +
            'share a design system.',
        suggestion:
            'See agent-kit/designer/design-system-guide.md. Suppress project-wide with ' +
            'allow-no-design-system: true in <script type="application/jay-validations">.',
    };
}

/** The declarations inside a `@scope (…) [to (…)] { … }` block (its body), normalized for comparison. */
function scopeBody(block: string): string {
    return block
        .replace(/^@scope\s*\([^)]*\)(?:\s*to\s*\([^)]*\))?\s*\{/, '')
        .replace(/\}\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * DL#196 §5 — detect a template-inclusion cycle among design-system regions.
 *
 * A materialised region whose source template transitively contains its own `<jay:X>` would flatten
 * forever. `materialise`'s `fillRegions` already guards this with a per-branch stack, emitting
 * `template inclusion cycle: …` errors; here we run it as a dry-run over the page and lift those cycle
 * errors to hard validation errors. Other materialise errors (an unreadable template) are already
 * surfaced by `checkRegionDrift`, so only cycle errors are lifted.
 *
 * @internal Exported for testing
 */
export function checkRegionRecursion(
    pageHtml: string,
    pageDir: string,
    jayHtml: JayHtmlSourceFile,
    readFile: (absPath: string) => string | undefined,
): string[] {
    if (!jayHtml.headlessImports.some((imp) => imp.template)) return [];
    const { errors } = materialise(pageHtml, buildMaterialiseOptions(pageDir, jayHtml, readFile));
    return errors.filter((e) => e.startsWith('template inclusion cycle'));
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

                // Check binding phase compatibility (DL#152) and prop value/type (DL#192)
                if (contract.props) {
                    const lowerAttrs: Record<string, string> = {};
                    for (const [k, v] of Object.entries(attrs)) {
                        lowerAttrs[k.toLowerCase()] = v;
                    }
                    for (const contractProp of contract.props) {
                        const attrValue = lowerAttrs[contractProp.name.toLowerCase()];
                        if (attrValue === undefined) continue;

                        const propType = contractProp.dataType;
                        const bindingMatch = attrValue.match(/^\{(.+)\}$/);

                        // Static (bare literal) value — no binding braces at all (DL#192 Q6).
                        // Only validate values that are a pure literal; skip mixed/expression
                        // values that embed a "{...}" fragment.
                        if (!bindingMatch) {
                            if (attrValue.includes('{')) continue;
                            if (propType && isEnumType(propType)) {
                                if (!propType.values.includes(attrValue)) {
                                    warnings.push(
                                        `<jay:${contractName}> prop "${contractProp.name}" = "${attrValue}" ` +
                                            `is not a declared value of enum(${propType.values.join(' | ')}). ` +
                                            `Use one of: ${propType.values.join(', ')}.`,
                                    );
                                }
                            }
                            continue;
                        }

                        const bindingPath = bindingMatch[1];

                        // Binding type compatibility (DL#192): the source tag's declared type
                        // must match the prop type. Enums compare by ordered members (see
                        // equalJayTypes), so field-derived enum names never cause false rejects.
                        const sourceType = resolveBindingDataType(bindingPath, jayHtml);
                        if (propType && sourceType && !equalJayTypes(propType, sourceType)) {
                            warnings.push(
                                `<jay:${contractName}> prop "${contractProp.name}" (${typeLabel(propType)}) ` +
                                    `is bound to {${bindingPath}} (${typeLabel(sourceType)}). ` +
                                    `The binding source type must match the prop type.`,
                            );
                        }

                        const sourcePhase = resolveBindingPhase(bindingPath, jayHtml);
                        if (!sourcePhase) continue;

                        // DL#189 — for a no-code structural passthrough region (DL#196) props ≡ tags:
                        // the props section carries no phase (the parser defaults it to slow),
                        // so the effective prop phase is the matching tag's phase. Using the tag
                        // phase avoids wrongly flagging a valid fast/fast+interactive structural passthrough
                        // binding as a slow-only prop. For a code-backed (non-structural) import,
                        // props and tags are distinct — keep the prop's own declared phase.
                        const propPhase = imp.structural
                            ? (resolveContractTag(contract, contractProp.name)?.phase ??
                              contractProp.phase ??
                              'slow')
                            : (contractProp.phase ?? 'slow');
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
                    // DL#179: tools handlers (validators) load only from the `./tools` entry,
                    // which may depend on the compiler. The serve entry (`.`) stays compiler-free.
                    handlerModule = await import(`${plugin.packageName}/tools`);
                }

                validatorFn = plugin.isLocal
                    ? (handlerModule.validate ?? handlerModule.default)
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
                    validationOverrides: parsed.validationOverrides,
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
    const projectRoot = options.projectRoot ?? process.cwd();
    const config = loadConfig(projectRoot);
    const resolvedConfig = getConfigWithDefaults(config);

    // Use provided path or default to pagesBase from config
    const scanDir = options.path
        ? path.resolve(options.path)
        : path.resolve(resolvedConfig.devServer.pagesBase);
    const componentsDir = path.resolve(resolvedConfig.devServer.componentsBase);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const coverage: FileCoverage[] = [];
    const parsedFiles: Array<{ relativePath: string; parsed: JayHtmlSourceFile }> = [];
    // DL#200 — project-wide tallies for NO-DESIGN-SYSTEM.
    let regionsSeen = 0;
    let templateImportsSeen = 0;
    // DL#207 — report-only design-system scorecard accumulators.
    const designSystemCoverage: DesignSystemCoverage[] = [];
    // Project-wide reuse, keyed by the region's resolved (absolute) template path.
    const reuseByTemplate = new Map<string, number>();
    // The catalogued template universe (M): contracts shipped under the components tree, plus any contract
    // a page imports with template= — so the catalog is complete even if the components root isn't co-located
    // with cwd (e.g. in tests). Deduped to absolute template paths after the scan.
    const cataloguedContractFiles = new Set<string>();

    // Find all jay files (pages + components)
    const pageJayHtmlFiles = await findJayFiles(scanDir);
    const componentJayHtmlFiles = await findJayFiles(componentsDir).catch(() => [] as string[]);
    const jayHtmlFiles = [...pageJayHtmlFiles, ...componentJayHtmlFiles];
    // DL#200 — component source templates (a DL#196 composite like section/gallery/card) hand-author their
    // child `<jay:X>` regions with contract-only imports by design: they are the flatten *source*, and the
    // transitive `template=` always lives on the consuming page, never in the component template. So
    // REGION-NOT-LINKED is scoped to pages — firing it on component sources would warn on every nested
    // design-system component, which is exactly the authoring pattern we want.
    const componentJayHtmlFileSet = new Set(componentJayHtmlFiles);
    const componentContractFiles = await findContractFiles(componentsDir).catch(
        () => [] as string[],
    );
    // DL#207 — every component under the components tree is part of the catalogued template universe.
    for (const cf of componentContractFiles) cataloguedContractFiles.add(cf);
    const contractFiles = [...(await findContractFiles(scanDir)), ...componentContractFiles];
    // DL#200 — parsed contract names by file (for COMPONENT-NO-TEMPLATE messaging/suppression).
    const contractNameByFile = new Map<string, string>();

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
            if (result.val?.name) contractNameByFile.set(contractFile, result.val.name);

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

            // Check for removed jay-params (DL#156) — it is silently ignored by the
            // route scanner, so treat it as an error rather than a warning.
            if (content.includes('application/jay-params')) {
                errors.push({
                    file: relativePath,
                    message:
                        '<script type="application/jay-params"> is no longer supported and is ignored. ' +
                        'Move the values into the YAML body of the headless component that uses them. ' +
                        'See agent-kit/developer/routing.md for details.',
                    stage: 'parse',
                });
            }

            // Check page.ts exports the expected component
            const pageExportError = checkPageComponentExport(jayFile);
            if (pageExportError) {
                errors.push({
                    file: relativePath,
                    message: pageExportError,
                    stage: 'generate',
                });
            }

            // Check page.ts for direct document access
            const domWarnings = checkDirectDocumentAccess(jayFile);
            for (const msg of domWarnings) {
                warnings.push({ file: relativePath, message: msg });
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
            const headlessPropResults = checkHeadlessInstanceProps(parsedFile.val!, relativePath);
            for (const msg of headlessPropResults) {
                if (
                    msg.includes('is missing required prop') ||
                    msg.includes('source phase must be') ||
                    msg.includes('is not a declared value of enum') ||
                    msg.includes('binding source type must match')
                ) {
                    errors.push({ file: relativePath, message: msg, stage: 'generate' });
                } else {
                    warnings.push({ file: relativePath, message: msg });
                }
            }

            // Check flattened region bodies against their source templates (DL#196 drift validation)
            const readTemplateRel = (templatePath: string): string | undefined => {
                try {
                    return fs.readFileSync(path.resolve(dirname, templatePath), 'utf-8');
                } catch {
                    return undefined;
                }
            };
            const driftWarnings = checkRegionDrift(parsedFile.val!, readTemplateRel);
            for (const finding of driftWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            // Check flattened region CSS against source template CSS (DL#196 §4 CSS drift)
            const cssDriftWarnings = checkRegionCssDrift(parsedFile.val!, readTemplateRel);
            for (const finding of cssDriftWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            // Check that region CSS is in canonical coalesced form (DL#196 §4/§5 — validate-clean ⇔ sync-clean)
            const cssScopingWarnings = checkRegionCssScoping(parsedFile.val!);
            for (const finding of cssScopingWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            // DL#203 — every nested region under a CSS-shipping (scoped) region must have a ref so the parent's
            // @scope donut can name it as a `to (…)` boundary and isolate it from the parent's styles.
            const nestedRefWarnings = checkNestedRegionRefs(parsedFile.val!, readTemplateRel);
            for (const finding of nestedRefWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            // DL#209 — REGION-CSS-NO-REF (error): a region flattening a CSS-shipping template with no ref=
            // loses its CSS on sync (unscoped CSS is never carried back). Error, not warning: it silently
            // deletes authored styling. The fix is to add a ref so the CSS can be scoped and survive.
            const cssNoRefErrors = checkRegionCssNoRef(parsedFile.val!, readTemplateRel);
            for (const finding of cssNoRefErrors) {
                errors.push({
                    file: relativePath,
                    message: finding.message,
                    stage: 'generate',
                    suggestion: finding.suggestion,
                });
            }

            // DL#200 — prefer design-system elements: nudge hand-authored regions that could be linked, and
            // linked regions drifting into their own variant. Also tally for the project NO-DESIGN-SYSTEM rule.
            regionsSeen += collectRegionElements(parsedFile.val!.body).length;
            templateImportsSeen += parsedFile.val!.headlessImports.filter(
                (imp) => imp.template,
            ).length;

            // DL#207 — report-only design-system scorecard. Coverage is page-scoped (matching where DL#200's
            // region warnings run); components are the design-system *source*, so scoring their internal
            // coverage would be circular. Reuse is accumulated project-wide from the same page regions.
            if (!componentJayHtmlFileSet.has(jayFile)) {
                const body = parsedFile.val!.body;
                const total = body.querySelectorAll('*').length;
                // Count only top-level regions' element subtrees; a Set keyed by node identity dedupes a
                // nested region that sits inside a top-level region so it is never double-counted.
                const coveredNodes = new Set<HTMLElement>();
                for (const region of directChildRegions(body)) {
                    const contractName = regionContractName(region);
                    const imp = parsedFile.val!.headlessImports.find(
                        (i) => i.contractName === contractName,
                    );
                    if (!imp?.template) continue; // only template=-backed regions are design-system coverage
                    coveredNodes.add(region); // the region element itself
                    for (const descendant of region.querySelectorAll('*')) {
                        coveredNodes.add(descendant);
                    }
                    // Reuse: resolve the region's template to an absolute path (page-relative, like the
                    // drift readers) and tally; same-page repeats count as real reuse (a carousel of cards).
                    const templateAbs = path.resolve(dirname, imp.template);
                    reuseByTemplate.set(templateAbs, (reuseByTemplate.get(templateAbs) ?? 0) + 1);
                    if (imp.contractPath) cataloguedContractFiles.add(imp.contractPath);
                }
                const covered = coveredNodes.size;
                designSystemCoverage.push({
                    file: relativePath,
                    coveragePct: total ? covered / total : 0,
                    covered,
                    total,
                });
            }

            // REGION-NOT-LINKED is page-scoped: component source templates legitimately hand-author their
            // child regions (see componentJayHtmlFileSet above), so skip them here.
            const notLinkedWarnings = componentJayHtmlFileSet.has(jayFile)
                ? []
                : checkRegionNotLinked(parsedFile.val!, (imp) =>
                      listTemplatesForContractFile(imp.contractPath).map((t) => ({
                          ...t,
                          path: './' + path.relative(projectRoot, t.path).replace(/\\/g, '/'),
                      })),
                  );
            for (const finding of notLinkedWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            const overrideWarnings = checkRegionOverrideNonContent(
                parsedFile.val!,
                readTemplateRel,
            );
            for (const finding of overrideWarnings) {
                warnings.push({
                    file: relativePath,
                    message: finding.message,
                    suggestion: finding.suggestion,
                });
            }

            // Detect template-inclusion cycles among design-system regions (DL#196 §5) — hard errors
            const recursionErrors = checkRegionRecursion(
                content,
                dirname,
                parsedFile.val!,
                (absPath) => {
                    try {
                        return fs.readFileSync(absPath, 'utf-8');
                    } catch {
                        return undefined;
                    }
                },
            );
            for (const msg of recursionErrors) {
                errors.push({ file: relativePath, message: msg, stage: 'generate' });
            }

            // Analyze tag coverage for headless imports
            const fileCoverage = analyzeTagCoverage(parsedFile.val!, relativePath);
            if (fileCoverage) {
                coverage.push(fileCoverage);
                const allowedUnused =
                    parsedFile.val!.validationOverrides?.['jay-stack']?.['allow-unused-tags'];
                const allowedSet = new Set(Array.isArray(allowedUnused) ? allowedUnused : []);
                for (const contract of fileCoverage.contracts) {
                    for (const tag of contract.requiredUnusedTags) {
                        const qualifiedTag = contract.key ? `${contract.key}.${tag}` : tag;
                        if (allowedSet.has(qualifiedTag) || allowedSet.has(tag)) continue;
                        const label = contract.key
                            ? `${contract.key} (${contract.contractName})`
                            : contract.contractName;
                        warnings.push({
                            file: relativePath,
                            message:
                                `Required tag "${tag}" from contract "${label}" is not used in the template. ` +
                                `Suppress with jay-stack: { allow-unused-tags: ["${qualifiedTag}"] } in <script type="application/jay-validations">. ` +
                                `See agent-kit/designer/validation-guide.md`,
                        });
                    }
                }
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

    // --- Project-level validations (DL#175) ---
    const robotsTxtPath = path.resolve(projectRoot, 'public/robots.txt');
    if (!fs.existsSync(robotsTxtPath)) {
        warnings.push({
            file: 'public/robots.txt',
            message:
                "public/robots.txt not found — search engines may crawl pages you don't intend to expose.",
            suggestion:
                'Create public/robots.txt with: User-agent: *\nAllow: /\nSitemap: https://your-domain.com/sitemap.xml',
        });
    }

    if (!config.site?.baseUrl) {
        warnings.push({
            file: '.jay',
            message:
                'site.baseUrl not configured — sitemap.xml will not be generated in production.',
            suggestion: 'Add to .jay config:\n  site:\n    baseUrl: https://your-domain.com',
        });
    }

    // --- DL#200 — prefer design-system elements (project-level rules) ---
    // Project-wide suppression lists are read from any page's `application/jay-validations` script.
    const allowNoTemplate = new Set<string>();
    let allowNoDesignSystem = false;
    for (const { parsed } of parsedFiles) {
        const overrides = parsed.validationOverrides?.['jay-stack'];
        if (!overrides) continue;
        const list = overrides['allow-no-template'];
        if (Array.isArray(list))
            for (const name of list) allowNoTemplate.add(String(name).toLowerCase());
        if (overrides['allow-no-design-system'] === true) allowNoDesignSystem = true;
    }

    // COMPONENT-NO-TEMPLATE — a component under the components tree that ships no .jay-html template.
    for (const contractFile of componentContractFiles) {
        const contractName =
            contractNameByFile.get(contractFile) ??
            path.basename(contractFile, JAY_CONTRACT_EXTENSION);
        const finding = checkComponentNoTemplate(
            contractFile,
            contractName,
            hasTemplateForContractFile,
            allowNoTemplate,
        );
        if (finding) {
            warnings.push({
                file: path.relative(projectRoot, contractFile),
                message: finding.message,
                suggestion: finding.suggestion,
            });
        }
    }

    // NO-DESIGN-SYSTEM — project has zero design-system elements (emitted once).
    const noDesignSystem = checkNoDesignSystem(
        regionsSeen,
        templateImportsSeen,
        allowNoDesignSystem,
    );
    if (noDesignSystem) {
        warnings.push({
            file: '.jay',
            message: noDesignSystem.message,
            suggestion: noDesignSystem.suggestion,
        });
    }

    // --- DL#207 — design-system reuse summary (report-only) ---
    // M = the catalogued template universe: every template variant shipped by a known component.
    const cataloguedTemplatePaths = new Set<string>();
    for (const contractFile of cataloguedContractFiles) {
        for (const t of listTemplatesForContractFile(contractFile)) {
            cataloguedTemplatePaths.add(path.resolve(t.path));
        }
    }
    const rel = (p: string): string => './' + path.relative(projectRoot, p).replace(/\\/g, '/');
    const perTemplate: Record<string, number> = {};
    for (const [abs, count] of reuseByTemplate) perTemplate[rel(abs)] = count;
    const designSystemReuse: DesignSystemReuse = {
        perTemplate,
        catalogued: cataloguedTemplatePaths.size,
        reusedMoreThanOnce: [...reuseByTemplate.values()].filter((n) => n >= 2).length,
        reusedOfCatalogued: [...cataloguedTemplatePaths].filter(
            (p) => (reuseByTemplate.get(p) ?? 0) >= 2,
        ).length,
    };

    // --- DL#210 — Check 1: broken internal links (static routes + public assets) ---
    const linkOracle = await buildRouteOracle(scanDir);
    const assetUrls = await collectPublicAssets(
        path.resolve(projectRoot, resolvedConfig.devServer.publicFolder),
    );
    const linkFindings = checkInternalLinks({
        parsedFiles,
        oracle: linkOracle,
        assetUrls,
        baseUrl: config.site?.baseUrl,
        projectRoot,
    });
    for (const finding of linkFindings) {
        errors.push({
            file: finding.file,
            message: finding.message,
            stage: 'generate',
            source: 'internal-links',
            suggestion: finding.suggestion,
        });
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
        designSystemCoverage,
        designSystemReuse,
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

    // --- Report-only metrics: tag coverage + design-system scorecard (DL#207) ---
    // Never affect the exit code. Regular mode prints one-line totals; `-v` expands the per-page
    // (and per-contract) breakdown.
    const { designSystemCoverage, designSystemReuse } = result;
    const reuseTemplates = Object.keys(designSystemReuse.perTemplate);
    const hasTagCoverage = result.coverage.length > 0;
    const hasScorecard = designSystemCoverage.length > 0 || reuseTemplates.length > 0;

    // Tag-coverage totals across all pages/contracts.
    let totalUsedTags = 0;
    let totalTags = 0;
    for (const fileCov of result.coverage) {
        for (const contract of fileCov.contracts) {
            totalUsedTags += contract.usedTags;
            totalTags += contract.totalTags;
        }
    }

    // Design-system coverage totals across all pages.
    let totalCovered = 0;
    let totalElements = 0;
    for (const cov of designSystemCoverage) {
        totalCovered += cov.covered;
        totalElements += cov.total;
    }

    if (options.verbose) {
        if (hasTagCoverage) {
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
                }
            }
        }

        if (hasScorecard) {
            logger.important('');
            logger.important(chalk.bold('📊 Design-system scorecard'));
            for (const cov of designSystemCoverage) {
                const pct = Math.round(cov.coveragePct * 100);
                // Informational only — flags a page that is mostly hand-authored markup; no effect on exit code.
                const lowFlag = pct < 50 ? chalk.yellow('  ⚠ low') : '';
                logger.important(
                    chalk.gray(
                        `   Coverage: ${cov.file}  ${pct}%  (${cov.covered}/${cov.total} elements)`,
                    ) + lowFlag,
                );
            }
            if (reuseTemplates.length > 0) {
                const parts = reuseTemplates.map((t) => {
                    const n = designSystemReuse.perTemplate[t];
                    return n < 2 ? `${t} ×${n}${chalk.yellow(' ⚠ single-use')}` : `${t} ×${n}`;
                });
                logger.important(chalk.gray(`   Reuse: ${parts.join('   ')}`));
            }
            logger.important(
                chalk.gray(
                    `   ${designSystemReuse.reusedOfCatalogued} of ${designSystemReuse.catalogued} ` +
                        `catalogued templates reused > 1`,
                ),
            );
        }
    } else if (hasTagCoverage || hasScorecard) {
        logger.important('');
        if (hasTagCoverage) {
            const pct = totalTags ? Math.round((totalUsedTags / totalTags) * 100) : 0;
            logger.important(
                chalk.bold('📦 Tag coverage: ') +
                    `${pct}% (${totalUsedTags}/${totalTags} tags used across ${result.coverage.length} page(s))`,
            );
        }
        if (hasScorecard) {
            const pct = totalElements ? Math.round((totalCovered / totalElements) * 100) : 0;
            const lowFlag = pct < 50 ? chalk.yellow('  ⚠ low') : '';
            logger.important(
                chalk.bold('📊 Design-system scorecard: ') +
                    `${pct}% element coverage (${totalCovered}/${totalElements}), ` +
                    `${designSystemReuse.reusedOfCatalogued} of ${designSystemReuse.catalogued} ` +
                    `catalogued templates reused > 1` +
                    lowFlag,
            );
        }
        logger.important(chalk.gray('   Run validate -v for per-page details.'));
    }

    // --- Summary ---
    logger.important('');
    if (result.valid && result.warnings.length === 0) {
        logger.important(chalk.green('Validation passed.'));
    } else if (result.valid) {
        logger.important(
            chalk.yellow(
                `Validation passed with ${result.warnings.length} warning(s). Warnings must be fixed or explicitly suppressed — do not ignore them.`,
            ),
        );
    } else {
        logger.important(
            chalk.red(
                `Validation failed — ${result.errors.length} error(s)` +
                    (result.warnings.length > 0
                        ? `, ${result.warnings.length} warning(s). Errors must be fixed. Warnings must be fixed or explicitly suppressed.`
                        : '.'),
            ),
        );
    }

    const totalIssues = result.errors.length + result.warnings.length;
    if (totalIssues > 0) {
        logger.important(
            chalk.gray(
                '\nSee: agent-kit/designer/validation-guide.md for how to interpret and suppress warnings.',
            ),
        );
    }
}
