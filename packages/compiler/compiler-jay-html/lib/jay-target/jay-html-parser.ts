import { HTMLElement, parse } from 'node-html-parser';
import {
    JayComponentType,
    JayValidations,
    mkRefsTree,
    WithValidations,
    type JayHtmlHeadMeta,
    type TemplatePart,
} from '@jay-framework/compiler-shared';
import yaml from 'js-yaml';
import { capitalCase, paramCase, pascalCase } from 'change-case';
import { camelCase } from '../case-utils';
import pluralize from 'pluralize';
import {
    parseEnumValues,
    parseImportNames,
    parseIsEnum,
    parseTemplateParts,
} from '../expressions/expression-compiler';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import {
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayObjectType,
    JayRecursiveType,
    JayType,
    JayUnknown,
    resolvePrimitiveType,
    JayPromiseType,
} from '@jay-framework/compiler-shared';
import { SourceFileFormat } from '@jay-framework/compiler-shared';
import { JayImportLink, JayImportName } from '@jay-framework/compiler-shared';
import { JayYamlStructure } from './jay-yaml-structure';
import { Contract, ContractTag, RenderingPhase } from '../contract';

import {
    JayHeadlessImports,
    JayHtmlNamespace,
    JayHtmlSourceFile,
    JayHtmlHeadLink,
} from './jay-html-source-file';
import type { JayHtmlScript } from './jay-html-source-file';

import { JayImportResolver } from './jay-import-resolver';
import { contractToImportsViewStateAndRefs, EnumToImport } from '../contract';

export function isObjectType(obj) {
    return typeof obj === 'object' && !Array.isArray(obj);
}

export function isArrayType(obj: any) {
    return Array.isArray(obj);
}

export function toInterfaceName(name: string[]) {
    return name
        .reverse()
        .map((segment) => pascalCase(pluralize.singular(segment)))
        .join('Of');
}

function resolveImportedType(imports: JayImportName[], type: string): JayType {
    let importedSymbols = imports.find((_) => (_.as ? _.as === type : _.name === type));
    if (importedSymbols) {
        return importedSymbols.type;
    } else return JayUnknown;
}

/** Deduplicate enums by (declaringModule, type.name) — keeps the first occurrence of each. */
function deduplicateEnums(enums: EnumToImport[]): EnumToImport[] {
    const seen = new Set<string>();
    return enums.filter((e) => {
        const key = `${e.declaringModule}::${e.type.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Resolve cross-contract enum name collisions by aliasing duplicates.
 * When two enums from different modules share the same name, subsequent occurrences
 * get aliased (e.g., OptionRenderType$1) so imports don't shadow each other.
 * Always alias across different modules — even same values in different order would
 * produce different numeric indices at runtime.
 */
function resolveEnumCollisions(allHeadlessImports: JayHeadlessImports[]): void {
    // Collect all enum import names across all headless imports
    const enumsByName = new Map<string, Array<{ importName: JayImportName; module: string }>>();

    for (const headless of allHeadlessImports) {
        for (const link of headless.contractLinks) {
            for (const importName of link.names) {
                if (importName.type instanceof JayEnumType) {
                    const entries = enumsByName.get(importName.type.name) || [];
                    entries.push({ importName, module: link.module });
                    enumsByName.set(importName.type.name, entries);
                }
            }
        }
    }

    // For each name group with collisions, alias subsequent entries from different modules
    for (const [, entries] of enumsByName) {
        if (entries.length <= 1) continue;

        let counter = 0;
        const firstEntry = entries[0];

        for (let i = 1; i < entries.length; i++) {
            const entry = entries[i];
            const entryEnum = entry.importName.type as JayEnumType;

            // Same module — no collision possible (deduplication handles this)
            if (entry.module === firstEntry.module) continue;

            // Different module — always alias to avoid shadowing
            counter++;
            const alias = `${entryEnum.name}$${counter}`;
            entryEnum.alias = alias;
            entry.importName.as = alias;
        }
    }
}

/**
 * Checks if a type string is a recursive reference (starts with "$/" like "$/data")
 */
function isRecursiveReference(typeString: string): boolean {
    return typeof typeString === 'string' && typeString.startsWith('$/');
}

/**
 * Collects all nested object type names from a JayType tree.
 * This is used to gather all types that need to be imported from a contract.
 */
function collectNestedTypeNames(type: JayType): string[] {
    const names: string[] = [];

    if (type instanceof JayObjectType) {
        names.push(type.name);
        for (const propType of Object.values(type.props)) {
            names.push(...collectNestedTypeNames(propType));
        }
    } else if (type instanceof JayArrayType) {
        names.push(...collectNestedTypeNames(type.itemType));
    } else if (type instanceof JayPromiseType) {
        names.push(...collectNestedTypeNames(type.itemType));
    } else if (type instanceof JayImportedType) {
        // Don't recurse into imported types - they have their own imports
    }

    return names;
}

/**
 * Parses array<$/...> syntax to extract the recursive reference
 * Returns the reference path if valid, null otherwise
 */
function parseArrayRecursiveReference(typeString: string): string | null {
    if (typeof typeString !== 'string') return null;

    const match = typeString.match(/^array<(\$\/.*)>$/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

/**
 * Validates a recursive reference path against the root data structure
 * Returns an error message if invalid, undefined if valid
 */
function validateRecursivePath(referencePath: string, rootData: any): string | undefined {
    // Check if the path ends with [] (array item unwrapping syntax)
    const hasArrayUnwrap = referencePath.endsWith('[]');
    const pathToValidate = hasArrayUnwrap
        ? referencePath.substring(0, referencePath.length - 2)
        : referencePath;

    // Parse the reference path (e.g., "$/data" or "$/data/submenu/items")
    const parts = pathToValidate.split('/').filter((p) => p);

    if (parts.length === 0 || parts[0] !== '$') {
        return `Recursive reference must start with "$/" (got: ${referencePath}). Use "$/data" or "$/data/path" format.`;
    }

    // Remove the $ prefix
    const pathParts = parts.slice(1);

    if (pathParts.length === 0) {
        return `Recursive reference path is incomplete (got: ${referencePath}). Use "$/data" or "$/data/path" format.`;
    }

    // The first part must be 'data' (referencing the data structure)
    if (pathParts[0] !== 'data') {
        return `Recursive reference path must start with "$/data" (got: ${referencePath}). The reference should point to your data structure.`;
    }

    // If it's just "$/data", it's valid (references root)
    if (pathParts.length === 1) {
        return undefined;
    }

    // For nested paths like "$/data/submenu/items", validate the path exists in the data structure
    let currentData = rootData;
    const traversedPath = ['data'];
    for (let i = 1; i < pathParts.length; i++) {
        const part = pathParts[i];

        // If currentData is an array, we need to look inside the array's item type (first element)
        if (Array.isArray(currentData)) {
            if (currentData.length === 0) {
                return (
                    `Cannot navigate through empty array at path "$/` +
                    traversedPath.join('/') +
                    `"`
                );
            }
            currentData = currentData[0];
        }

        if (!currentData || typeof currentData !== 'object' || !(part in currentData)) {
            const availableKeys =
                currentData && typeof currentData === 'object' ? Object.keys(currentData) : [];
            return (
                `Property "${part}" not found at path "$/` +
                traversedPath.join('/') +
                `"` +
                (availableKeys.length > 0
                    ? `. Available properties: ${availableKeys.join(', ')}`
                    : '')
            );
        }
        currentData = currentData[part];
        traversedPath.push(part);
    }

    // If [] syntax is used, validate that the resolved path is actually an array
    if (hasArrayUnwrap && !Array.isArray(currentData)) {
        return (
            `Recursive reference with [] unwrap syntax must point to an array type, but "$/` +
            traversedPath.join('/') +
            `" is not an array.`
        );
    }

    return undefined;
}

