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
    parseAccessor, parseAttributeExpression, parseClassExpression,
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
    if (imports.has(Import.dynamicAttribute) && importsFor === ImportsFor.implementation) renderedImports.push('dynamicAttribute as da');
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

function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
    return parseTextExpression(text, variables).map(_ => indent.firstLine + _);
}

const attributesRequiresQoutes = /[- ]/;
function renderAttributes(element: HTMLElement, dynamicRef: boolean, variables: Variables): RenderFragment {
    let attributes = element.attributes;
    let refs: Ref[] = [];
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrCanonical.match(attributesRequiresQoutes) ? `"${attrCanonical}"` : attrCanonical;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby')
            return;
        if (attrCanonical === 'ref')
            refs = [{ref: attributes[attrName], dynamicRef, refType: variables.currentType}];
        if (attrCanonical === 'style')
            renderedAttributes.push(new RenderFragment(`style: {cssText: '${attributes[attrName]}'}`))
        else if (attrCanonical === 'class') {
            let classExpression = parseClassExpression(attributes[attrName], variables);
            renderedAttributes.push(classExpression.map(_ => `className: ${_}`))
        }
        else if (attrCanonical === 'for') {
            let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map(_ => `htmlFor: ${_}`))
        }
        else {
            let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map(_ => `${attrKey}: ${_}`))
        }
    })

    const refsRenderFragment = new RenderFragment('', Imports.none(), [], refs);
    return renderedAttributes
        .reduce((prev, current) => RenderFragment.merge(prev, current, ', '), refsRenderFragment)
        .map(_ => `{${_}}`);
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

class Indent {
    private readonly base: string
    readonly firstLineBreak: boolean
    readonly lastLineIndent: boolean
    constructor(parent: string, firstLineBreak = true, lastLineIndent = false) {
        this.base = parent;
        this.firstLineBreak = firstLineBreak;
        this.lastLineIndent = lastLineIndent;
    }
    get firstLine(): string {
        return this.firstLineBreak?this.base:'';
    }
    get curr(): string {
        return this.base + '  ';
    }
    get lastLine(): string {
        return this.lastLineIndent? this.base:'';
    }

    child(): Indent {
        return new Indent(this.base + '  ')
    }

    noFirstLineBreak() {
        return new Indent(this.base, false)
    }
    withLastLineBreak() {
        return new Indent(this.base, false, true)
    }
}

function renderNode(variables: Variables, node: Node, indent: Indent, dynamicRef: boolean): RenderFragment {

    function de(tagName: string, attributes: RenderFragment, children: RenderFragment, currIndent: Indent = indent): RenderFragment {
        return new RenderFragment(`${currIndent.firstLine}de('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}])`,
            children.imports.plus(Import.dynamicElement).plus(attributes.imports),
            [...attributes.validations, ...children.validations],
            [...attributes.refs, ...children.refs]);
    }

    function e(tagName: string, attributes: RenderFragment, children: RenderFragment, currIndent: Indent = indent): RenderFragment {
        return new RenderFragment(`${currIndent.firstLine}e('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}])`,
            children.imports.plus(Import.element).plus(attributes.imports),
            [...attributes.validations, ...children.validations],
            [...attributes.refs, ...children.refs]);
    }

    function renderHtmlElement(htmlElement, newVariables: Variables, currIndent: Indent = indent) {
        let childNodes = node.childNodes.length > 1 ?
            node.childNodes.filter(_ => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '') :
            node.childNodes;

        let childIndent = currIndent.child();
        if ((childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE))
            childIndent = childIndent.noFirstLineBreak();

        let needDynamicElement = childNodes
            .map(_ => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childRenders = childNodes.length === 0 ?
            RenderFragment.empty() :
            childNodes
                .map(_ => renderNode(newVariables, _, childIndent, dynamicRef))
                .reduce((prev, current) => RenderFragment.merge(prev, current, ',\n'), RenderFragment.empty())
                .map(children => childIndent.firstLineBreak ? `\n${children}\n${currIndent.firstLine}` : children);

        let attributes = renderAttributes(htmlElement, dynamicRef, newVariables);

        if (needDynamicElement)
            return de(htmlElement.rawTagName, attributes, childRenders, currIndent);
        else
            return e(htmlElement.rawTagName, attributes, childRenders, currIndent);
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(`${indent.firstLine}c(${renderedCondition.rendered},\n${childElement.rendered}\n${indent.firstLine})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations],
            [...renderedCondition.refs, ...childElement.refs]);
    }

    function renderForEach(renderedForEach: RenderFragment, collectionVariables: Variables, trackBy: string, childElement: RenderFragment) {
        return new RenderFragment(`${indent.firstLine}forEach(${renderedForEach.rendered}, (${collectionVariables.currentVar}: ${collectionVariables.currentType.name}) => {
${indent.curr}return ${childElement.rendered}}, '${trackBy}')`, childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...childElement.validations], childElement.refs)
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text, indent) //.map(_ => ident + _);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isForEach(htmlElement))
                dynamicRef = true;
            let refs = [];
            if (htmlElement.hasAttribute('ref'))
                refs.push({'ref': htmlElement.getAttribute('ref'), dynamicRef})

            if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, variables, indent.child());
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
                let childElement = renderHtmlElement(htmlElement, forEachVariables, indent.child().noFirstLineBreak().withLastLineBreak());
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
    let renderedRoot = renderNode(variables, firstElementChild(rootBodyElement), new Indent('    '), false);
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
  return ConstructContext.withRootContext(viewState, () =>
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