import { HTMLElement, parse } from 'node-html-parser';
import { JayComponentType, JayValidations, mkRefsTree, WithValidations } from 'jay-compiler-shared';
import yaml from 'js-yaml';
import { capitalCase, pascalCase } from 'change-case';
import pluralize from 'pluralize';
import { parseEnumValues, parseImportNames, parseIsEnum } from '../expressions/expression-compiler';
import { ResolveTsConfigOptions } from 'jay-compiler-analyze-exported-types';
import path from 'path';
import {
    JayArrayType,
    JayEnumType,
    JayImportedType,
    JayObjectType,
    JayType,
    JayUnknown,
    resolvePrimitiveType,
} from 'jay-compiler-shared';
import { SourceFileFormat } from 'jay-compiler-shared';
import { JayImportLink, JayImportName } from 'jay-compiler-shared';
import { JayYamlStructure } from './jay-yaml-structure';

import { JayHeadlessImports, JayHtmlNamespace, JayHtmlSourceFile } from './jay-html-source-file';

import { JayImportResolver } from './jay-import-resolver';
import { contractToImportsViewStateAndRefs, EnumToImport } from '../contract';

export function isObjectType(obj) {
    return typeof obj === 'object' && !Array.isArray(obj);
}

export function isArrayType(obj: any) {
    return Array.isArray(obj);
}

function toInterfaceName(name: string[]) {
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
    for (let prop in data) {
        if (resolvePrimitiveType(data[prop]) !== JayUnknown)
            types[prop] = resolvePrimitiveType(data[prop]);
        else if (isArrayType(data[prop]))
            types[prop] = new JayArrayType(
                resolveType(data[prop][0], validations, [...path, prop], imports),
            );
        else if (isObjectType(data[prop])) {
            types[prop] = resolveType(data[prop], validations, [...path, prop], imports);
        } else if (resolveImportedType(imports, data[prop]) !== JayUnknown) {
            types[prop] = resolveImportedType(imports, data[prop]);
        } else if (parseIsEnum(data[prop])) {
            types[prop] = new JayEnumType(
                toInterfaceName([...path, prop]),
                parseEnumValues(data[prop]),
            );
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
        .map((script) => script.getAttribute('src'));
}