function resolveType(
    data: any,
    validations: JayValidations,
    path: Array<string>,
    imports: JayImportName[],
    rootData?: any,
): JayObjectType {
    let types = {};
    for (let propKey in data) {
        // Check if this is an async property (starts with "async ")
        const isAsyncProp = propKey.startsWith('async ');
        const prop = isAsyncProp ? propKey.substring(6) : propKey; // Remove "async " prefix if present

        const checkAsync = (type: JayType): JayType =>
            isAsyncProp ? new JayPromiseType(type) : type;

        const resolvedPrimitive = resolvePrimitiveType(data[propKey]);
        if (resolvedPrimitive !== JayUnknown) {
            types[prop] = checkAsync(resolvedPrimitive);
        } else if (isArrayType(data[propKey])) {
            types[prop] = checkAsync(
                new JayArrayType(
                    resolveType(data[propKey][0], validations, [...path, prop], imports, rootData),
                ),
            );
        } else if (isObjectType(data[propKey])) {
            types[prop] = checkAsync(
                resolveType(data[propKey], validations, [...path, prop], imports, rootData),
            );
        } else if (resolveImportedType(imports, data[propKey]) !== JayUnknown) {
            types[prop] = checkAsync(resolveImportedType(imports, data[prop]));
        } else if (parseIsEnum(data[propKey])) {
            types[prop] = checkAsync(
                new JayEnumType(toInterfaceName([...path, prop]), parseEnumValues(data[prop])),
            );
        } else if (isRecursiveReference(data[propKey])) {
            // Handle direct recursive reference like "next: $/data"
            const referencePath = data[propKey];
            const validationError = validateRecursivePath(referencePath, rootData || data);
            if (validationError) {
                let [, ...pathTail] = path;
                validations.push(
                    `invalid recursive reference [${referencePath}] found at [${['data', ...pathTail, prop].join('.')}] - ${validationError}`,
                );
            } else {
                types[prop] = checkAsync(new JayRecursiveType(referencePath));
            }
        } else if (parseArrayRecursiveReference(data[propKey])) {
            // Handle array recursive reference like "children: array<$/data>"
            const referencePath = parseArrayRecursiveReference(data[propKey])!;
            const validationError = validateRecursivePath(referencePath, rootData || data);
            if (validationError) {
                let [, ...pathTail] = path;
                validations.push(
                    `invalid recursive reference [${referencePath}] found at [${['data', ...pathTail, prop].join('.')}] - ${validationError}`,
                );
            } else {
                types[prop] = checkAsync(new JayArrayType(new JayRecursiveType(referencePath)));
            }
        } else {
            let [, ...pathTail] = path;
            validations.push(
                `invalid type [${data[prop]}] found at [${['data', ...pathTail, prop].join('.')}]`,
            );
        }
    }
    return new JayObjectType(toInterfaceName(path), types);
}

/**
 * Resolves recursive type references by setting their resolvedType property
 * This must be called after the full type tree is built
 */
