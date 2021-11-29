import {HTMLElement, parse} from "node-html-parser";
import {JayValidations, WithValidations} from "./with-validations";
import yaml from 'js-yaml';
import {pascalCase} from 'change-case';
import pluralize from 'pluralize';

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

interface JayImport {
    module: string,
    component: string,
    as?: string
}

export interface JayFile {
    types: JayObjectType,
    examples: Array<JayExample>,
    imports: JayImport[],
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

function resolveType(data: any, validations: JayValidations, path: Array<string>): JayObjectType {
    let types = {};
    for (let prop in data) {
        if (typesMap[data[prop]] !== undefined)
            types[prop] = typesMap[data[prop]];
        else if (isArrayType(data[prop]))
            types[prop] = new JayArrayType(resolveType(data[prop][0], validations, [...path, prop]));
        else if (isObjectType(data[prop])) {
            types[prop] = resolveType(data[prop], validations, [...path, prop])
        } else {
            let [, ...pathTail] = path;
            validations.push(`invalid type [${data[prop]}] found at [${['data', ...pathTail, prop].join('.')}]`)
        }
    }
    return new JayObjectType(toInterfaceName(path.slice(-1)[0]), types);
}

function parseJayYaml(jayYaml, validations: JayValidations, baseElementName: string): { types: JayObjectType, examples: Array<JayExample> } {
    let jayYamlParsed = yaml.load(jayYaml);
    let types = resolveType(jayYamlParsed.data, validations, [baseElementName+'ViewState']);
    let examples = Object.keys(jayYamlParsed).filter(_ => _ !== 'data').map(exampleName => {
        return {
            name: exampleName,
            data: jayYamlParsed[exampleName]
        }
    })
    return {types, examples};
}

function parseTypesAndExamples(root: HTMLElement, baseElementName: string): WithValidations<{ types: JayObjectType, examples: Array<JayExample> }> {
    let validations = [];
    let jayYamlElements = root.querySelectorAll('[type="application/yaml-jay"]');
    if (jayYamlElements.length !== 1) {
        validations.push(`jay file should have exactly one yaml-jay script, found ${jayYamlElements.length === 0 ? 'none' : jayYamlElements.length}`);
        return new WithValidations(undefined, validations)
    }
    let jayYaml = jayYamlElements[0].text;
    return new WithValidations(parseJayYaml(jayYaml, validations, baseElementName), validations)
}

function parseImports(root: HTMLElement): WithValidations<JayImport[]> {
    // todo validate the imported component and identify the member
    let imports = root.querySelectorAll('link[rel=import]');

    let parsedImports: WithValidations<JayImport[]>[] = imports.map(element => {
        if (!element.hasAttribute('href'))
            return new WithValidations(undefined, ['jay file link import must have href attribute']);
        else if (!element.hasAttribute('component'))
            return new WithValidations(undefined, ['jay file link import must have component attribute']);
        else
            return new WithValidations([{
                module: element.getAttribute('href'),
                component: element.getAttribute('component'),
                as: element.getAttribute('as')
            }], [])
    });
    return parsedImports.reduce((acc, current) => {
        return acc.merge(current, (a, b) => b?[...a, ...b]:a);
    }, new WithValidations<JayImport[]>([], []));
}

export function parseJayFile(html: string, baseElementName: string): WithValidations<JayFile> {
    let root = parse(html);

    let {val: typesAndExamples, validations: typeValidations} = parseTypesAndExamples(root, baseElementName);
    let {val: imports, validations: importValidations} = parseImports(root);

    let validations = [...typeValidations, ...importValidations];
    if (validations.length > 0)
        return new WithValidations(undefined, validations);

    let {types, examples} = typesAndExamples;
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations)
    }
    return new WithValidations({types, examples, imports, body}, validations)
}