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

export interface JayFile {
    types: JayObjectType,
    examples: Array<JayExample>,
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
        } else
            validations.push(`invalid type [${data[prop]}] found at [${[...path, prop].join('.')}]`)
    }
    return new JayObjectType(toInterfaceName(path.slice(-1)[0]), types);
}

function parseJayYaml(jayYaml, validations: JayValidations): { types: JayObjectType, examples: Array<JayExample> } {
    let jayYamlParsed = yaml.load(jayYaml);
    let types = resolveType(jayYamlParsed.data, validations, ['data']);
    let examples = Object.keys(jayYamlParsed).filter(_ => _ !== 'data').map(exampleName => {
        return {
            name: exampleName,
            data: jayYamlParsed[exampleName]
        }
    })
    return {types, examples};
}

export function parseJayFile(html: string): WithValidations<JayFile> {
    let validations = [];
    let root = parse(html);
    let jayYamlElements = root.querySelectorAll('[type="application/yaml-jay"]');
    if (jayYamlElements.length !== 1) {
        validations.push(`jay file should have exactly one yaml-jay script, found ${jayYamlElements.length === 0 ? 'none' : jayYamlElements.length}`);
        return new WithValidations(undefined, validations)
    }
    let jayYaml = jayYamlElements[0].text;
    let {types, examples} = parseJayYaml(jayYaml, validations);
    let body = root.querySelector('body');
    if (body === null) {
        validations.push(`jay file must have exactly a body tag`);
        return new WithValidations(undefined, validations)
    }
    return new WithValidations({types, examples, body}, validations)
}