function resolveRecursiveReferences(
    type: JayType,
    rootType: JayObjectType,
    validations: JayValidations,
): void {
    if (type instanceof JayRecursiveType) {
        // Check if the path ends with [] (array item unwrapping syntax)
        const hasArrayUnwrap = type.referencePath.endsWith('[]');
        const pathToResolve = hasArrayUnwrap
            ? type.referencePath.substring(0, type.referencePath.length - 2)
            : type.referencePath;

        // Parse the reference path (e.g., "$/data" or "$/data/tree")
        const parts = pathToResolve.split('/').filter((p) => p);

        if (parts.length >= 2 && parts[0] === '$' && parts[1] === 'data') {
            // Start from root type
            let resolvedType: JayType = rootType;
            const traversedPath = ['$', 'data'];

            // Navigate through nested paths (if any)
            for (let i = 2; i < parts.length; i++) {
                const pathSegment = parts[i];

                if (resolvedType instanceof JayObjectType && pathSegment in resolvedType.props) {
                    resolvedType = resolvedType.props[pathSegment];
                    traversedPath.push(pathSegment);
                } else if (resolvedType instanceof JayArrayType) {
                    // If current type is array, navigate into its item type
                    if (
                        resolvedType.itemType instanceof JayObjectType &&
                        pathSegment in resolvedType.itemType.props
                    ) {
                        resolvedType = resolvedType.itemType.props[pathSegment];
                        traversedPath.push(pathSegment);
                    } else {
                        // Path not found in array item type
                        const availableProps =
                            resolvedType.itemType instanceof JayObjectType
                                ? Object.keys(resolvedType.itemType.props)
                                : [];
                        validations.push(
                            `Recursive reference "${type.referencePath}" failed: property "${pathSegment}" not found at path "${traversedPath.join('/')}"` +
                                (availableProps.length > 0
                                    ? `. Available properties: ${availableProps.join(', ')}`
                                    : '. The array item type has no properties.'),
                        );
                        return;
                    }
                } else {
                    // Path not found
                    const availableProps =
                        resolvedType instanceof JayObjectType
                            ? Object.keys(resolvedType.props)
                            : [];
                    validations.push(
                        `Recursive reference "${type.referencePath}" failed: property "${pathSegment}" not found at path "${traversedPath.join('/')}"` +
                            (availableProps.length > 0
                                ? `. Available properties: ${availableProps.join(', ')}`
                                : '. The current type has no properties.'),
                    );
                    return;
                }
            }

            // If [] syntax is used, unwrap the array
            if (hasArrayUnwrap && resolvedType instanceof JayArrayType) {
                resolvedType = resolvedType.itemType;
            }

            type.resolvedType = resolvedType;
        } else if (parts.length < 2 || parts[0] !== '$' || parts[1] !== 'data') {
            validations.push(
                `Invalid recursive reference "${type.referencePath}". Recursive references must start with "$/data" (e.g., "$/data" or "$/data/tree")`,
            );
        }
    } else if (type instanceof JayArrayType) {
        resolveRecursiveReferences(type.itemType, rootType, validations);
    } else if (type instanceof JayObjectType) {
        for (const propKey in type.props) {
            resolveRecursiveReferences(type.props[propKey], rootType, validations);
        }
    } else if (type instanceof JayPromiseType) {
        resolveRecursiveReferences(type.itemType, rootType, validations);
    }
    // Other types don't contain nested types that need resolution
}

async function parseTypes(
    jayYaml: JayYamlStructure,
    validations: JayValidations,
    baseElementName: string,
    imports: JayImportName[],
    headlessImports: JayHeadlessImports[],
    filePath: string,
    importResolver: JayImportResolver,
): Promise<JayType> {
    // Merge headless component types into the resolved type
    const mergeHeadlessTypes = (resolvedType: JayType): JayType => {
        // Only page-level headless imports (with key) contribute to the page's ViewState
        const headlessImportedTypes = Object.fromEntries(
            headlessImports
                .filter((_) => _.key)
                .map((_) => [_.key, new JayImportedType(_.rootType.name, _.rootType, true)]),
        );

        if (resolvedType instanceof JayObjectType) {
            const finalType = new JayObjectType(resolvedType.name, {
                ...headlessImportedTypes,
                ...resolvedType.props,
            });

            // Resolve recursive references now that we have the complete type tree
            resolveRecursiveReferences(finalType, finalType, validations);

            return finalType;
        }

        return resolvedType;
    };

    // Handle contract reference
    if (jayYaml.contractRef) {
        // Load the referenced contract
        // filePath is already the directory containing the HTML file
        const contractPath = path.resolve(filePath, jayYaml.contractRef);

        try {
            const contractResult = importResolver.loadContract(contractPath);

            // Add contract validations to our validations
            validations.push(...contractResult.validations);

            if (contractResult.val) {
                // Store the parsed contract for later use in type generation
                jayYaml.parsedContract = contractResult.val;

                // Extract ViewState type from contract using the existing converter
                const viewStateResult = await contractToImportsViewStateAndRefs(
                    contractResult.val,
                    contractPath,
                    importResolver,
                );

                validations.push(...viewStateResult.validations);

                if (viewStateResult.val && viewStateResult.val.type) {
                    // Rename the type to match the HTML element name
                    const contractType = viewStateResult.val.type;
                    let resolvedType: JayType;
                    if (contractType instanceof JayObjectType) {
                        resolvedType = new JayObjectType(
                            baseElementName + 'ViewState',
                            contractType.props,
                        );
                    } else {
                        resolvedType = contractType;
                    }

                    // Merge headless types and resolve recursive references
                    return mergeHeadlessTypes(resolvedType);
                } else {
                    validations.push(
                        `Failed to extract ViewState from contract ${jayYaml.contractRef}`,
                    );
                    return new JayObjectType(baseElementName + 'ViewState', {});
                }
            } else {
                validations.push(`Failed to load contract from ${jayYaml.contractRef}`);
                return new JayObjectType(baseElementName + 'ViewState', {});
            }
        } catch (error) {
            validations.push(
                `Referenced contract file not found: ${jayYaml.contractRef} - ${error.message}`,
            );
            return new JayObjectType(baseElementName + 'ViewState', {});
        }
    }

    // Handle inline data
    if (typeof jayYaml.data === 'object') {
        const resolvedType = resolveType(
            jayYaml.data,
            validations,
            [baseElementName + 'ViewState'],
            imports,
            jayYaml.data, // Pass root data for recursive reference validation
        );

        // Merge headless types and resolve recursive references
        return mergeHeadlessTypes(resolvedType);
    } else if (typeof jayYaml.data === 'string') return resolveImportedType(imports, jayYaml.data);
}

