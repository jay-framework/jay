import {WithValidations} from "./with-validations";
import {
    JayArrayType,
    JayAtomicType,
    JayFile,
    JayObjectType,
    JayType,
    parseJayFile
} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";
import {Import, Imports, RenderFragment} from "./render-fragment";
import {
    parseAccessor,
    parseCondition,
    parseTextExpression,
    Variables
} from './expression-compiler';

function renderInterface(aType: JayObjectType): string {

    let childInterfaces = [];

    let genInterface = `interface ${aType.name} {\n`;
    genInterface += Object
        .keys(aType.props)
        .map(prop => {
            let childType = aType.props[prop];
            if (childType instanceof JayObjectType) {
                childInterfaces.push(renderInterface(childType));
                return `  ${prop}: ${childType.name}`;
            }
            else if (childType instanceof JayArrayType) {
                let arrayItemType = childType.itemType;
                if (arrayItemType instanceof JayObjectType) {
                    childInterfaces.push(renderInterface(arrayItemType));
                    return `  ${prop}: Array<${arrayItemType.name}>`;
                }
                else {
                    throw new Error('not implemented yet');
                    // todo implement array of array or array of primitive
                }
            }
            else if (childType instanceof JayAtomicType)
                return `  ${prop}: ${childType.name}`;
            else
                throw new Error('unknown type');
        })
        .join(',\n');
    genInterface += '\n}';
    return [...childInterfaces, genInterface].join('\n\n');
}

export function generateTypes(types: JayObjectType): string {
    return renderInterface(types);
}


function renderImports(imports: Imports): string {
    let renderedImports = [];
    if (imports.has(Import.jayElement)) renderedImports.push('JayElement');
    if (imports.has(Import.element)) renderedImports.push('element as e');
    if (imports.has(Import.dynamicText)) renderedImports.push('dynamicText as dt');
    if (imports.has(Import.conditional)) renderedImports.push('conditional as c');
    if (imports.has(Import.dynamicElement)) renderedImports.push('dynamicElement as de');
    if (imports.has(Import.forEach)) renderedImports.push('forEach');
    if (imports.has(Import.ConstructContext)) renderedImports.push('ConstructContext');
    return `import {${renderedImports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(): string {
    return `export declare function render(viewState: ViewState): JayElement<ViewState>`;
}

function renderTextNode(variables: Variables, text: string): RenderFragment {
    return parseTextExpression(text, variables);
}

function renderAttributes(element: HTMLElement): string {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        if (attrName === 'if' || attrName === 'forEach' || attrName === 'trackBy')
            return;
        if (attrName === 'style')
            renderedAttributes.push(`style: {cssText: '${attributes[attrName]}'}`)
        else
            renderedAttributes.push(`${attrName}: '${attributes[attrName]}'`)
    })
    return `{${renderedAttributes.join(', ')}}`;
}

function renderNode(variables: Variables, node: Node, firstLineIdent: string, ident: string): RenderFragment {

    function de(tagName: string, attributes: string, children: RenderFragment, childLineBreaks: boolean): RenderFragment {
        return new RenderFragment(`${firstLineIdent}de('${tagName}', ${attributes}, [${children.rendered}${childLineBreaks ? ident : ''}], ${variables.currentContext})`,
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

    function renderHtmlElement(htmlElement, newVariables: Variables) {
        let childNodes = node.childNodes
            .filter(_ => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '');

        let childLineBreaks = childNodes.length > 1;

        let needDynamicElement = childNodes
            .map(_ => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childRenders = childNodes
            .map(_ => renderNode(newVariables, _, childLineBreaks ? ident + '  ' : '', ident + '  '))
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

    function renderForEach(renderedForEach: RenderFragment, collectionVariables: Variables, trackBy: string, childElement: RenderFragment) {
        // todo item type
        return new RenderFragment(`${firstLineIdent}forEach(${renderedForEach.rendered}, (${collectionVariables.currentVar}: Item) => {
${ident}const ${collectionVariables.currentContext} = ${collectionVariables.parent.currentContext}.forItem(${collectionVariables.currentVar});
${ident}return ${childElement.rendered}}, '${trackBy}')`, childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...childElement.validations])
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, variables);
                let renderedCondition = parseCondition(condition, variables);
                return c(renderedCondition, childElement);
            }
            else if (isForEach(htmlElement)) {
                let forEach = htmlElement.getAttribute('forEach'); // todo extract type
                let trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                let forEachAccessor = parseAccessor(forEach, variables);
                let forEachFragment = new RenderFragment(`vs => vs.${forEachAccessor.render()}`, Imports.none(), forEachAccessor.validations);
                let forEachVariables = variables.childVariableFor(forEachAccessor.resolvedType)

                let childElement = renderHtmlElement(htmlElement, forEachVariables);
                return renderForEach(forEachFragment, forEachVariables, trackBy, childElement);

                
            }
            else {
                return renderHtmlElement(htmlElement, variables);
            }
        case NodeType.COMMENT_NODE:
            break
    }
}

function firstElementChild(node: Node): HTMLElement {
    // todo validate there is only one child
    return node.childNodes.find(child => child.nodeType === NodeType.ELEMENT_NODE) as HTMLElement;
}

function renderFunctionImplementation(types: JayType, rootBodyElement: HTMLElement): RenderFragment {
    let variables = new Variables(types);
    let renderedRoot = renderNode(variables, firstElementChild(rootBodyElement), '', '  ');
    let body = `export function render(viewState: ViewState): JayElement<ViewState> {
  return ConstructContext.withRootContext(viewState, (${variables.currentContext}: ConstructContext<[ViewState]>) =>
      ${renderedRoot.rendered});
}`;
    return new RenderFragment(body, renderedRoot.imports.plus(Import.ConstructContext));
}

export function generateDefinitionFile(html: string): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        return [renderImports(Imports.for(Import.jayElement)),
            types,
            renderFunctionDecleration()
        ].join('\n\n');
    })
}

export function generateRuntimeFile(html: string): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let renderedImplementation = renderFunctionImplementation(jayFile.types, jayFile.body);
        return [renderImports(renderedImplementation.imports.plus(Import.element).plus(Import.jayElement)),
            types,
            renderedImplementation.rendered
        ].join('\n\n');
    })
}