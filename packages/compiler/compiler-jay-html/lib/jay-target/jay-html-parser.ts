import { HTMLElement, parse } from 'node-html-parser';
import {
    JayComponentType,
    JayValidations,
    mkRefsTree,
    WithValidations,
} from '@jay-framework/compiler-shared';
import yaml from 'js-yaml';
import { capitalCase, pascalCase } from 'change-case';
import { camelCase } from '../case-utils';
import pluralize from 'pluralize';
import { parseEnumValues, parseImportNames, parseIsEnum } from '../expressions/expression-compiler';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import path from 'path';
import fs from 'fs/promises';
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
            `jay file should have exactly one jay-data script, found ${
                jayYamlElements.length === 0 ? 'none' : jayYamlElements.length
            }`,
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
                if (exportedType && exportedType !== JayUnknown)
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

async function parseHeadlessImports(
    elements: HTMLElement[],
    validations: Array<string>,
    filePath: string,
    importResolver: JayImportResolver,
    projectRoot: string,
): Promise<JayHeadlessImports[]> {
    const result: JayHeadlessImports[] = [];

    for await (const element of elements) {
        const pluginAttr = element.getAttribute('plugin');
        const contractAttr = element.getAttribute('contract');
        const key = element.getAttribute('key');

        // Validate required attributes
        if (!pluginAttr) {
            validations.push('headless import must specify plugin attribute');
            continue;
        }

        if (!contractAttr) {
            validations.push('headless import must specify contract attribute');
            continue;
        }

        // key is optional: if absent, the component is used only via <jay:contract-name> instances
        // if present, it also serves as a page-level data binding namespace

        // Resolve plugin to actual paths using the resolver
        const resolveResult = importResolver.resolvePluginComponent(
            pluginAttr,
            contractAttr,
            projectRoot,
        );

        // Add any validation messages from resolution
        validations.push(...resolveResult.validations);

        if (!resolveResult.val) {
            // Resolution failed - validation messages already added above
            continue;
        }

        const absoluteComponentPath = resolveResult.val.componentPath;
        const name = resolveResult.val.componentName;
        const isNpmPackage = resolveResult.val.isNpmPackage;
        const packageName = resolveResult.val.packageName;

        // For NPM packages, use the package name; for local plugins, use relative path
        let module: string;
        if (isNpmPackage && packageName) {
            module = packageName; // Import from npm package (e.g., "example-jay-mood-tracker-plugin")
        } else {
            // Make component path relative to the jay-html file for imports
            module = path.relative(filePath, absoluteComponentPath);
            // Ensure the path starts with ./ or ../ for proper module resolution
            if (!module.startsWith('.')) {
                module = './' + module;
            }
        }

        try {
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
            const loadedContract = contractResult.val.contract;
            const contractFile = contractResult.val.contractPath;
            const contractMetadata = contractResult.val.metadata;

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

                const enumsToImportRelativeToJayHtml: EnumToImport[] = enumsToImport.map(
                    (enumsToImport) => ({
                        type: enumsToImport.type,
                        declaringModule: path.relative(filePath, enumsToImport.declaringModule),
                    }),
                );

                // Make contract path relative to the jay-html file for imports
                const relativeContractPath = path.relative(filePath, contractFile);

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
                    contractName: contractAttr,
                    refs,
                    rootType: type,
                    contractLinks,
                    codeLink,
                    contract: loadedContract,
                    contractPath: contractFile,
                    metadata: contractMetadata,
                });
            });
        } catch (e) {
            validations.push(`failed to parse linked contract - ${e.message}${e.stack}`);
        }
    }
    return result;
}

/**
 * Inject headfull full-stack component templates into jay-html.
 * Finds <script type="application/jay-headfull" contract="..."> tags,
 * reads each component's jay-html file, and injects the body content
 * into matching <jay:Name> tags that are empty/self-closing.
 *
 * This must be called on the raw HTML string BEFORE the slow render pipeline,
 * so that instance bindings can be resolved during pre-rendering.
 *
 * @param html - The raw jay-html content
 * @param sourceDir - Absolute path to the directory containing the jay-html file
 * @param importResolver - Resolver for reading component jay-html files
 * @returns The HTML with headfull FS templates injected (or unchanged if none found)
 */