function parseNamespaces(root: HTMLElement): JayHtmlNamespace[] {
    const html = root.querySelector('html');
    if (html)
        return Object.keys(html.attributes)
            .filter((_) => _.startsWith('xmlns:'))
            .map((_) => ({ prefix: _.substring(6), namespace: html.attributes[_] }));
    else return [];
}

function parseYaml(root: HTMLElement): WithValidations<JayYamlStructure> {
    let validations = [];
    let jayYamlElements = root.querySelectorAll('[type="application/jay-data"]');
    if (jayYamlElements.length !== 1) {
        validations.push(
            jayYamlElements.length === 0
                ? `Missing <script type="application/jay-data">. ` +
                      `Add either inline data or a contract reference: ` +
                      `<script type="application/jay-data" contract="./component.jay-contract"></script>`
                : `Expected exactly one <script type="application/jay-data">, found ${jayYamlElements.length}`,
        );
        return new WithValidations(undefined, validations);
    }

    const jayYamlElement = jayYamlElements[0];
    const contractAttr = jayYamlElement.getAttribute('contract');
    const jayYamlText = jayYamlElement.text.trim();

    // Check for contract reference
    if (contractAttr) {
        // Validate that script body is empty when contract attribute is present
        if (jayYamlText && jayYamlText.length > 0) {
            validations.push(
                `Cannot have both 'contract' attribute and inline data structure. ` +
                    `Either reference a contract file or define data inline, not both.`,
            );
            return new WithValidations(undefined, validations);
        }

        // Return structure with contract reference
        return new WithValidations(
            {
                contractRef: contractAttr,
                imports: {},
                examples: undefined,
            },
            validations,
        );
    }

    // Parse inline data structure
    let jayYamlParsed = yaml.load(jayYamlText) as JayYamlStructure;
    jayYamlParsed.hasInlineData = true; // Mark as inline data
    return new WithValidations(jayYamlParsed, validations);
}

function parseHeadfullImports(
    elements: HTMLElement[],
    validations: JayValidations,
    filePath: string,
    options: ResolveTsConfigOptions,
    importResolver: JayImportResolver,
): JayImportLink[] {
    return elements.map((element) => {
        const module = element.getAttribute('src');
        const rawNames = element.getAttribute('names');
        const sandboxAttribute = element.getAttribute('sandbox');
        const sandbox =
            sandboxAttribute === '' || (Boolean(sandboxAttribute) && sandboxAttribute !== 'false');
        try {
            const importedFile = importResolver.resolveLink(filePath, module);
            const names = parseImportNames(rawNames);
            if (names.length === 0)
                validations.push(`import for module ${module} does not specify what to import`);

            const exportedTypes = importResolver.analyzeExportedTypes(importedFile, options);

            for (const name of names) {
                const exportedType = exportedTypes.find((_) => _.name === name.name);
                if (exportedType instanceof JayComponentType && exportedType.fullStack) {
                    validations.push(
                        `${name.name} from ${module} is a full-stack component (makeJayStackComponent). Create a .jay-contract file for the component and add a contract attribute to the import`,
                    );
                } else if (exportedType && exportedType !== JayUnknown)
                    name.type = new JayImportedType(name.as ? name.as : name.name, exportedType);
                else if (exportedType === JayUnknown)
                    validations.push(
                        `imported name ${name.name} from ${module} has an unsupported type`,
                    );
                else
                    validations.push(
                        `failed to find exported member ${name.name} type in module ${module}`,
                    );
            }
            return { module, names, sandbox };
        } catch (e) {
            validations.push(
                `failed to parse import names for module ${module} - ${e.message}${e.stack}`,
            );
            return { module, names: [] };
        }
    });
}

function dedentYaml(text: string): string {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return '';
    const minIndent = Math.min(...lines.map((l) => l.match(/^\s*/)?.[0].length ?? 0));
    return lines.map((l) => l.slice(minIndent)).join('\n');
}

