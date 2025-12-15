import { HTMLElement, parse } from 'node-html-parser';
import {
    JayComponentType,
    JayValidations,
    mkRefsTree,
    WithValidations,
} from '@jay-framework/compiler-shared';
import yaml from 'js-yaml';
import { capitalCase, pascalCase, camelCase } from 'change-case';
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
import { Contract, ContractTag } from '../contract';

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

/**
 * Checks if a type string is a recursive reference (starts with "$/" like "$/data")
 */
function isRecursiveReference(typeString: string): boolean {
    return typeof typeString === 'string' && typeString.startsWith('$/');
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
        const headlessImportedTypes = Object.fromEntries(
            headlessImports.map((_) => [
                _.key,
                new JayImportedType(_.rootType.name, _.rootType, true),
            ]),
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
): Promise<JayHeadlessImports[]> {
    const result: JayHeadlessImports[] = [];
    const projectRoot = path.dirname(path.dirname(filePath)); // Assuming filePath is in src/pages/
    
    for await (const element of elements) {
        const pluginAttr = element.getAttribute('plugin');
        const contractAttr = element.getAttribute('contract');
        const key = element.getAttribute('key');
        
        // Validate required attributes
        if (!pluginAttr) {
            validations.push(
                'headless import must specify plugin attribute',
            );
            continue;
        }
        
        if (!contractAttr) {
            validations.push(
                'headless import must specify contract attribute',
            );
            continue;
        }
        
        if (!key) {
            validations.push(
                'headless import must specify key attribute, used for this component ViewState and Refs member for the contract',
            );
            continue;
        }
        
        // Resolve plugin to actual paths using the resolver
        const resolved = importResolver.resolvePluginComponent(pluginAttr, contractAttr, projectRoot);
        
        if (!resolved) {
            validations.push(
                `Could not resolve plugin "${pluginAttr}" with contract "${contractAttr}". ` +
                `Ensure plugin.yaml exists in src/plugins/${pluginAttr}/ or node_modules/${pluginAttr}/`,
            );
            continue;
        }
        
        const module = resolved.componentPath;
        const name = resolved.componentName;
        const contractPath = resolved.contractPath;

        // Contract path from plugin resolution is already absolute, don't resolve it again
        const contractFile = contractPath;

        try {
            const subContract = importResolver.loadContract(contractFile);
            validations.push(...subContract.validations);
            await subContract.mapAsync(async (contract) => {
                const contractTypes = await contractToImportsViewStateAndRefs(
                    contract,
                    contractFile,
                    importResolver,
                );
                contractTypes.map(({ type, refs: subContractRefsTree, enumsToImport }) => {
                    const contractName = subContract.val.name;
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
                    const relativeContractPath = path.relative(filePath, contractPath);
                    
                    const enumsFromContract = enumsToImportRelativeToJayHtml
                        .filter((_) => _.declaringModule === relativeContractPath)
                        .map((_) => _.type);

                    const contractLink: JayImportLink = {
                        module: relativeContractPath,
                        names: [
                            { name: type.name, type },
                            { name: refsTypeName, type: JayUnknown },
                            ...enumsFromContract.map((_) => ({ name: _.name, type: _ })),
                        ],
                    };

                    const enumsFromOtherContracts = enumsToImportRelativeToJayHtml.filter(
                        (_) => _.declaringModule !== relativeContractPath,
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
                    result.push({ key, refs, rootType: type, contractLinks, codeLink, contract });
                });
            });
        } catch (e) {
            validations.push(
                `failed to parse linked contract ${contractPath} - ${e.message}${e.stack}`,
            );
        }
    }
    return result;
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

async function extractCss(
    root: HTMLElement,
    filePath: string,
): Promise<WithValidations<string | undefined>> {
    const cssParts: string[] = [];
    const validations: string[] = [];

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
                try {
                    // Resolve the CSS file path relative to the jay-html file
                    const cssFilePath = path.resolve(filePath, href);
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
    return new WithValidations(css, validations);
}

/**
 * Extract trackBy information from contracts for use in deep merge algorithm.
 * Returns a map from property path to trackBy field name.
 * e.g., { "items": "id", "counter.items": "itemId" }
 */
function extractTrackByMap(
    pageContract: Contract | undefined,
    headlessImports: JayHeadlessImports[],
): Record<string, string> {
    const trackByMap: Record<string, string> = {};

    function extractFromTags(tags: ContractTag[], basePath: string = '') {
        for (const tag of tags) {
            const propertyName = camelCase(tag.tag);
            const currentPath = basePath ? `${basePath}.${propertyName}` : propertyName;

            // If this is a repeated sub-contract with trackBy, record it
            if (tag.repeated && tag.trackBy) {
                trackByMap[currentPath] = camelCase(tag.trackBy);
            }

            // Recurse into nested tags
            if (tag.tags) {
                extractFromTags(tag.tags, currentPath);
            }
        }
    }

    // Extract from page contract
    if (pageContract) {
        extractFromTags(pageContract.tags);
    }

    // Extract from headless contracts
    for (const headless of headlessImports) {
        if (headless.contract) {
            extractFromTags(headless.contract.tags, headless.key);
        }
    }

    return trackByMap;
}

export async function parseJayFile(
    html: string,
    filename: string,
    filePath: string,
    options: ResolveTsConfigOptions,
    linkedContractResolver: JayImportResolver,
): Promise<WithValidations<JayHtmlSourceFile>> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, { delimiter: '' });
    const root = parse(html);

    const namespaces = parseNamespaces(root);
    const { val: jayYaml, validations } = parseYaml(root);
    if (validations.length > 0) return new WithValidations(undefined, validations);

    const headfullImports = parseHeadfullImports(
        root.querySelectorAll('script[type="application/jay-headfull"]'),
        validations,
        filePath,
        options,
        linkedContractResolver,
    );
    const headlessImports = await parseHeadlessImports(
        root.querySelectorAll('script[type="application/jay-headless"]'),
        validations,
        filePath,
        linkedContractResolver,
    );
    const importNames = headfullImports.flatMap((_) => _.names);
    const types = await parseTypes(
        jayYaml,
        validations,
        baseElementName,
        importNames,
        headlessImports,
        filePath,
        linkedContractResolver,
    );
    const imports: JayImportLink[] = [
        ...headfullImports,
        ...headlessImports.flatMap((_) => _.contractLinks),
    ];

    const cssResult = await extractCss(root, filePath);
    // Exclude CSS links from head links if CSS extraction is enabled (we have a file path)
    const excludeCssLinks = !!filePath;
    const headLinks = parseHeadLinks(root, excludeCssLinks);

    // Merge CSS validations with existing validations
    validations.push(...cssResult.validations);

    if (validations.length > 0) return new WithValidations(undefined, validations);

    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations);
    }

    // Extract trackBy information from contracts for deep merge
    const trackByMap = extractTrackByMap(jayYaml.parsedContract, headlessImports);

    return new WithValidations(
        {
            format: SourceFileFormat.JayHtml,
            types,
            imports,
            body,
            baseElementName,
            namespaces,
            headlessImports,
            headLinks,
            css: cssResult.val,
            filename: normalizedFileName,
            contract: jayYaml.parsedContract,
            contractRef: jayYaml.contractRef,
            hasInlineData: jayYaml.hasInlineData,
            trackByMap: Object.keys(trackByMap).length > 0 ? trackByMap : undefined,
        } as JayHtmlSourceFile,
        validations,
    );
}

export function getJayHtmlImports(html: string): string[] {
    const root = parse(html);
    return root
        .querySelectorAll(
            'script[type="application/jay-headfull"], script[type="application/jay-headless"]',
        )
        .map((script) => script.getAttribute('src'))
        .filter((src): src is string => src !== null);
}
