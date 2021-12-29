import {HTMLElement, parse} from "node-html-parser";
import {JayValidations, WithValidations} from "./with-validations";
import yaml from 'js-yaml';
import {pascalCase} from 'change-case';
import pluralize from 'pluralize';
import {parseEnumValues, parseImportNames, parseIsEnum} from "./expression-compiler";

export interface JayType {
    name: string
}

export class JayAtomicType implements JayType {
    readonly name: string;
    constructor(name: string) {
        this.name = name;
    }
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

export class JayTypeAlias implements JayType {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
}

export class JayEnumType implements  JayType {
    name: string;
    values: Array<string>
    constructor(name: string, values: Array<string>) {
        this.name = name;
        this.values = values;
    }
}

export class JayImportedType implements JayType {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
}

export class JayObjectType implements JayType {
    readonly name: string;
    readonly props: {[key: string]: JayType};
    constructor(name: string, props: {[key: string]: JayType}) {
        this.name = name;
        this.props = props;
    }
}

export class JayArrayType implements JayType {
    readonly itemType: JayType;
    constructor(itemType: JayType) {
        this.itemType = itemType;
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
    as?: string
}

export interface JayImportLink {
    module: string,
    names: JayImportName[]
}

export interface JayFile {
    types: JayObjectType,
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

function resolveImportedType(type: any) {
    // todo use typescfript compiler to get the actual nested types
    return new JayImportedType(type);
}

function resolveType(data: any, validations: JayValidations, path: Array<string>, importedSymbols: Set<string>): JayObjectType {
    let types = {};
    for (let prop in data) {
        if (typesMap[data[prop]] !== undefined)
            types[prop] = typesMap[data[prop]];
        else if (isArrayType(data[prop]))
            types[prop] = new JayArrayType(resolveType(data[prop][0], validations, [...path, prop], importedSymbols));
        else if (isObjectType(data[prop])) {
            types[prop] = resolveType(data[prop], validations, [...path, prop], importedSymbols)
        } else if (importedSymbols.has(data[prop])) {
            types[prop] = resolveImportedType(data[prop])
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

function parseTypes(jayYaml: JayYamlStructure, validations: JayValidations, baseElementName: string, importedSymbols: Set<string>): JayObjectType {
    return resolveType(jayYaml.data, validations, [baseElementName+'ViewState'], importedSymbols);
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

function parseImports(importLinks: HTMLElement[], validations: JayValidations): JayImportLink[] {
    return importLinks.map(importLink => {
        let module = importLink. getAttribute('href');
        let rawNames = importLink.getAttribute('names');
        try {
            let names = parseImportNames(rawNames)
            if (names.length === 0)
                validations.push(`import for module ${module} does not specify what to import`);
            return {module, names}
        }
        catch (e) {
            validations.push(`failed to parsed import names for module ${module} - ${e.message}`);
            return {module, names:[]}
        }
    })
        .filter(importLink => importLink.names.length > 0);
}

export function parseJayFile(html: string, baseElementName: string): WithValidations<JayFile> {
    let root = parse(html);

    let {val: jayYaml, validations} = parseYaml(root);
    if (validations.length > 0)
        return new WithValidations(undefined, validations);

    let examples = parseExamples(jayYaml, validations);
    let imports = parseImports(root.querySelectorAll('link[rel="import"]'), validations);
    let importedSymbols = new Set(imports.flatMap(_ => _.names.map(sym => sym.as? sym.as : sym.name)));
    let types = parseTypes(jayYaml, validations, baseElementName, importedSymbols);

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