async function parseHeadlessImports(
    elements: HTMLElement[],
    validations: Array<string>,
    filePath: string,
    importResolver: JayImportResolver,
    projectRoot: string,
    options: ResolveTsConfigOptions,
): Promise<JayHeadlessImports[]> {
    const result: JayHeadlessImports[] = [];

    for await (const element of elements) {
        const pluginAttr = element.getAttribute('plugin');
        const contractAttr = element.getAttribute('contract');
        const key = element.getAttribute('key');

        if (key && !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
            validations.push(
                `Headless component key="${key}" is not a valid identifier. ` +
                    `Use camelCase (e.g., key="${key.replace(/-([a-z])/g, (_, l) => l.toUpperCase())}").`,
            );
            continue;
        }

        // DL#196: a headless import resolves from a plugin (plugin=) or the local components
        // folder (no plugin=, file-path contract=). `src=` present ⇒ coded (resolve the single
        // exported component); absent ⇒ passthrough. `template=` records source provenance for
        // validate/sync re-flatten.
        const srcAttr = element.getAttribute('src') ?? undefined;
        const templateAttr = element.getAttribute('template') ?? undefined;
        // DL#200: per-region validation suppression — `jay-validations="RULE RULE"` on the import mutes
        // those rules for this region type only (space- or comma-separated, case-insensitive rule ids).
        const suppressedValidations = (element.getAttribute('jay-validations') ?? '')
            .split(/[\s,]+/)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);

        if (!contractAttr) {
            validations.push('headless import must specify contract attribute');
            continue;
        }

        // Parse YAML body as headless props (DL#156)
        let headlessProps: Record<string, string> | undefined;
        const propsText = dedentYaml(element.textContent ?? '');
        if (propsText) {
            try {
                const parsed = yaml.load(propsText);
                if (parsed && typeof parsed === 'object') {
                    headlessProps = {};
                    for (const [k, v] of Object.entries(parsed)) {
                        headlessProps[k] = String(v);
                    }
                }
            } catch (e) {
                validations.push(
                    `Failed to parse props YAML in <script type="application/jay-headless" contract="${contractAttr}">: ${(e as Error).message}`,
                );
            }
        }

        let loadedContract: Contract;
        let contractFile: string;
        let contractMetadata: Record<string, unknown> | undefined = undefined;
        let module: string;
        let name: string;
        let structural = false;
        // The `<jay:X>` region tag name this import backs. For a plugin, `contract=` is already the
        // (kebab) contract name; for a local component `contract=` is a file path, so derive the tag
        // name from the loaded contract's name (DL#196).
        let contractTagName: string = contractAttr;

        try {
            if (pluginAttr) {
                // Resolve plugin to actual paths using the resolver
                const resolveResult = importResolver.resolvePluginComponent(
                    pluginAttr,
                    contractAttr,
                    projectRoot,
                );
                validations.push(...resolveResult.validations);
                if (!resolveResult.val) {
                    // Resolution failed - validation messages already added above
                    continue;
                }

                const absoluteComponentPath = resolveResult.val.componentPath;
                name = resolveResult.val.componentName;
                const isNpmPackage = resolveResult.val.isNpmPackage;
                const packageName = resolveResult.val.packageName;

                // For NPM packages, use the package name; for local plugins, use relative path
                if (isNpmPackage && packageName) {
                    module = packageName; // e.g. "example-jay-mood-tracker-plugin"
                } else {
                    module = path.relative(filePath, absoluteComponentPath);
                    if (!module.startsWith('.')) module = './' + module;
                }

                // Load contract - resolver handles both static and dynamic (materialized) contracts
                const contractResult = importResolver.loadPluginContract(
                    pluginAttr,
                    contractAttr,
                    projectRoot,
                );
                validations.push(...contractResult.validations);
                if (!contractResult.val) {
                    continue;
                }
                loadedContract = contractResult.val.contract;
                contractFile = contractResult.val.contractPath;
                contractMetadata = contractResult.val.metadata;
            } else {
                // DL#196 — local (plugin-less) component from the components folder. `contract=` is a
                // file path; `src=` present ⇒ coded (resolve the single exported component); absent ⇒
                // passthrough (structural — the loader synthesizes makePassthroughInstanceComponent).
                const contractPath = path.resolve(filePath, contractAttr);
                const contractResult = importResolver.loadContract(contractPath);
                validations.push(...contractResult.validations);
                if (!contractResult.val) {
                    continue;
                }
                loadedContract = contractResult.val;
                contractFile = contractPath;

                if (srcAttr) {
                    const importedFile = importResolver.resolveLink(filePath, srcAttr);
                    const exportedComponents = importResolver
                        .analyzeExportedTypes(importedFile, options)
                        .filter((t): t is JayComponentType => t instanceof JayComponentType);
                    if (exportedComponents.length !== 1) {
                        validations.push(
                            `headless import src="${srcAttr}" must export exactly one Jay component (found ${exportedComponents.length})`,
                        );
                        continue;
                    }
                    name = exportedComponents[0].name;
                    module = path.relative(filePath, importedFile);
                    if (!module.startsWith('.')) module = './' + module;
                } else {
                    structural = true;
                    name = pascalCase(loadedContract.name);
                    module = '';
                }
                contractTagName = paramCase(loadedContract.name);
            }

            const contractTypes = await contractToImportsViewStateAndRefs(
                loadedContract,
                contractFile,
                importResolver,
            );

            contractTypes.map(({ type, refs: subContractRefsTree, enumsToImport }) => {
                const contractName = loadedContract.name;
                const refsTypeName = `${pascalCase(contractName)}Refs`;
                const repeatedRefsTypeName = `${pascalCase(contractName)}RepeatedRefs`;
                const refs = mkRefsTree(
                    subContractRefsTree.refs,
                    subContractRefsTree.children,
                    subContractRefsTree.repeated,
                    refsTypeName,
                    repeatedRefsTypeName,
                );

                // Relative import specifiers must start with ./ or ../, otherwise a same-dir
                // (or plugin-resolved) contract becomes a bare specifier the bundler can't resolve.
                const toRelativeModule = (to: string) => {
                    const relative = path.relative(filePath, to);
                    return relative.startsWith('.') ? relative : './' + relative;
                };

                const enumsToImportRelativeToJayHtml: EnumToImport[] = enumsToImport.map(
                    (enumsToImport) => ({
                        type: enumsToImport.type,
                        declaringModule: toRelativeModule(enumsToImport.declaringModule),
                    }),
                );

                // Make contract path relative to the jay-html file for imports
                const relativeContractPath = toRelativeModule(contractFile);

                const enumsFromContract = enumsToImportRelativeToJayHtml
                    .filter((_) => _.declaringModule === relativeContractPath)
                    .map((_) => _.type);

                // Collect all nested ViewState types from the contract
                // These are needed for forEach type annotations
                const nestedTypeNames = collectNestedTypeNames(type);
                // Filter to only include nested types (exclude the main ViewState which is already added)
                const nestedTypeImports = nestedTypeNames
                    .filter((name) => name !== type.name)
                    .map((name) => ({ name, type: JayUnknown }));

                const contractLink: JayImportLink = {
                    module: relativeContractPath,
                    names: [
                        { name: type.name, type },
                        { name: refsTypeName, type: JayUnknown },
                        ...nestedTypeImports,
                        ...enumsFromContract.map((_) => ({ name: _.name, type: _ })),
                    ],
                };

                const enumsFromOtherContracts = deduplicateEnums(
                    enumsToImportRelativeToJayHtml.filter(
                        (_) => _.declaringModule !== relativeContractPath,
                    ),
                );

                const enumImportLinks: JayImportLink[] = Object.entries(
                    enumsFromOtherContracts.reduce(
                        (acc, enumToImport) => {
                            const module = enumToImport.declaringModule;
                            if (!acc[module]) {
                                acc[module] = [];
                            }
                            acc[module].push(enumToImport);
                            return acc;
                        },
                        {} as Record<string, EnumToImport[]>,
                    ),
                ).map(([module, enums]) => ({
                    module,
                    names: enums.map((enumToImport) => ({
                        name: enumToImport.type.name,
                        type: enumToImport.type,
                    })),
                }));

                const contractLinks = [contractLink, ...enumImportLinks];
                const codeLink: JayImportLink = {
                    module,
                    names: [{ name, type: new JayComponentType(name, []) }],
                };
                result.push({
                    ...(key && { key }),
                    contractName: contractTagName,
                    refs,
                    rootType: type,
                    contractLinks,
                    codeLink,
                    contract: loadedContract,
                    contractPath: contractFile,
                    metadata: contractMetadata,
                    headlessProps,
                    ...(structural && { structural }),
                    ...(templateAttr && { template: templateAttr }),
                    ...(suppressedValidations.length && { suppressedValidations }),
                });
            });
        } catch (e) {
            validations.push(`failed to parse linked contract - ${e.message}${e.stack}`);
        }
    }
    return result;
}

