import {HTMLElement, parse} from "node-html-parser";
import {JayValidations, WithValidations} from "./with-validations";
import yaml from 'js-yaml';
import {pascalCase} from 'change-case';
import pluralize from 'pluralize';
import {parseEnumValues, parseImportNames, parseIsEnum} from "./expression-compiler";
import {extractTypesForFile} from "./extract-types-for-file";
import path from 'path';

export interface JayType {
    name: string
    isImported: boolean
}

export class JayAtomicType implements JayType {
    constructor(
        public readonly name: string,
        public readonly isImported: boolean = false
    ) {}
}

export const JayString = new JayAtomicType('string');
export const JayNumber = new JayAtomicType('number');
export const JayBoolean = new JayAtomicType('boolean');
export const JayDate = new JayAtomicType('Date');
export const JayUnknown = new JayAtomicType('Unknown');

const typesMap = {
    'string': JayString,
    'number': JayNumber,
    'boolean': JayBoolean,
    'date': JayDate
}

export function resolvePrimitiveType(typeName: string): JayType {
    return typesMap[typeName] || JayUnknown
}

export class JayTypeAlias implements JayType {
    constructor(public readonly name: string,
                public readonly isImported: boolean = false) {}
}

export class JayEnumType implements  JayType {
    constructor(public readonly name: string,
                public readonly values: Array<string>,
                public readonly isImported: boolean = false) {
    }
}

export class JayImportedType implements JayType {
    constructor(public readonly name: string,
                public readonly isImported: boolean = false) {}}

export class JayElementType implements JayType {
    constructor(public readonly name: string,
                public readonly isImported: boolean = false) {}
}

export class JayComponentType implements JayType {
    constructor(public readonly name: string,
                public readonly isImported: boolean = false) {}
}

export class JayObjectType implements JayType {
    constructor(public readonly name: string,
                public readonly props: {[key: string]: JayType},
                public readonly isImported: boolean = false) {
    }
}

export class JayArrayType implements JayType {
    constructor(public readonly itemType: JayType,
                public readonly isImported: boolean = false) {
    }
    get name() {
        return `Array<${this.itemType.name}>`
    }
}

interface JayExample {
    name: string,
    data: any
}

export interface JayImportName {
    name: string,
    as?: string,
    type: JayType
}

export interface JayImportLink {
    module: string,
    names: JayImportName[]
}

export interface JayFile {
    types: JayType,
    examples: Array<JayExample>,
    imports: JayImportLink[],
    body: HTMLElement
}

export function isObjectType(obj) {
    return typeof obj === 'object' && !Array.isArray(obj)
}

export function isArrayType(obj: any) {
    return Array.isArray(obj);
}

function toInterfaceName(name) {
    if (name === 'data')
        return 'ViewState'
    else
        return pascalCase(pluralize.singular(name))
}

function resolveImportedType(imports: JayImportName[], type: string): JayType {
    let importedSymbols = imports.find(_ => _.as? _.as === type : _.name === type)
    if (importedSymbols) {
        // todo use typescfript compiler to get the actual nested types
    }
    else
        return JayUnknown;
}

function resolveType(data: any, validations: JayValidations, path: Array<string>, imports: JayImportName[]): JayObjectType {
    let types = {};
    for (let prop in data) {
        if (resolvePrimitiveType(data[prop]) !== JayUnknown)
            types[prop] = resolvePrimitiveType(data[prop]);
        else if (isArrayType(data[prop]))
            types[prop] = new JayArrayType(resolveType(data[prop][0], validations, [...path, prop], imports));
        else if (isObjectType(data[prop])) {
            types[prop] = resolveType(data[prop], validations, [...path, prop], imports)
        } else if (resolveImportedType(imports, data[prop]) !== JayUnknown) {
            types[prop] = resolveImportedType(imports, data[prop])
        } else if (parseIsEnum(data[prop])) {
            types[prop] = new JayEnumType(toInterfaceName(prop), parseEnumValues(data[prop]));
        }
        else {
            let [, ...pathTail] = path;
            validations.push(`invalid type [${data[prop]}] found at [${['data', ...pathTail, prop].join('.')}]`)
        }
    }
    return new JayObjectType(toInterfaceName(path.slice(-1)[0]), types);
}

function parseTypes(jayYaml: JayYamlStructure, validations: JayValidations, baseElementName: string, imports: JayImportName[]): JayType {
    if (typeof jayYaml.data === 'object')
        return resolveType(jayYaml.data, validations, [baseElementName+'ViewState'], imports);
    else if (typeof jayYaml.data === 'string')
        return resolveImportedType(imports, jayYaml.data)
}

function parseExamples(jayYaml: JayYamlStructure, validations: JayValidations) {
    return Object.keys(jayYaml).filter(_ => _ !== 'data').map(exampleName => {
        return {
            name: exampleName,
            data: jayYaml[exampleName]
        }
    })
}

interface JayYamlStructure {
    data: any,
    imports: Record<string, Array<JayImportName>>,
    examples: any
}

function parseYaml(root: HTMLElement): WithValidations<JayYamlStructure> {
    let validations = [];
    let jayYamlElements = root.querySelectorAll('[type="application/yaml-jay"]');
    if (jayYamlElements.length !== 1) {
        validations.push(`jay file should have exactly one yaml-jay script, found ${jayYamlElements.length === 0 ? 'none' : jayYamlElements.length}`);
        return new WithValidations(undefined, validations)
    }
    let jayYaml = jayYamlElements[0].text;
    let jayYamlParsed = yaml.load(jayYaml) as JayYamlStructure;
    return new WithValidations(jayYamlParsed, validations);
}

function parseImports(importLinks: HTMLElement[], validations: JayValidations, filePath: string): JayImportLink[] {
    return importLinks.map<JayImportLink>(importLink => {
        let module = importLink. getAttribute('href');
        let rawNames = importLink.getAttribute('names');
        try {
            let names = parseImportNames(rawNames)
            if (names.length === 0)
                validations.push(`import for module ${module} does not specify what to import`);

            let importedFile = path.resolve(filePath, module);
            let exportedTypes = extractTypesForFile(importedFile);

            for (let name of names) {
                let exportedType = exportedTypes.find(_ => _.name === name.name);
                if (exportedType && exportedType !== JayUnknown)
                    name.type = exportedType;
                else if (exportedType === JayUnknown)
                    validations.push(`imported name ${name.name} from ${module} has an unsupported type`);
                else
                    validations.push(`failed to find exported member ${name.name} type in module ${module}`);
            }


            return {module, names}
        }
        catch (e) {
            validations.push(`failed to parsed import names for module ${module} - ${e.message}`);
            return {module, names: []}
        }
    })
    //new Set(imports.flatMap(_ => _.names.map(sym => sym.as? sym.as : sym.name)));
}

export function parseJayFile(html: string, baseElementName: string, filePath: string): WithValidations<JayFile> {
    let root = parse(html);

    let {val: jayYaml, validations} = parseYaml(root);
    if (validations.length > 0)
        return new WithValidations(undefined, validations);

    let examples = parseExamples(jayYaml, validations);
    let imports = parseImports(root.querySelectorAll('link[rel="import"]'), validations, filePath);
    let importNames = imports.flatMap(_ => _.names);
    let types = parseTypes(jayYaml, validations, baseElementName, importNames);

    // let validations = [...typeValidations, ...importValidations];
    if (validations.length > 0)
        return new WithValidations(undefined, validations);

    // let {types, examples} = typesAndExamples;
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations)
    }
    return new WithValidations({types, examples, imports, body}, validations)
}