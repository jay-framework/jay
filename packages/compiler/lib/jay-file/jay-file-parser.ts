import { HTMLElement, parse } from 'node-html-parser';
import { JayValidations, WithValidations } from '../core/with-validations';
import yaml from 'js-yaml';
import { capitalCase, pascalCase } from 'change-case';
import pluralize from 'pluralize';
import { parseEnumValues, parseImportNames, parseIsEnum } from '../expressions/expression-compiler';
import { tsExtractTypes } from '../ts-file/ts-extract-types';
import path from 'path';
import {
    JayArrayType,
    JayEnumType,
    JayHtmlFile,
    JayImportedType,
    JayImportLink,
    JayImportName,
    JayObjectType,
    JayType,
    JayUnknown,
    JayYamlStructure,
    resolvePrimitiveType,
} from '../core/jay-file-types';
import { ResolveTsConfigOptions } from '../ts-file/resolve-ts-config';
import { JayFormat } from '../core/jay-format';

export function isObjectType(obj) {
    return typeof obj === 'object' && !Array.isArray(obj);
}

export function isArrayType(obj: any) {
    return Array.isArray(obj);
}

function toInterfaceName(name) {
    if (name === 'data') return 'ViewState';
    else return pascalCase(pluralize.singular(name));
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
            types[prop] = new JayEnumType(toInterfaceName(prop), parseEnumValues(data[prop]));
        } else {
            let [, ...pathTail] = path;
            validations.push(
                `invalid type [${data[prop]}] found at [${['data', ...pathTail, prop].join('.')}]`,
            );
        }
    }
    return new JayObjectType(toInterfaceName(path.slice(-1)[0]), types);
}

function parseTypes(
    jayYaml: JayYamlStructure,
    validations: JayValidations,
    baseElementName: string,
    imports: JayImportName[],
): JayType {
    if (typeof jayYaml.data === 'object')
        return resolveType(jayYaml.data, validations, [baseElementName + 'ViewState'], imports);
    else if (typeof jayYaml.data === 'string') return resolveImportedType(imports, jayYaml.data);
}

function parseExamples(jayYaml: JayYamlStructure, validations: JayValidations) {
    return Object.keys(jayYaml)
        .filter((_) => _ !== 'data')
        .map((exampleName) => {
            return {
                name: exampleName,
                data: jayYaml[exampleName],
            };
        });
}

function parseYaml(root: HTMLElement): WithValidations<JayYamlStructure> {
    let validations = [];
    let jayYamlElements = root.querySelectorAll('[type="application/yaml-jay"]');
    if (jayYamlElements.length !== 1) {
        validations.push(
            `jay file should have exactly one yaml-jay script, found ${
                jayYamlElements.length === 0 ? 'none' : jayYamlElements.length
            }`,
        );
        return new WithValidations(undefined, validations);
    }
    let jayYaml = jayYamlElements[0].text;
    let jayYamlParsed = yaml.load(jayYaml) as JayYamlStructure;
    return new WithValidations(jayYamlParsed, validations);
}

function parseImports(
    importLinks: HTMLElement[],
    validations: JayValidations,
    filePath: string,
    options: ResolveTsConfigOptions,
): JayImportLink[] {
    return importLinks.map<JayImportLink>((importLink) => {
        const module = importLink.getAttribute('href');
        const rawNames = importLink.getAttribute('names');
        const sandboxAttribute = importLink.getAttribute('sandbox');
        const sandbox =
            sandboxAttribute === '' || (Boolean(sandboxAttribute) && sandboxAttribute !== 'false');
        try {
            const names = parseImportNames(rawNames);
            if (names.length === 0)
                validations.push(`import for module ${module} does not specify what to import`);

            const importedFile = path.resolve(filePath, module);
            const exportedTypes = tsExtractTypes(importedFile, options);

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
    //new Set(imports.flatMap(_ => _.names.map(sym => sym.as? sym.as : sym.name)));
}

function normalizeFilename(filename: string): string {
    return filename.replace('.jay-html', '');
}

export function parseJayFile(
    html: string,
    filename: string,
    filePath: string,
    options: ResolveTsConfigOptions,
): WithValidations<JayHtmlFile> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, { delimiter: '' });
    let root = parse(html);

    let { val: jayYaml, validations } = parseYaml(root);
    if (validations.length > 0) return new WithValidations(undefined, validations);

    let examples = parseExamples(jayYaml, validations);
    let imports = parseImports(
        root.querySelectorAll('link[rel="import"]'),
        validations,
        filePath,
        options,
    );
    let importNames = imports.flatMap((_) => _.names);
    let types = parseTypes(jayYaml, validations, baseElementName, importNames);

    // let validations = [...typeValidations, ...importValidations];
    if (validations.length > 0) return new WithValidations(undefined, validations);

    // let {types, examples} = typesAndExamples;
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations);
    }
    return new WithValidations(
        { format: JayFormat.JayHtml, types, examples, imports, body, baseElementName },
        validations,
    );
}

export function getJayHtmlImports(html: string): string[] {
    const root = parse(html);
    return root.querySelectorAll('link[rel="import"]').map((link) => link.getAttribute('href'));
}