export function injectHeadfullFSTemplates(
    html: string,
    sourceDir: string,
    importResolver: JayImportResolver,
): string {
    const root = parse(html);
    const allHeadfullElements = root.querySelectorAll('script[type="application/jay-headfull"]');
    const fsElements = allHeadfullElements.filter((el) => el.getAttribute('contract'));

    if (fsElements.length === 0) return html;

    const body = root.querySelector('body');
    if (!body) return html;

    for (const element of fsElements) {
        const src = element.getAttribute('src');
        const rawNames = element.getAttribute('names');
        if (!src || !rawNames) continue;

        const names = parseImportNames(rawNames);
        if (names.length === 0) continue;

        const contractName = (names[0].as || names[0].name).toLowerCase();

        const jayHtmlContent = importResolver.readJayHtml(sourceDir, src);
        if (!jayHtmlContent) continue;

        const jayHtmlRoot = parse(jayHtmlContent);
        const jayHtmlBody = jayHtmlRoot.querySelector('body');
        if (!jayHtmlBody) continue;

        // Inject into matching <jay:Name> tags
        const jayTags = body
            .querySelectorAll('*')
            .filter((el) => el.tagName?.toLowerCase() === `jay:${contractName}`);

        for (const jayTag of jayTags) {
            if (!jayTag.innerHTML.trim()) {
                jayTag.set_content(jayHtmlBody.innerHTML);
            }
        }
    }

    return root.toString();
}

interface HeadfullFSParseResult {
    headlessImports: JayHeadlessImports[];
    css?: string;
    linkedCssFiles: string[];
}

/**
 * Parse headfull full-stack imports (application/jay-headfull with contract attribute).
 * These are headfull components that participate in three-phase rendering.
 * They are converted to JayHeadlessImports entries and their jay-html body content
 * is injected into matching <jay:Name> tags in the parent page body.
 */
