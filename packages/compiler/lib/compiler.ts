import {pascalCase} from 'change-case';
import {WithValidations} from "./with-validations";
import {isArrayType, isObjectType, JayFile, JayType, parseJayFile} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";
import {Import, Imports, RenderFragment} from "./render-fragment";


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


function renderImports(imports: Imports): string {
    let renderedImports = [];
    if (imports.has(Import.jayElement)) renderedImports.push('JayElement');
    if (imports.has(Import.element)) renderedImports.push('element as e');
    if (imports.has(Import.dynamicText)) renderedImports.push('dynamicText as dt');
    if (imports.has(Import.conditional)) renderedImports.push('conditional as c');
    return `import {${renderedImports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

const multiplePlaceholders = /{(.+?)}/g;
function renderTextNode(currentDataVar: string, text: string): RenderFragment {

    let renderedText = text;
    let m;
    let hasPlaceholders = false;
    let onlyPlaceholder = false;
    while((m = multiplePlaceholders.exec(renderedText)) !== null) {
        hasPlaceholders = true;
        if (m[0].length === renderedText.length) {
            onlyPlaceholder = true;
            renderedText = renderedText.replace(m[0], `vs.${m[1]}`);
        }
        else
            renderedText = renderedText.replace(m[0], `\${vs.${m[1]}}`);
    }
    if (!hasPlaceholders)
        return new RenderFragment(`'${text}'`, Imports.none())
    else if (onlyPlaceholder)
        return new RenderFragment(`dt(${currentDataVar}, vs => ${renderedText})`, Imports.for(Import.dynamicText));
    else
        return new RenderFragment(`dt(${currentDataVar}, vs => \`${renderedText}\`)`, Imports.for(Import.dynamicText));

}

function renderAttributes(element: HTMLElement): string {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        if (attrName === 'if')
            return;
        if (attrName === 'style')
            renderedAttributes.push(`style: {cssText: '${attributes[attrName]}'}`)
        else
            renderedAttributes.push(`${attrName}: '${attributes[attrName]}'`)
    })
    return `{${renderedAttributes.join(', ')}}`;
}

function renderNode(currentDataVar: string, node: Node, firstLineIdent: string, ident: string): RenderFragment {
    function renderHtmlElement(htmlElement) {
        let childNodes = node.childNodes
            .filter(_ => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '');

        let childLineBreaks = childNodes.length > 1;

        let childRenders = childNodes
            .map(_ => renderNode(currentDataVar, _, childLineBreaks ? ident + '  ' : '', ident + '  '))
            .reduce((prev, current) => RenderFragment.merge(prev, current), RenderFragment.empty())
            .map(children => childLineBreaks ? `\n${children}\n` : children);

        let attributes = renderAttributes(htmlElement);

        return new RenderFragment(`${firstLineIdent}e('${htmlElement.rawTagName}', ${attributes}, [${childRenders.rendered}${childLineBreaks ? ident : ''}])`,
            childRenders.imports.plus(Import.element));
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(currentDataVar, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (htmlElement.hasAttribute('if')) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement);
                return new RenderFragment(`${firstLineIdent}c((vs) => vs.${condition},\n${ident}${childElement.rendered}\n${firstLineIdent})`,
                    childElement.imports.plus(Import.conditional));
            }
            else {
                return renderHtmlElement(htmlElement);
            }
        case NodeType.COMMENT_NODE:
            break
    }
}

function firstElementChild(node: Node): HTMLElement {
    // todo validate there is only one child
    return node.childNodes.find(child => child.nodeType === NodeType.ELEMENT_NODE) as HTMLElement;
}

function renderFunctionImplementation(rootBodyElement: HTMLElement): RenderFragment {
    let renderedRoot = renderNode(`viewState`, firstElementChild(rootBodyElement), '', '  ');
    let body = `export function render(viewState: ViewState): JayElement<ViewState> {
  return ${renderedRoot.rendered};
}`;
    return new RenderFragment(body, renderedRoot.imports);
}

export function generateDefinitionFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(Imports.for(Import.jayElement)),
            types,
            renderFunctionDecleration()
        ].join('\n\n');
    })
}

export function generateRuntimeFile(html): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let renderedImplementation = renderFunctionImplementation(jayFile.body);
        return [renderImports(renderedImplementation.imports.plus(Import.element).plus(Import.jayElement)),
            types,
            renderedImplementation.rendered
        ].join('\n\n');
    })
}