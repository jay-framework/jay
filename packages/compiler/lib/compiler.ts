import {pascalCase} from 'change-case';
import {WithValidations} from "./with-validations";
import {isArrayType, isObjectType, JayFile, JayType, parseJayFile} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";


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

function renderImports(jayElement: boolean, e: boolean, dt: boolean): string {
    let imports = [];
    if (jayElement) imports.push('JayElement');
    if (e) imports.push('element as e');
    if (dt) imports.push('dynamicText as dt');
    return `import {${imports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

const parseText = /{(.+?)}/g
function renderTextNode(currentDataVar: string, text: string): string {
    let isTemplateString = false;
    let templateString = text.replace(parseText, (fullMatch,group1) => {
        isTemplateString = true;
        // todo validate against type
        return `\${vs.${group1}}`;
    })

    if (!isTemplateString)
        return `'${text}'`
    else {
        // todo add import dt
        return `dt(${currentDataVar}, vs => \`${templateString}\`)`;
    }

}

function renderNode(currentDataVar: string, node: Node): string {
    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(currentDataVar, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            return `e('${htmlElement.rawTagName}', {}, [${node.childNodes.map(_ => renderNode(currentDataVar, _)).join(', ')}])`
        case NodeType.COMMENT_NODE:
            break
    }
}

function firstElementChild(node: Node): HTMLElement {
    // todo validate there is only one child
    return node.childNodes.find(child => child.nodeType === NodeType.ELEMENT_NODE) as HTMLElement;
}

function renderFunctionImplementation(rootBodyElement: HTMLElement): string {
    let body = `export function render(viewState: ViewState): JayElement<ViewState> {\n`;
    body += '  return ' + renderNode(`viewState`, firstElementChild(rootBodyElement)) + '\n}';

    return body;
}

export function generateDefinitionFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(true, false, false),
            types,
            renderFunctionDecleration()
        ].join('\n\n');
    })
}

export function generateRuntimeFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(false, true, false),
            types,
            renderFunctionImplementation(jayFile.body)
        ].join('\n\n');
    })
}