import {WithValidations} from "./with-validations";
import {
    JayArrayType,
    JayAtomicType, JayComponentType, JayEnumType,
    JayFile, JayHTMLType, JayImportedType, JayImportLink,
    JayObjectType,
    JayType, JayTypeAlias, JayUnknown,
    parseJayFile
} from "./parse-jay-file";
import {HTMLElement, NodeType} from "node-html-parser";
import Node from "node-html-parser/dist/nodes/node";
import {Ref, RenderFragment} from "./render-fragment";
import {
    parseAccessor, parseAttributeExpression, parseClassExpression, parseComponentPropExpression,
    parseCondition, parsePropertyExpression,
    parseTextExpression,
    Variables
} from './expression-compiler';
import {htmlElementTagNameMap} from "./html-element-tag-name-map";
import {camelCase} from "camel-case";
import {Import, Imports, ImportsFor} from "./imports";

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


function renderImports(imports: Imports, importsFor: ImportsFor, componentImports: Array<JayImportLink>, refImportsInUse: Set<string>): string {
    let runtimeImport = imports.render(importsFor);

    // todo validate the actual imported file
    let renderedComponentImports = componentImports.map(importStatement => {
        let symbols = importStatement.names
            .map(symbol => symbol.as?`${symbol.name} as ${symbol.as}`:symbol.name)
            .join(', ')

        let imports = [];
        importStatement.names
          .filter(symbol => symbol.type instanceof JayImportedType && symbol.type.type instanceof JayComponentType)
          .map(symbol => ((symbol.type as JayImportedType).type as JayComponentType).name)
          .filter(compType => refImportsInUse.has(compType+'Ref') || refImportsInUse.has(compType+'Refs'))
          .map(compType => {
              let importSymbols = []
              if (refImportsInUse.has(compType+'Ref'))
                  importSymbols.push(compType+'Ref')
              if (refImportsInUse.has(compType+'Refs'))
                  importSymbols.push(compType+'Refs')
              imports.push(`import {${importSymbols.join(', ')}} from '${importStatement.module}-refs';`)
          })
        imports.push(`import {${symbols}} from '${importStatement.module}';`);
        return imports.join('\n');
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
    let renderedAttributes = [];
    Object.keys(attributes).forEach(attrName => {
        let attrCanonical = attrName.toLowerCase();
        let tagAttrCanonical = element.tagName.toLowerCase() + ':' + attrCanonical;
        let attrKey = attrCanonical.match(attributesRequiresQuotes) ? `"${attrCanonical}"` : attrCanonical;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby' || attrCanonical === 'ref')
            return;
        if (attrCanonical === 'style')
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

    return renderedAttributes
        .reduce((prev, current) => RenderFragment.merge(prev, current, ', '), RenderFragment.empty())
        .map(_ => `{${_}}`);
}

function renderElementRef(element: HTMLElement, dynamicRef: boolean, variables: Variables): RenderFragment {
    if (element.attributes.ref) {
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let constName = camelCase(`ref ${refName}`)
        let refs = [{
            ref: refName,
            originalName,
            constName,
            dynamicRef,
            elementType: elementNameToJayType(element),
            viewStateType: variables.currentType
        }];
        if (dynamicRef) {
            return new RenderFragment(`${constName}()`, Imports.for(Import.elemCollectionRef), [], refs)
        }
        else
            return new RenderFragment(`er('${refName}')`, Imports.for(Import.elemRef), [], refs)
    }
    else
        return RenderFragment.empty();
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
    let props = [];
    let isPropsDirectAssignment: boolean = false;
    let imports = Imports.none();
    Object.keys(attributes).forEach(attrName => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby')
            return;
        if (attrCanonical === 'props') {
            isPropsDirectAssignment = true;
        }
        if (attrCanonical === 'ref') {
            return;
        }
        else {
            let prop = parseComponentPropExpression(attributes[attrName], variables);
            props.push(prop.map(_ => `${attrKey}: ${_}`))
        }
    })

    if (isPropsDirectAssignment) {
        let prop = parseComponentPropExpression(attributes.props, variables);
        return RenderFragment.merge(prop, new RenderFragment('', imports, [], []));
    }
    else {
        return props
            .reduce((prev, current) => RenderFragment.merge(prev, current, ', '), RenderFragment.empty())
            .map(_ => `({${_}})`);
    }
}

function renderChildCompRef(element: HTMLElement, dynamicRef: boolean, variables: Variables): RenderFragment {
    if (element.attributes.ref) {
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let constName = camelCase(`ref ${refName}`)
        let refs = [{
            ref: refName,
            originalName,
            constName,
            dynamicRef,
            elementType: new JayComponentType(element.rawTagName, []),
            viewStateType: variables.currentType
        }];
        if (dynamicRef) {
            return new RenderFragment(`${constName}()`, Imports.for(Import.compCollectionRef, Import.sandboxCompCollectionRef), [], refs)
        }
        else
            return new RenderFragment(`cr('${refName}')`, Imports.for(Import.compRef, Import.sandboxCompRef), [], refs)
    }
    else
        return RenderFragment.empty();
}


function renderNode(variables: Variables, node: Node, importedSymbols: Set<string>, indent: Indent, dynamicRef: boolean): RenderFragment {

    function de(tagName: string, attributes: RenderFragment, children: RenderFragment, ref: RenderFragment, currIndent: Indent = indent): RenderFragment {
        const refWithPrefixComma = ref.rendered.length? `, ${ref.rendered}`:'';
        return new RenderFragment(`${currIndent.firstLine}de('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports.plus(Import.dynamicElement).plus(attributes.imports).plus(ref.imports),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs]);
    }

    function e(tagName: string, attributes: RenderFragment, children: RenderFragment, ref: RenderFragment, currIndent: Indent = indent): RenderFragment {
        const refWithPrefixComma = ref.rendered.length? `, ${ref.rendered}`:'';
        return new RenderFragment(`${currIndent.firstLine}e('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports.plus(Import.element).plus(attributes.imports).plus(ref.imports),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs]);
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
        let renderedRef = renderElementRef(htmlElement, dynamicRef, newVariables);

        if (needDynamicElement)
            return de(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
        else
            return e(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
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
        let renderedRef = renderChildCompRef(htmlElement, dynamicRef, newVariables);
        if (renderedRef.rendered !== '')
            renderedRef = renderedRef.map(_ => ', ' + _)
        let getProps = `(vs: ${newVariables.currentType.name}) => ${propsGetterAndRefs.rendered}`
        return new RenderFragment(`${currIndent.firstLine}childComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
            Imports.for(Import.childComp).plus(propsGetterAndRefs.imports).plus(renderedRef.imports),
            propsGetterAndRefs.validations, renderedRef.refs);
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
                if (forEachAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [`forEach directive - failed to resolve type for forEach=${forEach}`]);
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

const isComponentRef = (ref: Ref) => (ref.elementType instanceof JayComponentType || ref.elementType instanceof JayTypeAlias)
const isCollectionRef = (ref: Ref) => (ref.dynamicRef)
const isComponentCollectionRef = (ref: Ref) => (isCollectionRef(ref) && isComponentRef(ref))

function renderFunctionImplementation(types: JayType, rootBodyElement: HTMLElement, importStatements: JayImportLink[], baseElementName: string):
    { renderedRefs: string; renderedElement: string; elementType: string; renderedImplementation: RenderFragment; refImportsInUse: Set<string> } {
    let variables = new Variables(types);
    let importedSymbols = new Set(importStatements.flatMap(_ => _.names.map(sym => sym.as? sym.as : sym.name)));
    let renderedRoot = renderNode(variables, firstElementChild(rootBodyElement), importedSymbols, new Indent('    '), false);
    let elementType = baseElementName + 'Element';
    let refsType = baseElementName + 'ElementRefs';
    let imports = renderedRoot.imports
        .plus(Import.ConstructContext)
        .plus(Import.RenderElementOptions);
    let renderedRefs;
    let dynamicRefs: Ref[] = [];
    let refImportsInUse = new Set<string>();
    if (renderedRoot.refs.length > 0) {
        const renderedReferences = renderedRoot.refs.map(ref => {
            let referenceType;
            if (isComponentCollectionRef(ref)) {
                referenceType = `${ref.elementType.name}Refs<${ref.viewStateType.name}>`
                dynamicRefs.push(ref);
                refImportsInUse.add(`${ref.elementType.name}Refs`)
            }
            else if (isCollectionRef(ref)) {
                referenceType = `HTMLElementCollectionProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                imports = imports.plus(Import.HTMLElementCollectionProxy)
                dynamicRefs.push(ref);
            }
            else if (isComponentRef(ref)) {
                referenceType = `${ref.elementType.name}Ref<${ref.viewStateType.name}>`;
                refImportsInUse.add(`${ref.elementType.name}Ref`)
            }
            else {
                referenceType = `HTMLElementProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                imports = imports.plus(Import.HTMLElementProxy)
            }
            return `  ${ref.ref}: ${referenceType}`
        }).join(',\n');
        renderedRefs = `export interface ${refsType} {
${renderedReferences}
}`
    }
    else
        renderedRefs = `export interface ${refsType} {}`;

    let renderedElement = `export type ${elementType} = JayElement<${types.name}, ${refsType}>`

    let body;
    if (dynamicRefs.length > 0) {
        body = `export function render(viewState: ${types.name}, options?: RenderElementOptions): ${elementType} {
  return ConstructContext.withRootContext(viewState, () => {
${dynamicRefs.map(ref => `    const ${ref.constName} = ${isComponentRef(ref)?'ccr':'ecr'}('${ref.ref}');`).join('\n')}
    return ${renderedRoot.rendered.trim()}}, options);
}`;
    }
    else
        body = `export function render(viewState: ${types.name}, options?: RenderElementOptions): ${elementType} {
  return ConstructContext.withRootContext(viewState, () =>
${renderedRoot.rendered}, options);
}`;
    return {
        renderedRefs,
        renderedElement,
        elementType,
        refImportsInUse,
        renderedImplementation: new RenderFragment(body, imports, renderedRoot.validations)
    };
}

function renderElementBridgeNode(element: HTMLElement, indent: Indent) {

}

function renderBridge(types: JayType, ootBodyElement: HTMLElement, elementType: string) {
    return new RenderFragment(`export function render(viewState: ${types.name}): ${elementType} {
  return elementBridge(viewState, () => [])
}`, Imports.for(Import.sandboxElementBridge))
}

export function generateDefinitionFile(html: string, filename: string, filePath: string): WithValidations<string> {
    let parsedFile = parseJayFile(html, filename, filePath);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {renderedRefs, renderedElement, elementType, renderedImplementation, refImportsInUse} =
            renderFunctionImplementation(jayFile.types, jayFile.body, jayFile.imports, jayFile.baseElementName);
        return [
            renderImports(renderedImplementation.imports.plus(Import.jayElement), ImportsFor.definition, jayFile.imports, refImportsInUse),
            types,
            renderedRefs,
            renderedElement,
            renderFunctionDeclaration(jayFile.types.name, elementType)
        ]   .filter(_ => _ !== null && _ !== '')
            .join('\n\n');
    })
}

export function generateRuntimeFile(html: string, filename: string, filePath: string): WithValidations<string> {
    let parsedFile = parseJayFile(html, filename, filePath);
    return parsedFile.flatMap((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {renderedRefs, renderedElement, renderedImplementation, refImportsInUse} =
            renderFunctionImplementation(jayFile.types, jayFile.body, jayFile.imports, jayFile.baseElementName);
        let renderedFile = [
            renderImports(renderedImplementation.imports.plus(Import.element).plus(Import.jayElement), ImportsFor.implementation, jayFile.imports, refImportsInUse),
            types,
            renderedRefs,
            renderedElement,
            renderedImplementation.rendered
        ].filter(_ => _ !== null && _ !== '')
            .join('\n\n');
        return new WithValidations(renderedFile, renderedImplementation.validations);
    })
}

export function generateSandboxRuntimeFile(html: string, filename: string, filePath: string): WithValidations<string> {
    let parsedFile = parseJayFile(html, filename, filePath);
    return parsedFile.map((jayFile: JayFile) => {
        let types = generateTypes(jayFile.types);
        let {renderedRefs, renderedElement, elementType, renderedImplementation, refImportsInUse} =
            renderFunctionImplementation(jayFile.types, jayFile.body, jayFile.imports, jayFile.baseElementName);
        let renderedBridge = renderBridge(jayFile.types, jayFile.body, elementType)
        return [
            renderImports(renderedImplementation.imports
                .plus(Import.element)
                .plus(Import.jayElement)
                .plus(renderedBridge.imports), ImportsFor.elementBridge, jayFile.imports, refImportsInUse),
            types,
            renderedRefs,
            renderedElement,
            renderedBridge.rendered
        ].filter(_ => _ !== null && _ !== '')
            .join('\n\n');
    });
}