function normalizeFilename(filename: string): string {
    return filename.replace('.jay-html', '');
}

function isLocalSrc(src: string): boolean {
    return (
        src.startsWith('./') ||
        src.startsWith('../') ||
        (!src.includes('://') && !src.startsWith('//'))
    );
}

function validateAndCollectScripts(
    root: HTMLElement,
    validations: JayValidations,
): JayHtmlScript[] {
    const scripts: JayHtmlScript[] = [];
    const allScripts = root.querySelectorAll('script');

    for (const script of allScripts) {
        const type = script.getAttribute('type');
        if (type?.startsWith('application/jay-')) continue;

        const jayScript = script.getAttribute('jay-script');
        const src = script.getAttribute('src');
        const inline = script.textContent?.trim();
        const isInHead = !!script.closest('head');

        if (src && isLocalSrc(src)) {
            validations.push(
                `Local script imports are not supported in jay-html. Move the script logic into page.ts with makeJayStackComponent. See designer/script-tags.md.`,
            );
            continue;
        }

        if (jayScript === 'allow') {
            const attributes = { ...script.attributes };
            delete attributes['jay-script'];
            delete attributes['src'];
            if (src) {
                scripts.push({ src, attributes, position: isInHead ? 'head' : 'body' });
            } else if (inline) {
                scripts.push({ inline, attributes, position: isInHead ? 'head' : 'body' });
            }
            continue;
        }

        if (src) {
            validations.push(
                `External scripts should be explicitly marked. If this script is required (e.g., analytics or tag manager), add jay-script="allow". Prefer page.ts for page behavior. See designer/script-tags.md.`,
            );
        } else if (inline) {
            validations.push(
                `Inline scripts are not supported in jay-html. Use page.ts with makeJayStackComponent for page behavior. If this is a third-party script that must be included as-is, add jay-script="allow". See designer/script-tags.md.`,
            );
        }
    }

    return scripts;
}

function parseHeadLinks(root: HTMLElement, excludeCssLinks: boolean = false): JayHtmlHeadLink[] {
    const allLinks = root.querySelectorAll('head link');
    return allLinks
        .filter((link) => {
            const rel = link.getAttribute('rel');
            // Exclude import links
            if (rel === 'import') return false;
            // Exclude CSS links if CSS extraction is enabled
            return !(excludeCssLinks && rel === 'stylesheet');
        })
        .map((link) => {
            const attributes = { ...link.attributes };
            const rel = attributes.rel || '';
            const href = attributes.href || '';

            // Remove rel and href from attributes since they're stored separately
            delete attributes.rel;
            delete attributes.href;

            return {
                rel,
                href,
                attributes,
            };
        });
}

function toParts(value: string): TemplatePart[] {
    try {
        return parseTemplateParts(value);
    } catch {
        return [{ kind: 'static', value }];
    }
}

function parseHeadMeta(root: HTMLElement): JayHtmlHeadMeta | undefined {
    const head = root.querySelector('head');
    if (!head) return undefined;

    const titleEl = head.querySelector('title');
    const titleText = titleEl?.textContent?.trim();
    const title = titleText ? toParts(titleText) : undefined;

    const meta: JayHtmlHeadMeta['meta'] = [];
    for (const el of head.querySelectorAll('meta')) {
        const content = el.getAttribute('content');
        if (content === undefined || content === null) continue;
        const name = el.getAttribute('name');
        const property = el.getAttribute('property');
        if (name || property) {
            meta.push({
                name: name || undefined,
                property: property || undefined,
                content: toParts(content),
            });
        }
    }

    const links: JayHtmlHeadMeta['links'] = [];
    for (const el of head.querySelectorAll('link')) {
        const rel = el.getAttribute('rel');
        if (!rel) continue;
        const hrefRaw = el.getAttribute('href') || '';
        const extraAttrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(el.attributes)) {
            if (k !== 'rel' && k !== 'href') extraAttrs[k] = v;
        }
        links.push({ rel, href: toParts(hrefRaw), ...extraAttrs });
    }

    return { title, meta, links };
}

