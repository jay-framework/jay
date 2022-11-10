import {WithValidations} from "./with-validations";
export {WithValidations} from "./with-validations";
import {
    JayArrayType,
    JayAtomicType, JayComponentType, JayEnumType,
    JayFile, JayHTMLType, JayImportedType, JayImportLink,
    JayObjectType,
    JayType, JayTypeAlias,
    parseJayFile
} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";
import {Import, Imports, Ref, RenderFragment} from "./render-fragment";
import {
    parseAccessor, parseAttributeExpression, parseClassExpression, parseComponentPropExpression,
    parseCondition, parsePropertyExpression,
    parseTextExpression,
    Variables
} from './expression-compiler';
import { capitalCase } from "change-case";
import {htmlElementTagNameMap} from "./html-element-tag-name-map";
import {camelCase} from "camel-case";

function renderInterface(aType: JayType): string {

    let childInterfaces = [];

    let genInterface = '';
    if (aType instanceof JayObjectType) {
        genInterface = `export interface ${aType.name} {\n`;
        genInterface += Object
            .keys(aType.props)
            .map(prop => {
                let childType = aType.props[prop];
                if (childType instanceof JayImportedType) {
                    return `  ${prop}: ${childType.name}`;
                } else if (childType instanceof JayObjectType) {
                    childInterfaces.push(renderInterface(childType));
                    return `  ${prop}: ${childType.name}`;
                } else if (childType instanceof JayArrayType) {
                    let arrayItemType = childType.itemType;
                    if (arrayItemType instanceof JayObjectType) {
                        childInterfaces.push(renderInterface(arrayItemType));
                        return `  ${prop}: Array<${arrayItemType.name}>`;
                    } else {
                        throw new Error('not implemented yet');
                        // todo implement array of array or array of primitive
                    }
                } else if (childType instanceof JayAtomicType)
                    return `  ${prop}: ${childType.name}`;
                else if (childType instanceof JayEnumType) {
                    let genEnum = `export enum ${childType.name} {\n${childType.values.map(_ => '  ' + _).join(',\n')}\n}`;
                    childInterfaces.push(genEnum);
                    return `  ${prop}: ${childType.name}`;
                } else
                    throw new Error('unknown type');
            })
            .join(',\n');
        genInterface += '\n}';
    }
    return [...childInterfaces, genInterface].join('\n\n');
}

// exported for testing
export function generateTypes(types: JayType): string {
    return renderInterface(types);
}

enum ImportsFor {
    definition, implementation
}

