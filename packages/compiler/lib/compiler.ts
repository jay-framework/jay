import {pascalCase} from 'change-case';
import pluralize from 'pluralize';
import {WithValidations} from "./with-validations";
import {isArrayType, isObjectType, JayFile, JayType, parseJayFile} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";
import {Import, Imports, RenderFragment} from "./render-fragment";
import {
    parseAccessorFunc,
    parseCondition,
    parseIdentifier,
    parseTextExpression,
    Variables
} from './expression-compiler';

function toInterfaceName(name) {
    return pascalCase(pluralize.singular(name))
}

function renderInterface(types: JayType, name: String): string {

    let childInterfaces = [];

    let genInterface = `interface ${name} {\n`;
    genInterface += Object
        .keys(types)
        .map(prop => {
            if (isObjectType(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop] as JayType, toInterfaceName(name)));
                return `  ${prop}: ${toInterfaceName(name)}`;
            }
            else if (isArrayType(types[prop])) {
                let name = prop;
                childInterfaces.push(renderInterface(types[prop][0] as JayType, toInterfaceName(name)));
                return `  ${prop}: Array<${toInterfaceName(name)}>`;
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
    if (imports.has(Import.dynamicElement)) renderedImports.push('dynamicElement as de');
    if (imports.has(Import.forEach)) renderedImports.push('forEach');
    return `import {${renderedImports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

function renderTextNode(currentDataVar: string, text: string): RenderFragment {
    return parseTextExpression(text, new Variables(currentDataVar, {}));
}

function renderAttributes(element: HTMLElement): string {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        if (attrName === 'if' || attrName === 'forEach' || attrName === 'item' || attrName === 'trackBy')
            return;
        if (attrName === 'style')
            renderedAttributes.push(`style: {cssText: '${attributes[attrName]}'}`)
        else
            renderedAttributes.push(`${attrName}: '${attributes[attrName]}'`)
    })
    return `{${renderedAttributes.join(', ')}}`;
}

function renderNode(currentDataVar: string, node: Node, firstLineIdent: string, ident: string): RenderFragment {

    function de(tagName: string, attributes: string, children: RenderFragment, childLineBreaks: boolean): RenderFragment {
        return new RenderFragment(`${firstLineIdent}de('${tagName}', ${attributes}, [${children.rendered}${childLineBreaks ? ident : ''}], ${currentDataVar})`,
            children.imports.plus(Import.dynamicElement),
            children.validations);
    }

    function e(tagName: string, attributes: string, children: RenderFragment, childLineBreaks: boolean): RenderFragment {
        return new RenderFragment(`${firstLineIdent}e('${tagName}', ${attributes}, [${children.rendered}${childLineBreaks ? ident : ''}])`,
            children.imports.plus(Import.element),
            children.validations);
    }

    function isConditional(node: Node): boolean {
        return (node.nodeType !== NodeType.TEXT_NODE) && (node as HTMLElement).hasAttribute('if');
    }

    function isForEach(node: Node): boolean {
        return (node.nodeType !== NodeType.TEXT_NODE) && (node as HTMLElement).hasAttribute('forEach');
    }

    function renderHtmlElement(htmlElement, newDataVar: string) {
        let childNodes = node.childNodes
            .filter(_ => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '');

        let childLineBreaks = childNodes.length > 1;

        let needDynamicElement = childNodes
            .map(_ => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childRenders = childNodes
            .map(_ => renderNode(newDataVar, _, childLineBreaks ? ident + '  ' : '', ident + '  '))
            .reduce((prev, current) => RenderFragment.merge(prev, current, ',\n'), RenderFragment.empty())
            .map(children => childLineBreaks ? `\n${children}\n` : children);

        let attributes = renderAttributes(htmlElement);

        if (needDynamicElement)
            return de(htmlElement.rawTagName, attributes, childRenders, childLineBreaks);
        else
            return e(htmlElement.rawTagName, attributes, childRenders, childLineBreaks);
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(`${firstLineIdent}c(${renderedCondition.rendered},\n${ident}${childElement.rendered}\n${firstLineIdent})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations]);
    }

    function renderForEach(renderedForEach: RenderFragment, collectionDataVar: RenderFragment, trackBy: string, childElement: RenderFragment) {
        return new RenderFragment(`${firstLineIdent}forEach(${renderedForEach.rendered}, (${collectionDataVar.rendered}: Item) => {
${ident}return ${childElement.rendered}}, '${trackBy}')`, childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...collectionDataVar.validations, ...childElement.validations])
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(currentDataVar, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, currentDataVar);
                let renderedCondition = parseCondition(condition, new Variables(currentDataVar, {}));
                return c(renderedCondition, childElement);
            }
            else if (isForEach(htmlElement)) {
                let forEach = htmlElement.getAttribute('forEach');
                let item = htmlElement.getAttribute('item');
                let trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                let renderedForEach = parseAccessorFunc(forEach, new Variables(currentDataVar, {}));
                let collectionDataVar = parseIdentifier(item, new Variables(currentDataVar, {}));

                let childElement = renderHtmlElement(htmlElement, item);
                return renderForEach(renderedForEach, collectionDataVar, trackBy, childElement);

                
            }
            else {
                return renderHtmlElement(htmlElement, currentDataVar);
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