async function parseHeadfullFSImports(
    elements: HTMLElement[],
    validations: Array<string>,
    filePath: string,
    importResolver: JayImportResolver,
    body: HTMLElement,
    projectRoot: string,
): Promise<HeadfullFSParseResult> {
    const headlessImports: JayHeadlessImports[] = [];
    const cssParts: string[] = [];
    const linkedCssFiles: string[] = [];

    for (const element of elements) {
        const src = element.getAttribute('src');
        const contractAttr = element.getAttribute('contract');
        const rawNames = element.getAttribute('names');

        if (!src) {
            validations.push('headfull FS import must specify src attribute');
            continue;
        }
        if (!contractAttr) {
            continue;
        }
        if (!rawNames) {
            validations.push(`headfull FS import for module ${src} must specify names attribute`);
            continue;
        }

        const names = parseImportNames(rawNames);
        if (names.length === 0) {
            validations.push(
                `headfull FS import for module ${src} does not specify what to import`,
            );
            continue;
        }

        // First name is the component export name; lowercased for <jay:xxx> tag matching
        const componentExportName = names[0].name;
        const contractName = (names[0].as || componentExportName).toLowerCase();

        // Load the contract — try filePath first, fall back to projectRoot
        // (pre-rendered files live in build/pre-rendered/ but contracts stay in the source directory)
        let contractPath = path.resolve(filePath, contractAttr);
        let loadedContract: Contract;
        try {
            const contractResult = importResolver.loadContract(contractPath);
            validations.push(...contractResult.validations);
            if (!contractResult.val) {
                continue;
            }
            loadedContract = contractResult.val;
        } catch (e) {
            // Contract not found at filePath — try projectRoot as fallback
            // (happens when parsing pre-rendered HTML from build/pre-rendered/)
            if (projectRoot && projectRoot !== filePath) {
                try {
                    contractPath = path.resolve(projectRoot, contractAttr);
                    const fallbackResult = importResolver.loadContract(contractPath);
                    validations.push(...fallbackResult.validations);
                    if (!fallbackResult.val) {
                        continue;
                    }
                    loadedContract = fallbackResult.val;
                } catch (e2) {
                    validations.push(
                        `Failed to load contract for headfull FS component ${src}: ${e2.message}`,
                    );
                    continue;
                }
            } else {
                validations.push(
                    `Failed to load contract for headfull FS component ${src}: ${e.message}`,
                );
                continue;
            }
        }

        // Read the component's jay-html file — try filePath first, fall back to projectRoot
        let jayHtmlContent = importResolver.readJayHtml(filePath, src);
        if (jayHtmlContent === null && projectRoot && projectRoot !== filePath) {
            jayHtmlContent = importResolver.readJayHtml(projectRoot, src);
        }
        if (jayHtmlContent === null) {
            validations.push(
                `jay-html file not found for headfull FS component ${src} (expected ${src}.jay-html)`,
            );
            continue;
        }

        const jayHtmlRoot = parse(jayHtmlContent);
        const jayHtmlBody = jayHtmlRoot.querySelector('body');
        if (!jayHtmlBody) {
            validations.push(`headfull FS component ${src} jay-html must have a body tag`);
            continue;
        }

        // Extract CSS from component's jay-html head
        const componentDir = path.dirname(path.resolve(filePath, src));
        const componentCssResult = await extractCss(jayHtmlRoot, componentDir);
        validations.push(...componentCssResult.validations);
        if (componentCssResult.val?.css) {
            cssParts.push(componentCssResult.val.css);
        }
        if (componentCssResult.val?.linkedCssFiles) {
            linkedCssFiles.push(...componentCssResult.val.linkedCssFiles);
        }

        // Inject template: find matching <jay:Name> tags in parent body
        const jayTags = body
            .querySelectorAll('*')
            .filter((el) => el.tagName?.toLowerCase() === `jay:${contractName}`);

        for (const jayTag of jayTags) {
            const existingContent = jayTag.innerHTML.trim();
            if (existingContent) {
                // Tag already has content — either pre-rendered injection or user content.
                // Skip injection; the existing content is used as-is.
                continue;
            }
            jayTag.set_content(jayHtmlBody.innerHTML);
        }

        // Build JayHeadlessImports entry
        try {
            const contractTypes = await contractToImportsViewStateAndRefs(
                loadedContract,
                contractPath,
                importResolver,
            );

            contractTypes.map(({ type, refs: subContractRefsTree, enumsToImport }) => {
                const contractInternalName = loadedContract.name;
                const refsTypeName = `${pascalCase(contractInternalName)}Refs`;
                const repeatedRefsTypeName = `${pascalCase(contractInternalName)}RepeatedRefs`;
                const refs = mkRefsTree(
                    subContractRefsTree.refs,
                    subContractRefsTree.children,
                    subContractRefsTree.repeated,
                    refsTypeName,
                    repeatedRefsTypeName,
                );

                const relativeContractPath = path.relative(filePath, contractPath);

                const enumsToImportRelativeToJayHtml: EnumToImport[] = enumsToImport.map(
                    (enumToImport) => ({
                        type: enumToImport.type,
                        declaringModule: path.relative(filePath, enumToImport.declaringModule),
                    }),
                );

                const enumsFromContract = enumsToImportRelativeToJayHtml
                    .filter((_) => _.declaringModule === relativeContractPath)
                    .map((_) => _.type);

                const nestedTypeNames = collectNestedTypeNames(type);
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

                // Module path for code link — resolve from projectRoot when filePath
                // is a different directory (e.g., build/pre-rendered/)
                const moduleResolveDir =
                    projectRoot && projectRoot !== filePath ? projectRoot : filePath;
                let relativeModule = path.relative(
                    filePath,
                    importResolver.resolveLink(moduleResolveDir, src),
                );
                if (!relativeModule.startsWith('.')) {
                    relativeModule = './' + relativeModule;
                }

                const codeLink: JayImportLink = {
                    module: relativeModule,
                    names: [
                        {
                            name: componentExportName,
                            type: new JayComponentType(componentExportName, []),
                        },
                    ],
                };

                headlessImports.push({
                    contractName,
                    refs,
                    rootType: type,
                    contractLinks,
                    codeLink,
                    contract: loadedContract,
                    contractPath,
                });
            });
        } catch (e) {
            validations.push(
                `failed to parse contract for headfull FS component ${src} - ${e.message}${e.stack}`,
            );
        }
    }

    return {
        headlessImports,
        css: cssParts.length > 0 ? cssParts.join('\n\n') : undefined,
        linkedCssFiles,
    };
}

