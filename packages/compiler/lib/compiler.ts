import {pascalCase} from 'change-case';
import {WithValidations} from "./with-validations";
import {isArrayType, isObjectType, JayFile, JayType, parseJayFile} from "./parse-jay-file";


function renderInterface(types: JayType, name: String): string {

    let childInterfaces = [];

    let genInterface = `interface ${name} {\n`;
    genInterface += Object
        .keys(types)
        .map(prop => {
            if (isObjectType(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop] as JayType, pascalCase(name)));
                return `  ${prop}: ${pascalCase(name)}`;
            }
            else if (isArrayType(types[prop])) {
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

function renderImports(): string {
    return `import {JayElement} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

export function generateDefinitionFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(), types, renderFunctionDecleration()].join('\n\n');
    })
}

// export function generateRuntimeFile(html): WithValidations<string> {
//
// }