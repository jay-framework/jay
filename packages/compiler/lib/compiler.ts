import {parse, NodeType, HTMLElement} from 'node-html-parser';
import yaml from 'js-yaml';

enum JayPrimitiveTypes {
    type_string,
    type_number,
    type_boolean,
    type_date
}

interface JayType {
    [key: string]: JayPrimitiveTypes | JayType
}

type JayValidations = Array<string>


interface JayExample {
    name: string,
    data: any
}

interface JayFile {
    types: JayType,
    examples: Array<JayExample>,
    body: HTMLElement,
    validations: JayValidations
}

function validateType(data: any, validations: JayValidations, path: Array<string>): JayType {
    let types = {}
    for (let prop in data) {
        if (data[prop] === 'string' || data[prop] === 'number' || data[prop] === 'boolean' || data[prop] === 'date')
            types[prop] = data[prop];
        else if (Array.isArray(data[prop]))
            types[prop] = [validateType(data[prop][0], validations, [...path, prop])]
        else if (typeof data[prop] === 'object') {
            types[prop] = validateType(data[prop], validations, [...path, prop])
        }
        else
            validations.push(`invalid type [${data[prop]}] found at [${[...path, prop].join('.')}]`)
    }
    return types;
}

function parseJayYaml(jayYaml, validations: JayValidations): {types: JayType, examples: Array<JayExample>} {
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

export function parseJayFile(html): JayFile {
    let validations = [];
    let root = parse(html);
    let jayYamlElement = root.querySelector('[type="application/yaml-jay"]');
    let jayYaml = jayYamlElement.text;
    let {types, examples} = parseJayYaml(jayYaml, validations);
    let body = root.querySelector('body');
    return {
        types,
        examples,
        body,
        validations
    };
}