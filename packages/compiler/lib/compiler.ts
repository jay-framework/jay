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
import {Import, Imports, Ref, RenderFragment} from "./render-fragment";
import {
    parseAccessor,
    parseCondition,
    parseTextExpression,
    Variables
} from './expression-compiler';
import { capitalCase } from "change-case";

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

// exported for testing
export function generateTypes(types: JayObjectType): string {
    return renderInterface(types);
}

enum ImportsFor {
    definition, implementation
}

function renderImports(imports: Imports, importsFor: ImportsFor): string {
    let renderedImports = [];
    if (imports.has(Import.jayElement)) renderedImports.push('JayElement');
    if (imports.has(Import.element) && importsFor === ImportsFor.implementation) renderedImports.push('element as e');
    if (imports.has(Import.dynamicText) && importsFor === ImportsFor.implementation) renderedImports.push('dynamicText as dt');
    if (imports.has(Import.conditional) && importsFor === ImportsFor.implementation) renderedImports.push('conditional as c');
    if (imports.has(Import.dynamicElement) && importsFor === ImportsFor.implementation) renderedImports.push('dynamicElement as de');
    if (imports.has(Import.forEach) && importsFor === ImportsFor.implementation) renderedImports.push('forEach');
    if (imports.has(Import.ConstructContext) && importsFor === ImportsFor.implementation) renderedImports.push('ConstructContext');
    if (imports.has(Import.DynamicReference)) renderedImports.push('DynamicReference');
    return `import {${renderedImports.join(', ')}} from "jay-runtime";`;
}

function renderFunctionDecleration(elementName?: string): string {
    return `export declare function render(viewState: ViewState): ${elementName? elementName:'JayElement<ViewState>'}`;
}

function renderTextNode(variables: Variables, text: string): RenderFragment {
    return parseTextExpression(text, variables);
}

const attributesRequiresQoutes = /[- ]/;
function renderAttributes(element: HTMLElement, dynamicRef: boolean, variables: Variables): {attributes: string, refs: Ref[]} {
    let attributes = element.attributes;
    let refs: Ref[] = [];
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        if (attrName === 'if' || attrName === 'forEach' || attrName === 'trackBy')
            return;
        if (attrName === 'ref')
            refs = [{ref: attributes[attrName], dynamicRef, refType: variables.currentType}];
        if (attrName === 'style')
            renderedAttributes.push(`style: {cssText: '${attributes[attrName]}'}`)
        else {
            let attrKey = attrName.match(attributesRequiresQoutes) ? `"${attrName}"` : attrName;
            renderedAttributes.push(`${attrKey}: '${attributes[attrName]}'`)
        }
    })
    return {attributes:`{${renderedAttributes.join(', ')}}`, refs};
}

function isConditional(node: Node): boolean {
    return (node.nodeType !== NodeType.TEXT_NODE) && (node as HTMLElement).hasAttribute('if');
}

function isForEach(node: Node): boolean {
    return (node.nodeType !== NodeType.TEXT_NODE) && (node as HTMLElement).hasAttribute('forEach');
}

function findRefs(node: Node, dynamicRef: boolean): {ref: string, dynamicRef: boolean}[] {
    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            return []
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isForEach(htmlElement))
                dynamicRef = true;
            let refs = [];
            if (htmlElement.hasAttribute('ref'))
                refs.push({'ref': htmlElement.getAttribute('ref'), dynamicRef})

            return [...refs, ...htmlElement.childNodes.flatMap(_ => findRefs(_, dynamicRef))]
        case NodeType.COMMENT_NODE:
            return []
    }

}

