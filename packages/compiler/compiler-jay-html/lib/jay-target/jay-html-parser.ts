import { HTMLElement, parse } from 'node-html-parser';
import {
    JayComponentType,
    JayValidations,
    mkRefsTree,
    WithValidations,
} from '@jay-framework/compiler-shared';
import yaml from 'js-yaml';
import { capitalCase, pascalCase } from 'change-case';
import pluralize from 'pluralize';
import { 
    parseEnumValues, 
    parseImportNames, 
    parseIsEnum,
} from '../expressions/expression-compiler';
import { ResolveTsConfigOptions } from '@jay-framework/compiler-analyze-exported-types';
import path from 'path';
import fs from 'fs/promises';
import {
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayObjectType,
    JayType,
    JayUnknown,
    resolvePrimitiveType,
    JayPromiseType,
} from '@jay-framework/compiler-shared';
import { SourceFileFormat } from '@jay-framework/compiler-shared';
import { JayImportLink, JayImportName } from '@jay-framework/compiler-shared';
import { JayYamlStructure } from './jay-yaml-structure';

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

function resolveType(
    data: any,
    validations: JayValidations,
    path: Array<string>,
    imports: JayImportName[],
): JayObjectType {
    let types = {};
    for (let propKey in data) {
        // Check if this is an async property (starts with "async ")
        const isAsyncProp = propKey.startsWith('async ');
        const prop = isAsyncProp ? propKey.substring(6) : propKey; // Remove "async " prefix if present

        const checkAsync = (type: JayType): JayType =>
            isAsyncProp?
                new JayPromiseType(type) :
                type;

        const resolvedPrimitive = resolvePrimitiveType(data[propKey]);
        if (resolvedPrimitive !== JayUnknown) {
            types[prop] = checkAsync(resolvedPrimitive);
        } else if (isArrayType(data[propKey])) {
            types[prop] = checkAsync(new JayArrayType(
                resolveType(data[propKey][0], validations, [...path, prop], imports)
            ));
        } else if (isObjectType(data[propKey])) {
            types[prop] = checkAsync(resolveType(data[propKey], validations, [...path, prop], imports));
        } else if (resolveImportedType(imports, data[propKey]) !== JayUnknown) {
            types[prop] = checkAsync(resolveImportedType(imports, data[prop]));
        } else if (parseIsEnum(data[propKey])) {
            types[prop] = checkAsync(new JayEnumType(
                toInterfaceName([...path, prop]),
                parseEnumValues(data[prop])
            ));
        } else {
            let [, ...pathTail] = path;
            validations.push(
                `invalid type [${data[prop]}] found at [${['data', ...pathTail, prop].join('.')}]`,
            );
        }
    }
    return new JayObjectType(toInterfaceName(path), types);
}

function parseTypes(
    jayYaml: JayYamlStructure,
    validations: JayValidations,
    baseElementName: string,
    imports: JayImportName[],
    headlessImports: JayHeadlessImports[],
): JayType {
    if (typeof jayYaml.data === 'object') {
        const resolvedType = resolveType(
            jayYaml.data,
            validations,
            [baseElementName + 'ViewState'],
            imports,
        );
        const headlessImportedTypes = Object.fromEntries(
            headlessImports.map((_) => [_.key, new JayImportedType(_.rootType.name, _.rootType)]),
        );
        return new JayObjectType(resolvedType.name, {
            ...headlessImportedTypes,
            ...resolvedType.props,
        });
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
    let jayYaml = jayYamlElements[0].text;
    let jayYamlParsed = yaml.load(jayYaml) as JayYamlStructure;
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
    for await (const element of elements) {
        const module = element.getAttribute('src');
        const name = element.getAttribute('name');
        const contractPath = element.getAttribute('contract');
        const key = element.getAttribute('key');

        if (!module) {
            validations.push(
                'headless import must specify src attribute, module path to headless component implementation',
            );
            continue;
        }
        if (!name) {
            validations.push(
                `headless import must specify name of the constant to import from ${module}`,
            );
            continue;
        }
        if (!contractPath) {
            validations.push(
                'headless import must specify contract attribute, module path to headless component contract',
            );
            continue;
        }
        if (!key) {
            validations.push(
                'headless import must specify key attribute, used for this component ViewState and Refs member for the contract',
            );
            continue;
        }

        const contractFile = importResolver.resolveLink(filePath, contractPath);

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

                    const enumsFromContract = enumsToImportRelativeToJayHtml
                        .filter((_) => _.declaringModule === contractPath)
                        .map((_) => _.type);

                    const contractLink: JayImportLink = {
                        module: contractPath,
                        names: [
                            { name: type.name, type },
                            { name: refsTypeName, type: JayUnknown },
                            ...enumsFromContract.map((_) => ({ name: _.name, type: _ })),
                        ],
                    };

                    const enumsFromOtherContracts = enumsToImportRelativeToJayHtml.filter(
                        (_) => _.declaringModule !== contractPath,
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
                    result.push({ key, refs, rootType: type, contractLinks, codeLink });
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
            if (excludeCssLinks && rel === 'stylesheet') return false;
            return true;
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
    const types = parseTypes(jayYaml, validations, baseElementName, importNames, headlessImports);
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