function renderImports(imports: Imports, importsFor: ImportsFor, componentImports: Array<JayImportLink>): string {
    let toBeRenderedImports = [];
    if (imports.has(Import.jayElement)) toBeRenderedImports.push('JayElement');
    if (imports.has(Import.element) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('element as e');
    if (imports.has(Import.dynamicText) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('dynamicText as dt');
    if (imports.has(Import.dynamicAttribute) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('dynamicAttribute as da');
    if (imports.has(Import.dynamicProperty) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('dynamicProperty as dp');
    if (imports.has(Import.conditional) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('conditional as c');
    if (imports.has(Import.dynamicElement) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('dynamicElement as de');
    if (imports.has(Import.forEach) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('forEach');
    if (imports.has(Import.ConstructContext) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('ConstructContext');
    if (imports.has(Import.ComponentCollectionProxy)) toBeRenderedImports.push('ComponentCollectionProxy');
    if (imports.has(Import.HTMLElementCollectionProxy)) toBeRenderedImports.push('HTMLElementCollectionProxy');
    if (imports.has(Import.HTMLElementProxy)) toBeRenderedImports.push('HTMLElementProxy');
    if (imports.has(Import.childComp) && importsFor === ImportsFor.implementation) toBeRenderedImports.push('childComp');
    toBeRenderedImports.push('RenderElementOptions')
    let runtimeImport =  `import {${toBeRenderedImports.join(', ')}} from "jay-runtime";`;

    // todo validate the actual imported file
    let renderedComponentImports = componentImports.map(importStatement => {
        let symbols = importStatement.names
            .map(symbol => symbol.as?`${symbol.name} as ${symbol.as}`:symbol.name)
            .join(', ')

        return `import {${symbols}} from '${importStatement.module}';`
    });

    return [runtimeImport, ...renderedComponentImports].join('\n');
}

function renderFunctionDeclaration(typeName: string, elementName: string): string {
    return `export declare function render(viewState: ${typeName}, options?: RenderElementOptions): ${elementName}`;
}

function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
    return parseTextExpression(text, variables).map(_ => indent.firstLine + _);
}

function elementNameToJayType(element: HTMLElement): JayType {
    return htmlElementTagNameMap[element.rawTagName]?
        new JayHTMLType(htmlElementTagNameMap[element.rawTagName]) :
        new JayHTMLType('HTMLElement')
}

const propertyMapping = {
    'input:value': {type: 'property'},
    'input:checked': {type: 'property'}
}
const attributesRequiresQuotes = /[- ]/;
function renderAttributes(element: HTMLElement, dynamicRef: boolean, variables: Variables): RenderFragment {
    let attributes = element.attributes;
    let refs: Ref[] = [];
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        let attrCanonical = attrName.toLowerCase();
        let tagAttrCanonical = element.tagName.toLowerCase() + ':' + attrCanonical;
        let attrKey = attrCanonical.match(attributesRequiresQuotes) ? `"${attrCanonical}"` : attrCanonical;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby')
            return;
        if (attrCanonical === 'ref') {
            refs = [{
                ref: camelCase(attributes[attrName]),
                dynamicRef,
                elementType: elementNameToJayType(element),
                viewStateType: variables.currentType
            }];
            renderedAttributes.push(new RenderFragment(`${attrKey}: '${camelCase(attributes[attrName])}'`))
        }
        else if (attrCanonical === 'style')
            renderedAttributes.push(new RenderFragment(`style: {cssText: '${attributes[attrName]}'}`))
        else if (attrCanonical === 'class') {
            let classExpression = parseClassExpression(attributes[attrName], variables);
            renderedAttributes.push(classExpression.map(_ => `class: ${_}`))
        }
        else if (propertyMapping[tagAttrCanonical]) {
            let attributeExpression = parsePropertyExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map(_ => `${attrKey}: ${_}`))
        }
        // else if (attrCanonical === 'for') {
        //     let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
        //     renderedAttributes.push(attributeExpression.map(_ => `htmlFor: ${_}`))
        // }
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

function renderChildCompProps(element: HTMLElement, dynamicRef: boolean, variables: Variables): RenderFragment {
    let attributes = element.attributes;
    let refs: Ref[] = [];
    let props = [];
    let isPropsDirectAssignment: boolean = false;
    Object.keys(attributes).forEach(attrName => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby')
            return;
        if (attrCanonical === 'props') {
            isPropsDirectAssignment = true;
        }
        if (attrCanonical === 'ref')
            refs = [{
                ref: camelCase(attributes[attrName]),
                dynamicRef,
                elementType: new JayTypeAlias(`ReturnType<typeof ${element.rawTagName}>`),
                viewStateType: variables.currentType
            }];
        else {
            let prop = parseComponentPropExpression(attributes[attrName], variables);
            props.push(prop.map(_ => `${attrKey}: ${_}`))
        }
    })

    if (isPropsDirectAssignment) {
        let prop = parseComponentPropExpression(attributes.props, variables);
        return RenderFragment.merge(prop, new RenderFragment('', Imports.none(), [], refs));
    }
    else {
        const refsRenderFragment = new RenderFragment('', Imports.none(), [], refs);
        return props
            .reduce((prev, current) => RenderFragment.merge(prev, current, ', '), refsRenderFragment)
            .map(_ => `({${_}})`);
    }
}

function renderNode(variables: Variables, node: Node, importedSymbols: Set<string>, indent: Indent, dynamicRef: boolean): RenderFragment {

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
        if (importedSymbols.has(htmlElement.rawTagName))
            return renderNestedComponent(htmlElement, newVariables, currIndent);

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
                .map(_ => renderNode(newVariables, _, importedSymbols, childIndent, dynamicRef))
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

    function renderNestedComponent(htmlElement: HTMLElement, newVariables: Variables, currIndent: Indent = indent): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, dynamicRef, newVariables);
        let refsFragment = propsGetterAndRefs.refs.length > 0 ? `, '${propsGetterAndRefs.refs[0].ref}'`: '';
        return new RenderFragment(`${currIndent.firstLine}childComp(${htmlElement.rawTagName}, vs => ${propsGetterAndRefs.rendered}${refsFragment})`,
            Imports.for(Import.childComp).plus(propsGetterAndRefs.imports),
            propsGetterAndRefs.validations, propsGetterAndRefs.refs);
    }

    switch(node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text, indent) //.map(_ => ident + _);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isForEach(htmlElement))
                dynamicRef = true;

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
                // Todo check if type unknown throw exception
                let forEachFragment = new RenderFragment(`vs => ${forEachAccessor.render()}`, Imports.none(), forEachAccessor.validations);
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

const isComponentRef = (ref: Ref) => (ref.elementType instanceof JayComponentType)
const isCollectionRef = (ref: Ref) => (ref.dynamicRef)
const isComponentCollectionRef = (ref: Ref) => (isCollectionRef(ref) && isComponentRef(ref))

function renderFunctionImplementation(types: JayType, rootBodyElement: HTMLElement, importStatements: JayImportLink[], baseElementName: string):
    { renderedRefs: string; renderedElement: string; elementType: string; renderedImplementation: RenderFragment } {
    let variables = new Variables(types);
    let importedSymbols = new Set(importStatements.flatMap(_ => _.names.map(sym => sym.as? sym.as : sym.name)));
    let renderedRoot = renderNode(variables, firstElementChild(rootBodyElement), importedSymbols, new Indent('    '), false);
    let elementType = baseElementName + 'Element';
    let refsType = baseElementName + 'Refs';
    let imports = renderedRoot.imports.plus(Import.ConstructContext);
    let renderedRefs;
    if (renderedRoot.refs.length > 0) {
        const renderedReferences = renderedRoot.refs.map(_ => {
            let referenceType;
            if (isComponentCollectionRef(_)) {
                referenceType = `ComponentCollectionProxy<${_.viewStateType.name}, ${_.elementType.name}>`;
                imports = imports.plus(Import.ComponentCollectionProxy)
            }
            else if (isCollectionRef(_)) {
                referenceType = `HTMLElementCollectionProxy<${_.viewStateType.name}, ${_.elementType.name}>`;
                imports = imports.plus(Import.HTMLElementCollectionProxy)
            }
            else if (isComponentRef(_)) {
                referenceType = _.elementType.name;
            }
            else {
                referenceType = `HTMLElementProxy<${_.viewStateType.name}, ${_.elementType.name}>`;
                imports = imports.plus(Import.HTMLElementProxy)
            }
            return `  ${_.ref}: ${referenceType}`
        }).join(',\n');
        renderedRefs = `export interface ${refsType} {
${renderedReferences}
}`
    }
    else
        renderedRefs = `export interface ${refsType} {}`;

    let renderedElement = `export type ${elementType} = JayElement<${types.name}, ${refsType}>`

    let body = `export function render(viewState: ${types.name}, options?: RenderElementOptions): ${elementType} {
  return ConstructContext.withRootContext(viewState, () =>
${renderedRoot.rendered}, options);
}`;
    return {renderedRefs, renderedElement, elementType, renderedImplementation: new RenderFragment(body, imports)};
}

function normalizeFilename(filename: string): string {
    return filename.replace('.jay.html', '');
}

export function generateDefinitionFile(html: string, filename: string, filePath: string): WithValidations<string> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, {delimiter:''})
    let parsedFile = parseJayFile(html, baseElementName, filePath);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {renderedRefs, renderedElement, elementType, renderedImplementation} = renderFunctionImplementation(jayFile.types, jayFile.body, jayFile.imports, baseElementName);
        return [renderImports(renderedImplementation.imports.plus(Import.jayElement), ImportsFor.definition, jayFile.imports),
            types,
            renderedRefs,
            renderedElement,
            renderFunctionDeclaration(jayFile.types.name, elementType)
        ]   .filter(_ => _ !== null && _ !== '')
            .join('\n\n');
    })
}

export function generateRuntimeFile(html: string, filename: string, filePath: string): WithValidations<string> {
    const normalizedFileName = normalizeFilename(filename);
    const baseElementName = capitalCase(normalizedFileName, {delimiter:''})
    let parsedFile = parseJayFile(html, baseElementName, filePath);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {renderedRefs, renderedElement, renderedImplementation} = renderFunctionImplementation(jayFile.types, jayFile.body, jayFile.imports, baseElementName);
        return [renderImports(renderedImplementation.imports.plus(Import.element).plus(Import.jayElement), ImportsFor.implementation, jayFile.imports),
            types,
            renderedRefs,
            renderedElement,
            renderedImplementation.rendered
        ]   .filter(_ => _ !== null && _ !== '')
            .join('\n\n');
    })
}