function parseValidationOverrides(
    root: HTMLElement,
): Record<string, Record<string, boolean | string[]>> | undefined {
    const el = root.querySelector('script[type="application/jay-validations"]');
    if (!el) return undefined;
    const text = el.textContent?.trim();
    if (!text) return undefined;
    try {
        const parsed = yaml.load(text) as Record<string, unknown> | null;
        if (!parsed || typeof parsed !== 'object') return undefined;
        const result: Record<string, Record<string, boolean | string[]>> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (value && typeof value === 'object') {
                result[key] = value as Record<string, boolean | string[]>;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    } catch {
        return undefined;
    }
}

interface ExtractCssResult {
    css: string | undefined;
    linkedCssFiles: string[];
}

function resolveNestedCssImports(css: string, cssDir: string, visited?: Set<string>): string {
    if (!css.includes('@import')) return css;
    const seen = visited ?? new Set<string>();

    return css.replace(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?;?/g, (match, importPath) => {
        if (importPath.startsWith('http') || importPath.startsWith('//')) return match;
        const resolved = path.resolve(cssDir, importPath);
        if (seen.has(resolved)) return `/* circular import: ${importPath} */`;
        seen.add(resolved);
        try {
            const imported = fsSync.readFileSync(resolved, 'utf-8');
            return `/* @import ${importPath} */\n${resolveNestedCssImports(imported, path.dirname(resolved), seen)}`;
        } catch {
            return `/* @import not found: ${importPath} */`;
        }
    });
}

async function extractCss(
    root: HTMLElement,
    filePath: string,
    skipPaths?: Set<string>,
): Promise<WithValidations<ExtractCssResult>> {
    const cssParts: string[] = [];
    const validations: string[] = [];
    const linkedCssFiles: string[] = [];

    // Extract CSS from <link> tags with rel="stylesheet"
    const styleLinks = root.querySelectorAll('head link[rel="stylesheet"]');
    for (const link of styleLinks) {
        const href = link.getAttribute('href');
        if (href) {
            // Only attempt to read local files, not external URLs
            if (
                href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('//')
            ) {
                continue;
            }

            if (filePath) {
                const cssFilePath = path.resolve(filePath, href);
                linkedCssFiles.push(cssFilePath);

                if (skipPaths?.has(cssFilePath)) continue;

                try {
                    const cssContent = await fs.readFile(cssFilePath, 'utf-8');
                    const resolvedCss = resolveNestedCssImports(
                        cssContent,
                        path.dirname(cssFilePath),
                    );
                    cssParts.push(`/* External CSS: ${href} */\n${resolvedCss}`);
                } catch (error) {
                    validations.push(`CSS file not found or unreadable: ${href}`);
                }
            } else {
                cssParts.push(`/* External CSS: ${href} */`);
            }
        }
    }

    // Extract CSS from <style> tags in <head> only (body styles stay inline)
    const styleTags = root.querySelectorAll('head style');
    for (const style of styleTags) {
        const cssContent = style.text.trim();
        if (cssContent) {
            cssParts.push(cssContent);
        }
    }

    const css = cssParts.length > 0 ? cssParts.join('\n\n') : undefined;
    return new WithValidations({ css, linkedCssFiles }, validations);
}

/**
 * Extract trackBy information from contracts for use in deep merge algorithm.
 * Returns two maps:
 * - serverTrackByMap: for slow→fast merge (all tracked arrays)
 * - clientTrackByMap: for fast→interactive merge (excludes fast+interactive arrays)
 *
 * Arrays with phase 'fast+interactive' are dynamic and can be completely replaced
 * by interactive updates, so they don't need identity-based merging on the client.
 */
function detectCssNameCollisions(css: string, validations: string[]): void {
    const keyframeNames = new Set<string>();
    for (const match of css.matchAll(/@keyframes\s+(\S+)/g)) {
        const name = match[1];
        if (keyframeNames.has(name)) {
            validations.push(
                `@keyframes "${name}" is defined multiple times. Animation names are global — rename to avoid collisions.`,
            );
        }
        keyframeNames.add(name);
    }
    const fontFaceKeys = new Set<string>();
    for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const block = match[1];
        const familyMatch = block.match(/font-family\s*:\s*['"]?([^;'"\n}]+)/);
        if (!familyMatch) {
            continue;
        }
        const family = familyMatch[1].trim();
        const weightMatch = block.match(/font-weight\s*:\s*([^;\n}]+)/);
        const styleMatch = block.match(/font-style\s*:\s*([^;\n}]+)/);
        const weight = weightMatch ? weightMatch[1].trim() : 'normal';
        const style = styleMatch ? styleMatch[1].trim() : 'normal';
        const key = `${family}|${weight}|${style}`;
        if (fontFaceKeys.has(key)) {
            validations.push(
                `@font-face "${family}" (${weight}, ${style}) is defined multiple times. Font faces are global — rename to avoid collisions.`,
            );
        }
        fontFaceKeys.add(key);
    }
}

function extractTrackByMaps(
    pageContract: Contract | undefined,
    headlessImports: JayHeadlessImports[],
): { serverTrackByMap: Record<string, string>; clientTrackByMap: Record<string, string> } {
    const serverTrackByMap: Record<string, string> = {};
    const clientTrackByMap: Record<string, string> = {};

    function extractFromTags(
        tags: ContractTag[],
        basePath: string = '',
        parentPhase?: RenderingPhase,
    ) {
        for (const tag of tags) {
            const propertyName = camelCase(tag.tag);
            const currentPath = basePath ? `${basePath}.${propertyName}` : propertyName;
            const effectivePhase = tag.phase || parentPhase || 'slow';

            // If this is a repeated sub-contract with trackBy, record it
            if (tag.repeated && tag.trackBy) {
                const trackByField = camelCase(tag.trackBy);

                // Server always needs trackBy for slow→fast merge
                serverTrackByMap[currentPath] = trackByField;

                // Client only needs trackBy for non-interactive arrays
                // Arrays with 'fast+interactive' phase can be fully replaced by interactive
                if (effectivePhase !== 'fast+interactive') {
                    clientTrackByMap[currentPath] = trackByField;
                }
            }

            // Recurse into nested tags
            if (tag.tags) {
                extractFromTags(tag.tags, currentPath, effectivePhase);
            }
        }
    }

    // Extract from page contract
    if (pageContract) {
        extractFromTags(pageContract.tags);
    }

    // Extract from headless contracts (only page-level ones with key)
    for (const headless of headlessImports) {
        if (headless.contract && headless.key) {
            extractFromTags(headless.contract.tags, headless.key);
        }
    }

    return { serverTrackByMap, clientTrackByMap };
}