function renderNode(variables: Variables, node: Node, firstLineIdent: string, ident: string, dynamicRef: boolean): RenderFragment {

    function de(tagName: string, attributes: string, children: RenderFragment, childLineBreaks: boolean, refs: Ref[]): RenderFragment {
        return new RenderFragment(`${firstLineIdent}de('${tagName}', ${attributes}, [${children.rendered}${childLineBreaks ? ident : ''}], ${variables.currentContext})`,
            children.imports.plus(Import.dynamicElement),
            children.validations, [...refs, ...children.refs]);
    }

    function e(tagName: string, attributes: string, children: RenderFragment, childLineBreaks: boolean, refs: Ref[]): RenderFragment {
        let needContext = refs.length > 0;
        return new RenderFragment(`${firstLineIdent}e('${tagName}', ${attributes}, [${children.rendered}${childLineBreaks ? ident : ''}]${needContext?', '+variables.currentContext:''})`,
            children.imports.plus(Import.element),
            children.validations, [...refs, ...children.refs]);
    }

    function renderHtmlElement(htmlElement, newVariables: Variables) {
        let childNodes = node.childNodes
            .filter(_ => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '');

        let childLineBreaks = childNodes.length > 1;

        let needDynamicElement = childNodes
            .map(_ => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childRenders = childNodes
            .map(_ => renderNode(newVariables, _, childLineBreaks ? ident + '  ' : '', ident + '  ', dynamicRef))
            .reduce((prev, current) => RenderFragment.merge(prev, current, ',\n'), RenderFragment.empty())
            .map(children => childLineBreaks ? `\n${children}\n` : children);

        let {attributes, refs} = renderAttributes(htmlElement, dynamicRef, newVariables);

        if (needDynamicElement)
            return de(htmlElement.rawTagName, attributes, childRenders, childLineBreaks, refs);
        else
            return e(htmlElement.rawTagName, attributes, childRenders, childLineBreaks, refs);
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(`${firstLineIdent}c(${renderedCondition.rendered},\n${ident}${childElement.rendered}\n${firstLineIdent})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations],
            [...renderedCondition.refs, ...childElement.refs]);
    }

    function renderForEach(renderedForEach: RenderFragment, collectionVariables: Variables, trackBy: string, childElement: RenderFragment) {
        return new RenderFragment(`${firstLineIdent}forEach(${renderedForEach.rendered}, (${collectionVariables.currentVar}: Item) => {
${ident}const ${collectionVariables.currentContext} = ${collectionVariables.parent.currentContext}.forItem(${collectionVariables.currentVar});
${ident}return ${childElement.rendered}}, '${trackBy}')`, childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...childElement.validations], childElement.refs)
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isForEach(htmlElement))
                dynamicRef = true;
            let refs = [];
            if (htmlElement.hasAttribute('ref'))
                refs.push({'ref': htmlElement.getAttribute('ref'), dynamicRef})

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
                let itemType = (forEachAccessor.resolvedType as JayArrayType).itemType;
                let forEachVariables = variables.childVariableFor(itemType)
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

function generateElementType(rootBodyElement: HTMLElement, filename?: string): {elementName?: string, elementType?: string, hasRefs: boolean} {
    let refs = findRefs(firstElementChild(rootBodyElement), false)

    if (refs.length > 0) {
        //todo
        let elementName = capitalCase(filename, {delimiter:''}) + 'Element';
        return {elementName, hasRefs: true, elementType: `export interface ${elementName} extends JayElement<ViewState> {
${refs.map(_ => `  ${_.ref}: ${_.dynamicRef?'DynamicReference<???>':'HTMLElement'}`).join(',\n')} 
}`}
    }
    else
        return {hasRefs: false};
}

function renderFunctionImplementation(types: JayType, rootBodyElement: HTMLElement, filename: string):
    {elementName: string, elementType: string, renderedImplementation: RenderFragment} {
    let variables = new Variables(types);
    let renderedRoot = renderNode(variables, firstElementChild(rootBodyElement), '', '  ', false);
    let elementName = 'JayElement<ViewState>';
    let defaultElementName = true;
    let elementType = null;
    let imports = renderedRoot.imports.plus(Import.ConstructContext);
    if (renderedRoot.refs.length > 0) {
        elementName = capitalCase(filename, {delimiter:''}) + 'Element';
        defaultElementName = false;
        const renderedReferences = renderedRoot.refs.map(_ => {
            const referenceType = _.dynamicRef?`DynamicReference<${_.refType.name}>`:'HTMLElement';
            return `  ${_.ref}: ${referenceType}`
        }).join(',\n');
        elementType = `export interface ${elementName} extends JayElement<ViewState> {
${renderedReferences} 
}`
        if (renderedRoot.refs.find(_ => _.dynamicRef))
            imports = imports.plus(Import.DynamicReference)
    }

    let body = `export function render(viewState: ViewState): ${elementName?elementName:'JayElement<ViewState>'} {
  return ConstructContext.withRootContext(viewState, (${variables.currentContext}: ConstructContext<[ViewState]>) =>
      ${renderedRoot.rendered})${!defaultElementName?` as ${elementName}`:''};
}`;
    return {elementName, elementType, renderedImplementation: new RenderFragment(body, imports)};
}

function normalizeFilename(filename: string): string {
    return filename.replace('.jay.html', '');
}

export function generateDefinitionFile(html: string, filename: string): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {elementName, elementType, renderedImplementation} = renderFunctionImplementation(jayFile.types, jayFile.body, normalizeFilename(filename));
        return [renderImports(renderedImplementation.imports.plus(Import.jayElement), ImportsFor.definition),
            types,
            elementType,
            renderFunctionDecleration(elementName)
        ]   .filter(_ => _ !== null)
            .join('\n\n');
    })
}

export function generateRuntimeFile(html: string, filename: string): WithValidations<string> {
    let parsedFile = parseJayFile(html);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {elementType, renderedImplementation} = renderFunctionImplementation(jayFile.types, jayFile.body, normalizeFilename(filename));
        return [renderImports(renderedImplementation.imports.plus(Import.element).plus(Import.jayElement), ImportsFor.implementation),
            types,
            elementType,
            renderedImplementation.rendered
        ]   .filter(_ => _ !== null)
            .join('\n\n');
    })
}