function normalizeFilename(filename: string): string {
    return filename.replace('.jay-html', '');
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

interface ExtractCssResult {
    css: string | undefined;
    linkedCssFiles: string[];
}

async function extractCss(
    root: HTMLElement,
    filePath: string,
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
                // Skip external URLs - they won't be extracted
                continue;
            }

            // Only attempt to read files if we have a valid file path
            if (filePath) {
                // Resolve the CSS file path relative to the jay-html file
                const cssFilePath = path.resolve(filePath, href);
                // Track the CSS file for watching (even if it doesn't exist yet)
                linkedCssFiles.push(cssFilePath);

                try {
                    const cssContent = await fs.readFile(cssFilePath, 'utf-8');
                    cssParts.push(`/* External CSS: ${href} */\n${cssContent}`);
                } catch (error) {
                    // If the file doesn't exist or can't be read, add validation error
                    validations.push(`CSS file not found or unreadable: ${href}`);
                }
            } else {
                // If no file path is provided, just add a comment indicating the external CSS file
                cssParts.push(`/* External CSS: ${href} */`);
            }
        }
    }

    // Extract CSS from <style> tags
    const styleTags = root.querySelectorAll('head style, style');
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
): Promise<WithValidations<JayHtmlSourceFile>> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, { delimiter: '' });
    const root = parse(html);

    const namespaces = parseNamespaces(root);
    const { val: jayYaml, validations } = parseYaml(root);
    if (validations.length > 0) return new WithValidations(undefined, validations);

    // Split headfull imports: regular (no contract) vs full-stack (with contract)
    const allHeadfullElements = root.querySelectorAll('script[type="application/jay-headfull"]');
    const regularHeadfullElements = allHeadfullElements.filter(
        (el) => !el.getAttribute('contract'),
    );
    const fsHeadfullElements = allHeadfullElements.filter((el) => el.getAttribute('contract'));

    const headfullImports = parseHeadfullImports(
        regularHeadfullElements,
        validations,
        filePath,
        options,
        linkedContractResolver,
    );

    // Get body early — needed for headfull FS template injection
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations);
    }

    // Parse headfull full-stack imports (loads contracts, injects templates, extracts CSS)
    const headfullFSResult = await parseHeadfullFSImports(
        fsHeadfullElements,
        validations,
        filePath,
        linkedContractResolver,
        body,
        projectRoot,
    );

    const headlessImports = await parseHeadlessImports(
        root.querySelectorAll('script[type="application/jay-headless"]'),
        validations,
        filePath,
        linkedContractResolver,
        projectRoot,
    );

    // Merge headfull FS imports with headless imports
    const allHeadlessImports = [...headlessImports, ...headfullFSResult.headlessImports];

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
            ...(usedAsInstance.has(_.contractName) ? [_.codeLink] : []),
        ]),
    ];

    const cssResult = await extractCss(root, filePath);
    // Exclude CSS links from head links if CSS extraction is enabled (we have a file path)
    const excludeCssLinks = !!filePath;
    const headLinks = parseHeadLinks(root, excludeCssLinks);

    // Merge CSS validations with existing validations
    validations.push(...cssResult.validations);

    if (validations.length > 0) return new WithValidations(undefined, validations);

    // Merge CSS from headfull FS components
    let css = cssResult.val?.css;
    if (headfullFSResult.css) {
        css = css ? css + '\n\n' + headfullFSResult.css : headfullFSResult.css;
    }
    let allLinkedCssFiles = cssResult.val?.linkedCssFiles || [];
    if (headfullFSResult.linkedCssFiles.length > 0) {
        allLinkedCssFiles = [...allLinkedCssFiles, ...headfullFSResult.linkedCssFiles];
    }

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
            filename: normalizedFileName,
            contract: jayYaml.parsedContract,
            contractRef: jayYaml.contractRef,
            hasInlineData: jayYaml.hasInlineData,
            serverTrackByMap:
                Object.keys(serverTrackByMap).length > 0 ? serverTrackByMap : undefined,
            clientTrackByMap:
                Object.keys(clientTrackByMap).length > 0 ? clientTrackByMap : undefined,
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