export async function parseJayFile(
    html: string,
    filename: string,
    filePath: string,
    options: ResolveTsConfigOptions,
    linkedContractResolver: JayImportResolver,
    projectRoot: string,
    /** Optional source directory for resolving headfull FS files (jay-html, contracts).
     *  When parsing pre-rendered files, filePath is in build/pre-rendered/ but headfull
     *  relative paths were written for the original source directory. Pass the source
     *  directory here so file resolution works correctly while module paths stay relative
     *  to the actual filePath. */
    sourceDir?: string,
): Promise<WithValidations<JayHtmlSourceFile>> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, { delimiter: '' });
    const root = parse(html);

    const namespaces = parseNamespaces(root);
    const { val: jayYaml, validations } = parseYaml(root);
    if (validations.length > 0) return new WithValidations(undefined, validations);

    // Only regular headfull imports (the `names=` form, no `contract=`) are supported. The legacy
    // `application/jay-headfull contract=` inlining path was removed (DL#196): a full-stack component
    // consumed by a page is now declared with `application/jay-headless` + a flattened `<jay:X>` region.
    const allHeadfullElements = root.querySelectorAll('script[type="application/jay-headfull"]');
    for (const el of allHeadfullElements) {
        if (el.getAttribute('contract')) {
            validations.push(
                `application/jay-headfull with a contract attribute is no longer supported (DL#196). ` +
                    `Declare the component with application/jay-headless and flatten it into a <jay:X> region ` +
                    `(run \`jay-stack sync\`).`,
            );
        }
    }
    const regularHeadfullElements = allHeadfullElements.filter(
        (el) => !el.getAttribute('contract'),
    );

    const headfullImports = parseHeadfullImports(
        regularHeadfullElements,
        validations,
        filePath,
        options,
        linkedContractResolver,
    );

    // Get body early
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations);
    }

    const headlessImports = await parseHeadlessImports(
        root.querySelectorAll('script[type="application/jay-headless"]'),
        validations,
        filePath,
        linkedContractResolver,
        projectRoot,
        options,
    );

    const allHeadlessImports = [...headlessImports];

    // Resolve cross-contract enum name collisions by aliasing duplicates
    resolveEnumCollisions(allHeadlessImports);

    const importNames = headfullImports.flatMap((_) => _.names);
    const types = await parseTypes(
        jayYaml,
        validations,
        baseElementName,
        importNames,
        allHeadlessImports,
        filePath,
        linkedContractResolver,
    );
    // Collect contract names that are used as <jay:xxx> instances in the template.
    // Only these need the codeLink import (for makeHeadlessInstanceComponent).
    // Key-based headless components without instances don't need it.
    const usedAsInstance = new Set(
        root
            .querySelectorAll('*')
            .filter((_) => _.tagName?.toLowerCase().startsWith('jay:'))
            .map((_) => _.tagName.toLowerCase().substring(4)),
    );
    const imports: JayImportLink[] = [
        ...headfullImports,
        ...allHeadlessImports.flatMap((_) => [
            ..._.contractLinks,
            ...(usedAsInstance.has(_.contractName) && !_.structural ? [_.codeLink] : []),
        ]),
    ];

    const cssResult = await extractCss(root, filePath);
    // Exclude CSS links from head links if CSS extraction is enabled (we have a file path)
    const excludeCssLinks = !!filePath;
    const headLinks = parseHeadLinks(root, excludeCssLinks);
    const headMeta = parseHeadMeta(root);
    const validationOverrides = parseValidationOverrides(root);
    const scripts = validateAndCollectScripts(root, validations);

    // Merge CSS validations with existing validations
    validations.push(...cssResult.validations);

    if (validations.length > 0) return new WithValidations(undefined, validations);

    let css = cssResult.val?.css;
    if (css) {
        detectCssNameCollisions(css, validations);
    }
    const allLinkedCssFiles = cssResult.val?.linkedCssFiles || [];
    const allLinkedComponentFiles: string[] = [];

    // Extract trackBy information from contracts for deep merge
    const { serverTrackByMap, clientTrackByMap } = extractTrackByMaps(
        jayYaml.parsedContract,
        allHeadlessImports,
    );

    return new WithValidations(
        {
            format: SourceFileFormat.JayHtml,
            types,
            imports,
            body,
            baseElementName,
            namespaces,
            headlessImports: allHeadlessImports,
            headLinks,
            css,
            linkedCssFiles: allLinkedCssFiles.length > 0 ? allLinkedCssFiles : undefined,
            linkedComponentFiles:
                allLinkedComponentFiles.length > 0 ? allLinkedComponentFiles : undefined,
            filename: normalizedFileName,
            contract: jayYaml.parsedContract,
            contractRef: jayYaml.contractRef,
            hasInlineData: jayYaml.hasInlineData,
            serverTrackByMap:
                Object.keys(serverTrackByMap).length > 0 ? serverTrackByMap : undefined,
            clientTrackByMap:
                Object.keys(clientTrackByMap).length > 0 ? clientTrackByMap : undefined,
            headMeta,
            validationOverrides,
            scripts: scripts.length > 0 ? scripts : undefined,
        } as JayHtmlSourceFile,
        validations,
    );
}

export function getJayHtmlImports(html: string): string[] {
    const root = parse(html);
    return root
        .querySelectorAll('script[type="application/jay-headfull"]')
        .map((script) => script.getAttribute('src'))
        .filter((src): src is string => src !== null);
}
