import {HTMLElement, parse} from "node-html-parser";
import {JayValidations, WithValidations} from "./with-validations";
import yaml from 'js-yaml';

export enum JayPrimitiveTypes {
    type_string = 'string',
    type_number = 'number',
    type_boolean = 'boolean',
    type_date = 'Date'
}

const typesMap = {
    'string': JayPrimitiveTypes.type_string,
    'number': JayPrimitiveTypes.type_number,
    'boolean': JayPrimitiveTypes.type_boolean,
    'date': JayPrimitiveTypes.type_date
}

export interface JayType {
    [key: string]: JayPrimitiveTypes | JayType | Array<JayType>
}

interface JayExample {
    name: string,
    data: any
}

export interface JayFile {
    types: JayType,
    examples: Array<JayExample>,
    body: HTMLElement
}

export function isObjectType(obj) {
    return typeof obj === 'object' && !Array.isArray(obj)
}

export function isArrayType(obj: any) {
    return Array.isArray(obj);
}

function validateType(data: any, validations: JayValidations, path: Array<string>): JayType {
    let types = {}
    for (let prop in data) {
        if (typesMap[data[prop]] !== undefined)
            types[prop] = typesMap[data[prop]];
        else if (isArrayType(data[prop]))
            types[prop] = [validateType(data[prop][0], validations, [...path, prop])]
        else if (isObjectType(data[prop])) {
            types[prop] = validateType(data[prop], validations, [...path, prop])
        } else
            validations.push(`invalid type [${data[prop]}] found at [${[...path, prop].join('.')}]`)
    }
    return types;
}

function parseJayYaml(jayYaml, validations: JayValidations): { types: JayType, examples: Array<JayExample> } {
    let jayYamlParsed = yaml.load(jayYaml);
    let types = validateType(jayYamlParsed.data, validations, ['data']);
    let examples = Object.keys(jayYamlParsed).filter(_ => _ !== 'data').map(exampleName => {
        return {
            name: exampleName,
            data: jayYamlParsed[exampleName]
        }
    })
    return {types, examples};
}

export function parseJayFile(html): WithValidations<JayFile> {
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