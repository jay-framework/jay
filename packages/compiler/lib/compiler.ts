import {parse, NodeType, HTMLElement} from 'node-html-parser';
import yaml from 'js-yaml';
import {pascalCase} from 'change-case';

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

interface JayType {
    [key: string]: JayPrimitiveTypes | JayType | Array<JayType>
}

type JayValidations = Array<string>


interface JayExample {
    name: string,
    data: any
}

interface JayFile {
    types: JayType,
    examples: Array<JayExample>,
    body: HTMLElement
}

class WithValidations<T> {
    val?: T;
    validations: JayValidations;

    constructor(val?: T, validations: JayValidations) {
        this.val = val;
        this.validations = validations;
    }

    map<R>(func: (T) => R): WithValidations<R> {
        if (this.val)
            return new WithValidations<R>(func(this.val), this.validations)
        else
            return new WithValidations<R>(undefined, this.validations)
    }

    flatMap<R>(func: (T) => WithValidations<R>): WithValidations<R> {
        if (this.val) {
            let that = func(this.val);
            return new WithValidations<R>(that.val, [...this.validations, ...that.validations])
        }
        else
            return new WithValidations<R>(undefined, this.validations)
    }
}

function isObject(obj) {
    return typeof obj === 'object' && !Array.isArray(obj)
}

function validateType(data: any, validations: JayValidations, path: Array<string>): JayType {
    let types = {}
    for (let prop in data) {
        if (typesMap[data[prop]] !== undefined)
            types[prop] = typesMap[data[prop]];
        else if (Array.isArray(data[prop]))
            types[prop] = [validateType(data[prop][0], validations, [...path, prop])]
        else if (isObject(data[prop])) {
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

export function parseJayFile(html): WithValidations<JayFile> {
    let validations = [];
    let root = parse(html);
    let jayYamlElements = root.querySelectorAll('[type="application/yaml-jay"]');
    if (jayYamlElements.length !== 1) {
        validations.push(`jay file should have exactly one yaml-jay script, found ${jayYamlElements.length===0?'none':jayYamlElements.length}`);
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

function renderInterface(types: JayType, name: String): string {

    let childInterfaces = [];

    let genInterface = `interface ${name} {\n`;
    genInterface += Object
        .keys(types)
        .map(prop => {
            if (isObject(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop] as JayType, pascalCase(name)));
                return `  ${prop}: ${pascalCase(name)}`;
            }
            else if (Array.isArray(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop][0] as JayType, pascalCase(name)));
                return `  ${prop}: Array<${pascalCase(name)}>`;
            }
            else
                return `  ${prop}: ${types[prop]}`;
        })
        .join(',\n');
    genInterface += '\n}';
    return [...childInterfaces, genInterface].join('\n\n');

}

export function generateTypes(types: JayType): string {
    return renderInterface(types, 'ViewState');
}

export function generateDefinitionFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return `${types}\n\nexport declare function render(viewState: ViewState): JayElement`;
    })
}