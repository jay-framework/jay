import { WithValidations } from '../shared/with-validations';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import { Ref, RenderFragment } from '../shared/render-fragment';
import {
    parseAccessor,
    parseAttributeExpression,
    parseBooleanAttributeExpression,
    parseClassExpression,
    parseComponentPropExpression,
    parseCondition,
    parsePropertyExpression,
    parseTextExpression,
    Variables,
} from '../expressions/expression-compiler';
import { htmlElementTagNameMap } from './html-element-tag-name-map';
import { camelCase } from 'camel-case';
import { Import, Imports, ImportsFor } from '../shared/imports';
import {
    JayArrayType,
    JayAtomicType,
    JayComponentType,
    JayEnumType,
    JayHTMLType,
    JayImportedType,
    JayObjectType,
    JayType,
    JayTypeAlias,
    JayUnknown,
} from '../shared/jay-type';
import { getModeFileExtension, MainRuntimeModes, RuntimeMode } from '../shared/runtime-mode';
import { JayImportLink } from '../shared/jay-imports';

import { JayHtmlSourceFile } from './jay-html-source-file';

class Indent {
    private readonly base: string;
    readonly firstLineBreak: boolean;
    readonly lastLineIndent: boolean;
    constructor(parent: string, firstLineBreak = true, lastLineIndent = false) {
        this.base = parent;
        this.firstLineBreak = firstLineBreak;
        this.lastLineIndent = lastLineIndent;
    }
    get firstLine(): string {
        return this.firstLineBreak ? this.base : '';
    }
    get curr(): string {
        return this.base + '  ';
    }
    get lastLine(): string {
        return this.lastLineIndent ? this.base : '';
    }

    child(): Indent {
        return new Indent(this.base + '  ');
    }

    noFirstLineBreak() {
        return new Indent(this.base, false);
    }
    withFirstLineBreak() {
        return new Indent(this.base, true);
    }
    withLastLineBreak() {
        return new Indent(this.base, false, true);
    }

    static forceIndent(code: string, size: number = 2) {
        let indent = '';
        for (let i = 0; i < size; i++) indent += ' ';
        return code
            .split('\n')
            .map((_) => (_.length > 0 ? indent + _ : _))
            .join('\n');
    }
}

function newAutoRefNameGenerator() {
    let nextId = 1;
    return function (): string {
        return 'aR' + nextId++;
    };
}

interface RenderContext {
    variables: Variables;
    importedSymbols: Set<string>;
    indent: Indent;
    dynamicRef: boolean;
    importedSandboxedSymbols: Set<string>;
    nextAutoRefName: () => string;
    importerMode: RuntimeMode;
}

function renderInterface(aType: JayType): string {
    let childInterfaces = [];

    let genInterface = '';
    if (aType instanceof JayObjectType) {
        const propKeys = Object.keys(aType.props);
        if (propKeys.length === 0) genInterface = `export interface ${aType.name} {}`;
        else {
            genInterface = `export interface ${aType.name} {\n`;
            genInterface += Object.keys(aType.props)
                .map((prop) => {
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
                        let genEnum = `export enum ${childType.name} {\n${childType.values
                            .map((_) => '  ' + _)
                            .join(',\n')}\n}`;
                        childInterfaces.push(genEnum);
                        return `  ${prop}: ${childType.name}`;
                    } else throw new Error('unknown type');
                })
                .join(',\n');
            genInterface += '\n}';
        }
    }
    return [...childInterfaces, genInterface].join('\n\n');
}

// exported for testing
export function generateTypes(types: JayType): string {
    return renderInterface(types);
}

function renderImports(
    imports: Imports,
    importsFor: ImportsFor,
    componentImports: Array<JayImportLink>,
    refImportsInUse: Set<string>,
    importerMode: RuntimeMode,
): string {
    const runtimeImport = imports.render(importsFor);
    const funcRepositoryImport = imports.renderFuncRepository();

    // todo validate the actual imported file
    let renderedComponentImports = componentImports.map((importStatement) => {
        let symbols = importStatement.names
            .map((symbol) => (symbol.as ? `${symbol.name} as ${symbol.as}` : symbol.name))
            .join(', ');

        let imports = [];
        importStatement.names
            .filter(
                (symbol) =>
                    symbol.type instanceof JayImportedType &&
                    symbol.type.type instanceof JayComponentType,
            )
            .map((symbol) => ((symbol.type as JayImportedType).type as JayComponentType).name)
            .filter(
                (compType) =>
                    refImportsInUse.has(compType + 'ComponentType') ||
                    refImportsInUse.has(compType + 'Refs'),
            )
            .map((compType) => {
                let importSymbols = [];
                if (refImportsInUse.has(compType + 'ComponentType'))
                    importSymbols.push(compType + 'ComponentType');
                if (refImportsInUse.has(compType + 'Refs')) importSymbols.push(compType + 'Refs');
                imports.push(
                    `import {${importSymbols.join(', ')}} from "${importStatement.module}-refs";`,
                );
            });
        imports.push(
            `import {${symbols}} from "${importStatement.module}${getModeFileExtension(
                importStatement.sandbox,
                importerMode,
            )}";`,
        );
        return imports.join('\n');
    });

    return [runtimeImport, ...renderedComponentImports, ...funcRepositoryImport].join('\n');
}

function renderFunctionDeclaration(preRenderType: string): string {
    return `export declare function render(options?: RenderElementOptions): ${preRenderType}`;
}

function textEscape(s: string): string {
    return s.replace(/'/g, "\\'");
}

function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
    return parseTextExpression(textEscape(text), variables).map((_) => indent.firstLine + _);
}

function elementNameToJayType(element: HTMLElement): JayType {
    return htmlElementTagNameMap[element.rawTagName]
        ? new JayHTMLType(htmlElementTagNameMap[element.rawTagName])
        : new JayHTMLType('HTMLElement');
}

const PROPERTY = 1,
    BOOLEAN_ATTRIBUTE = 3;
const propertyMapping = {
    value: { type: PROPERTY },
    checked: { type: PROPERTY },
    disabled: { type: BOOLEAN_ATTRIBUTE },
};
const attributesRequiresQuotes = /[- ]/;
function renderAttributes(element: HTMLElement, { variables }: RenderContext): RenderFragment {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach((attrName) => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrCanonical.match(attributesRequiresQuotes)
            ? `"${attrCanonical}"`
            : attrCanonical;
        if (
            attrCanonical === 'if' ||
            attrCanonical === 'foreach' ||
            attrCanonical === 'trackby' ||
            attrCanonical === 'ref'
        )
            return;
        if (attrCanonical === 'style')
            renderedAttributes.push(
                new RenderFragment(`style: {cssText: '${attributes[attrName]}'}`),
            );
        else if (attrCanonical === 'class') {
            let classExpression = parseClassExpression(attributes[attrName], variables);
            renderedAttributes.push(classExpression.map((_) => `class: ${_}`));
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            let attributeExpression = parsePropertyExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
        } else if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            let attributeExpression = parseBooleanAttributeExpression(
                attributes[attrName],
                variables,
            );
            renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
        }
        // else if (attrCanonical === 'for') {
        //     let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
        //     renderedAttributes.push(attributeExpression.map(_ => `htmlFor: ${_}`))
        // }
        else {
            let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
        }
    });

    return renderedAttributes
        .reduce(
            (prev, current) => RenderFragment.merge(prev, current, ', '),
            RenderFragment.empty(),
        )
        .map((_) => `{${_}}`);
}

function renderElementRef(
    element: HTMLElement,
    { dynamicRef, variables }: RenderContext,
): RenderFragment {
    if (element.attributes.ref) {
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let constName = camelCase(`ref ${refName}`);
        let refs = [
            {
                ref: refName,
                originalName,
                constName,
                dynamicRef,
                autoRef: false,
                elementType: elementNameToJayType(element),
                viewStateType: variables.currentType,
            },
        ];
        return new RenderFragment(`${constName}()`, Imports.none(), [], refs);
    } else return RenderFragment.empty();
}

function isConditional(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('if');
}

function isForEach(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('forEach');
}

function renderChildCompProps(element: HTMLElement, { variables }: RenderContext): RenderFragment {
    let attributes = element.attributes;
    let props = [];
    let isPropsDirectAssignment: boolean = false;
    let imports = Imports.none();
    Object.keys(attributes).forEach((attrName) => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (attrCanonical === 'if' || attrCanonical === 'foreach' || attrCanonical === 'trackby')
            return;
        if (attrCanonical === 'props') {
            isPropsDirectAssignment = true;
        }
        if (attrCanonical === 'ref') {
            return;
        } else {
            let prop = parseComponentPropExpression(attributes[attrName], variables);
            props.push(prop.map((_) => `${attrKey}: ${_}`));
        }
    });

    if (isPropsDirectAssignment) {
        let prop = parseComponentPropExpression(attributes.props, variables);
        return RenderFragment.merge(prop, new RenderFragment('', imports, [], []));
    } else {
        return props
            .reduce(
                (prev, current) => RenderFragment.merge(prev, current, ', '),
                RenderFragment.empty(),
            )
            .map((_) => `({${_}})`);
    }
}

function renderChildCompRef(
    element: HTMLElement,
    { dynamicRef, variables, nextAutoRefName }: RenderContext,
): RenderFragment {
    let originalName = element.attributes.ref || nextAutoRefName();
    let refName = camelCase(originalName);
    let constName = camelCase(`ref ${refName}`);
    let refs = [
        {
            ref: refName,
            originalName,
            constName,
            dynamicRef,
            autoRef: !element.attributes.ref,
            elementType: new JayComponentType(element.rawTagName, []),
            viewStateType: variables.currentType,
        },
    ];
    return new RenderFragment(`${constName}()`, Imports.for(), [], refs);
}

function renderNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSymbols, importedSandboxedSymbols, indent, dynamicRef, importerMode } =
        context;

    function de(
        tagName: string,
        attributes: RenderFragment,
        children: RenderFragment,
        ref: RenderFragment,
        currIndent: Indent = indent,
    ): RenderFragment {
        const refWithPrefixComma = ref.rendered.length ? `, ${ref.rendered}` : '';
        return new RenderFragment(
            `${currIndent.firstLine}de('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports.plus(Import.dynamicElement).plus(attributes.imports).plus(ref.imports),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs],
        );
    }

    function e(
        tagName: string,
        attributes: RenderFragment,
        children: RenderFragment,
        ref: RenderFragment,
        currIndent: Indent = indent,
    ): RenderFragment {
        const refWithPrefixComma = ref.rendered.length ? `, ${ref.rendered}` : '';
        return new RenderFragment(
            `${currIndent.firstLine}e('${tagName}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports.plus(Import.element).plus(attributes.imports).plus(ref.imports),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs],
        );
    }

    function renderHtmlElement(htmlElement, newVariables: Variables, currIndent: Indent = indent) {
        if (importedSymbols.has(htmlElement.rawTagName))
            return renderNestedComponent(htmlElement, newVariables, currIndent);

        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = currIndent.child();
        if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE)
            childIndent = childIndent.noFirstLineBreak();

        let needDynamicElement = childNodes
            .map((_) => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childContext = { ...context, variables: newVariables, indent: childIndent, dynamicRef };

        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) => renderNode(_, childContext))
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      )
                      .map((children) =>
                          childIndent.firstLineBreak
                              ? `\n${children}\n${currIndent.firstLine}`
                              : children,
                      );

        let attributes = renderAttributes(htmlElement, childContext);
        let renderedRef = renderElementRef(htmlElement, childContext);

        if (needDynamicElement)
            return de(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
        else return e(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(
            `${indent.firstLine}c(${renderedCondition.rendered},\n${childElement.rendered}\n${indent.firstLine})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations],
            [...renderedCondition.refs, ...childElement.refs],
        );
    }

    function renderForEach(
        renderedForEach: RenderFragment,
        collectionVariables: Variables,
        trackBy: string,
        childElement: RenderFragment,
    ) {
        return new RenderFragment(
            `${indent.firstLine}forEach(${renderedForEach.rendered}, (${collectionVariables.currentVar}: ${collectionVariables.currentType.name}) => {
${indent.curr}return ${childElement.rendered}}, '${trackBy}')`,
            childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...childElement.validations],
            childElement.refs,
        );
    }

    function renderNestedComponent(
        htmlElement: HTMLElement,
        newVariables: Variables,
        currIndent: Indent = indent,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, {
            ...context,
            dynamicRef,
            variables: newVariables,
        });
        let renderedRef = renderChildCompRef(htmlElement, {
            ...context,
            dynamicRef,
            variables: newVariables,
        });
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(vs: ${newVariables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        if (
            importedSandboxedSymbols.has(htmlElement.rawTagName) ||
            importerMode === RuntimeMode.MainSandbox
        )
            return new RenderFragment(
                `${currIndent.firstLine}secureChildComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
                Imports.for(Import.secureChildComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
            );
        else
            return new RenderFragment(
                `${currIndent.firstLine}childComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
                Imports.for(Import.childComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
            );
    }

    switch (node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text, indent); //.map(_ => ident + _);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            if (isForEach(htmlElement)) dynamicRef = true;

            if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, variables, indent.child());
                let renderedCondition = parseCondition(condition, variables);
                return c(renderedCondition, childElement);
            } else if (isForEach(htmlElement)) {
                let forEach = htmlElement.getAttribute('forEach'); // todo extract type
                let trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                let forEachAccessor = parseAccessor(forEach, variables);
                // Todo check if type unknown throw exception
                let forEachFragment = forEachAccessor.render().map((_) => `vs => ${_}`);
                if (forEachAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [
                        `forEach directive - failed to resolve type for forEach=${forEach}`,
                    ]);
                let forEachVariables = variables.childVariableFor(
                    (forEachAccessor.resolvedType as JayArrayType).itemType,
                );
                let childElement = renderHtmlElement(
                    htmlElement,
                    forEachVariables,
                    indent.child().noFirstLineBreak().withLastLineBreak(),
                );
                return renderForEach(forEachFragment, forEachVariables, trackBy, childElement);
            } else {
                return renderHtmlElement(htmlElement, variables);
            }
        case NodeType.COMMENT_NODE:
            break;
    }
}

function firstElementChild(node: Node): HTMLElement {
    // todo validate there is only one child
    return node.childNodes.find((child) => child.nodeType === NodeType.ELEMENT_NODE) as HTMLElement;
}

const isComponentRef = (ref: Ref) =>
    ref.elementType instanceof JayComponentType || ref.elementType instanceof JayTypeAlias;
const isCollectionRef = (ref: Ref) => ref.dynamicRef;
const isComponentCollectionRef = (ref: Ref) => isCollectionRef(ref) && isComponentRef(ref);

function renderRefsType(refs: Ref[], refsType: string) {
    let renderedRefs;
    let imports = Imports.none();
    let refImportsInUse = new Set<string>();
    let refsToRender = refs.filter((_) => !_.autoRef);
    if (refsToRender.length > 0) {
        const renderedReferences = refsToRender
            .map((ref) => {
                let referenceType;
                if (isComponentCollectionRef(ref)) {
                    referenceType = `${ref.elementType.name}Refs<${ref.viewStateType.name}>`;
                    refImportsInUse.add(`${ref.elementType.name}Refs`);
                } else if (isCollectionRef(ref)) {
                    referenceType = `HTMLElementCollectionProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                    imports = imports.plus(Import.HTMLElementCollectionProxy);
                } else if (isComponentRef(ref)) {
                    referenceType = `${ref.elementType.name}ComponentType<${ref.viewStateType.name}>`;
                    refImportsInUse.add(`${ref.elementType.name}ComponentType`);
                } else {
                    referenceType = `HTMLElementProxy<${ref.viewStateType.name}, ${ref.elementType.name}>`;
                    imports = imports.plus(Import.HTMLElementProxy);
                }
                return `  ${ref.ref}: ${referenceType}`;
            })
            .join(',\n');
        renderedRefs = `export interface ${refsType} {
${renderedReferences}
}`;
    } else renderedRefs = `export interface ${refsType} {}`;
    return { imports, renderedRefs, refImportsInUse };
}

function processImportedComponents(importStatements: JayImportLink[]) {
    return importStatements.reduce(
        (processedImports, importStatement) => {
            importStatement.names.forEach((importName) => {
                let name = importName.as || importName.name;
                processedImports.importedSymbols.add(name);
                if (importStatement.sandbox) processedImports.importedSandboxedSymbols.add(name);
            });
            return processedImports;
        },
        { importedSymbols: new Set<string>(), importedSandboxedSymbols: new Set<string>() },
    );
}

function renderRefsForReferenceManager(refs: Ref[]) {
    const elemRefs = refs.filter((_) => !isComponentRef(_) && !isCollectionRef(_));
    const elemCollectionRefs = refs.filter((_) => !isComponentRef(_) && isCollectionRef(_));
    const compRefs = refs.filter((_) => isComponentRef(_) && !isCollectionRef(_));
    const compCollectionRefs = refs.filter((_) => isComponentRef(_) && isCollectionRef(_));

    const elemRefsDeclarations = elemRefs.map((ref) => `'${ref.ref}'`).join(', ');
    const elemCollectionRefsDeclarations = elemCollectionRefs
        .map((ref) => `'${ref.ref}'`)
        .join(', ');
    const compRefsDeclarations = compRefs.map((ref) => `'${ref.ref}'`).join(', ');
    const compCollectionRefsDeclarations = compCollectionRefs
        .map((ref) => `'${ref.ref}'`)
        .join(', ');
    const refVariables = [
        ...elemRefs.map((ref) => ref.constName),
        ...elemCollectionRefs.map((ref) => ref.constName),
        ...compRefs.map((ref) => ref.constName),
        ...compCollectionRefs.map((ref) => ref.constName),
    ].join(', ');
    return {
        elemRefsDeclarations,
        elemCollectionRefsDeclarations,
        compRefsDeclarations,
        compCollectionRefsDeclarations,
        refVariables,
    };
}

function renderFunctionImplementation(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    baseElementName: string,
    importerMode: RuntimeMode,
): {
    renderedRefs: string;
    renderedElement: string;
    elementType: string;
    preRenderType: string;
    refsType: string;
    renderedImplementation: RenderFragment;
    refImportsInUse: Set<string>;
} {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    let renderedRoot = renderNode(firstElementChild(rootBodyElement), {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        nextAutoRefName: newAutoRefNameGenerator(),
        importerMode,
    });
    const elementType = baseElementName + 'Element';
    const refsType = baseElementName + 'ElementRefs';
    const viewStateType = types.name;
    const renderType = `${elementType}Render`;
    const preRenderType = `${elementType}PreRender`;
    let imports = renderedRoot.imports
        .plus(Import.ConstructContext)
        .plus(Import.RenderElementOptions)
        .plus(Import.RenderElement)
        .plus(Import.ReferencesManager);
    const {
        imports: refImports,
        renderedRefs,
        refImportsInUse,
    } = renderRefsType(renderedRoot.refs, refsType);
    imports = imports.plus(refImports);

    let renderedElement = `export type ${elementType} = JayElement<${viewStateType}, ${refsType}>
export type ${renderType} = RenderElement<${viewStateType}, ${refsType}, ${elementType}>
export type ${preRenderType} = [${refsType}, ${renderType}]
`;

    if (importedSandboxedSymbols.size > 0) {
        imports = imports.plus(Import.secureMainRoot).plus(Import.functionRepository);

        renderedRoot = renderedRoot.map(
            (code) =>
                `      mr(viewState, () =>
${Indent.forceIndent(code, 4)},
        funcRepository)`,
        );
    }

    const {
        elemRefsDeclarations,
        elemCollectionRefsDeclarations,
        compRefsDeclarations,
        compCollectionRefsDeclarations,
        refVariables,
    } = renderRefsForReferenceManager(renderedRoot.refs);

    const body = `export function render(options?: RenderElementOptions): ${preRenderType} {
    const [refManager, [${refVariables}]] =
        ReferencesManager.for(options, [${elemRefsDeclarations}], [${elemCollectionRefsDeclarations}], [${compRefsDeclarations}], [${compCollectionRefsDeclarations}]);
    const render = (viewState: ${viewStateType}) => ConstructContext.withRootContext(
        viewState, refManager,
        () => ${renderedRoot.rendered.trim()}
    ) as ${elementType};
    return [refManager.getPublicAPI() as ${refsType}, render];
}`;

    return {
        renderedRefs,
        renderedElement,
        elementType,
        preRenderType,
        refsType,
        refImportsInUse,
        renderedImplementation: new RenderFragment(body, imports, renderedRoot.validations),
    };
}

function renderElementBridgeNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSymbols, indent, dynamicRef } = context;

    function renderNestedComponent(
        htmlElement: HTMLElement,
        newVariables: Variables,
        currIndent: Indent,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, {
            ...context,
            dynamicRef,
            variables: newVariables,
        });
        let renderedRef = renderChildCompRef(htmlElement, {
            ...context,
            dynamicRef,
            variables: newVariables,
        });
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(vs: ${newVariables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        return new RenderFragment(
            `${currIndent.firstLine}childComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
            Imports.for(Import.sandboxChildComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports),
            propsGetterAndRefs.validations,
            renderedRef.refs,
        );
    }

    function renderForEach(
        renderedForEach: RenderFragment,
        collectionVariables: Variables,
        trackBy: string,
        childElement: RenderFragment,
    ) {
        return new RenderFragment(
            `${indent.firstLine}forEach(${renderedForEach.rendered}, '${trackBy}', () => [
${childElement.rendered}
${indent.firstLine}])`,
            childElement.imports.plus(Import.sandboxForEach),
            [...renderedForEach.validations, ...childElement.validations],
            childElement.refs,
        );
    }

    function renderHtmlElement(
        htmlElement,
        newVariables: Variables = variables,
        currIndent: Indent = indent,
    ) {
        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = currIndent.withFirstLineBreak();
        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) =>
                          renderElementBridgeNode(_, {
                              ...context,
                              indent: childIndent,
                              dynamicRef,
                              variables: newVariables,
                          }),
                      )
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      );
        // .map(children => currIndent.firstLineBreak ? `\n${children}\n${currIndent.firstLine}` : children);
        if (importedSymbols.has(htmlElement.rawTagName)) {
            return renderNestedComponent(htmlElement, newVariables, childIndent);
        } else {
            let renderedRef = renderElementRef(htmlElement, context);
            if (renderedRef.refs.length > 0)
                return new RenderFragment(
                    `${currIndent.firstLine}e(${renderedRef.rendered})`,
                    childRenders.imports.plus(Import.sandboxElement),
                    [...childRenders.validations, ...renderedRef.validations],
                    [...childRenders.refs, ...renderedRef.refs],
                );
            else return childRenders;
        }
    }

    if (node.nodeType === NodeType.ELEMENT_NODE) {
        let htmlElement = node as HTMLElement;
        if (isForEach(htmlElement)) {
            dynamicRef = true;
            let forEach = htmlElement.getAttribute('forEach'); // todo extract type
            let trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute
            let forEachAccessor = parseAccessor(forEach, variables);
            // Todo check if type unknown throw exception
            let forEachFragment = forEachAccessor.render().map((_) => `vs => ${_}`);
            if (forEachAccessor.resolvedType === JayUnknown)
                return new RenderFragment('', Imports.none(), [
                    `forEach directive - failed to resolve type for forEach=${forEach}`,
                ]);
            let forEachVariables = variables.childVariableFor(
                (forEachAccessor.resolvedType as JayArrayType).itemType,
            );
            let childElement = renderHtmlElement(
                htmlElement,
                forEachVariables,
                indent.child().noFirstLineBreak().withLastLineBreak(),
            );
            return renderForEach(forEachFragment, forEachVariables, trackBy, childElement);
        } else return renderHtmlElement(htmlElement);
    }
    return RenderFragment.empty();
}

function renderBridge(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    elementType: string,
    preRenderType: string,
    refsType: string,
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        nextAutoRefName: newAutoRefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
    });

    const {
        elemRefsDeclarations,
        elemCollectionRefsDeclarations,
        compRefsDeclarations,
        compCollectionRefsDeclarations,
        refVariables,
    } = renderRefsForReferenceManager(renderedBridge.refs);

    return new RenderFragment(
        `export function render(): ${preRenderType} {
    const [refManager, [${refVariables}]] =
        SecureReferencesManager.forElement([${elemRefsDeclarations}], [${elemCollectionRefsDeclarations}], [${compRefsDeclarations}], [${compCollectionRefsDeclarations}]);
    const render = (viewState: ${types.name}) => 
        elementBridge(viewState, refManager, () => [${renderedBridge.rendered}
            ]) as ${elementType};
        return [refManager.getPublicAPI() as ${refsType}, render]
    }`,
        Imports.for(Import.sandboxElementBridge)
            .plus(renderedBridge.imports)
            .plus(Import.RenderElement)
            .plus(Import.SecureReferencesManager),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}

function renderSandboxRoot(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        nextAutoRefName: newAutoRefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
    });
    let refsPart =
        renderedBridge.rendered.length > 0
            ? `
${renderedBridge.rendered}
  `
            : '';

    const {
        elemRefsDeclarations,
        elemCollectionRefsDeclarations,
        compRefsDeclarations,
        compCollectionRefsDeclarations,
        refVariables,
    } = renderRefsForReferenceManager(renderedBridge.refs);

    return new RenderFragment(
        `() => {
        const [, [${refVariables}]] =
            SecureReferencesManager.forSandboxRoot([${elemRefsDeclarations}], [${elemCollectionRefsDeclarations}], [${compRefsDeclarations}], [${compCollectionRefsDeclarations}])
        return [${refsPart}]
    }`,
        renderedBridge.imports.plus(Import.SecureReferencesManager),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}

export function generateElementDefinitionFile(
    parsedFile: WithValidations<JayHtmlSourceFile>,
): WithValidations<string> {
    return parsedFile.map((jayFile) => {
        let types = generateTypes(jayFile.types);
        let {
            renderedRefs,
            renderedElement,
            preRenderType,
            renderedImplementation,
            refImportsInUse,
        } = renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            RuntimeMode.WorkerTrusted,
        );
        return [
            renderImports(
                renderedImplementation.imports.plus(Import.jayElement),
                ImportsFor.definition,
                jayFile.imports,
                refImportsInUse,
                RuntimeMode.MainTrusted,
            ),
            types,
            renderedRefs,
            renderedElement,
            renderFunctionDeclaration(preRenderType),
        ]
            .filter((_) => _ !== null && _ !== '')
            .join('\n\n');
    });
}

export function generateElementFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
): WithValidations<string> {
    let types = generateTypes(jayFile.types);
    let { renderedRefs, renderedElement, renderedImplementation, refImportsInUse } =
        renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            importerMode,
        );
    let renderedFile = [
        renderImports(
            renderedImplementation.imports.plus(Import.element).plus(Import.jayElement),
            ImportsFor.implementation,
            jayFile.imports,
            refImportsInUse,
            importerMode,
        ),
        types,
        renderedRefs,
        renderedElement,
        renderedImplementation.rendered,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
    return new WithValidations(renderedFile, renderedImplementation.validations);
}

export function generateElementBridgeFile(jayFile: JayHtmlSourceFile): string {
    let types = generateTypes(jayFile.types);
    let {
        renderedRefs,
        renderedElement,
        elementType,
        preRenderType,
        refsType,
        renderedImplementation,
        refImportsInUse,
    } = renderFunctionImplementation(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        jayFile.baseElementName,
        RuntimeMode.WorkerSandbox,
    );
    let renderedBridge = renderBridge(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        elementType,
        preRenderType,
        refsType,
    );
    return [
        renderImports(
            renderedImplementation.imports
                .plus(Import.element)
                .plus(Import.jayElement)
                .plus(renderedBridge.imports),
            ImportsFor.elementSandbox,
            jayFile.imports,
            refImportsInUse,
            RuntimeMode.WorkerSandbox,
        ),
        types,
        renderedRefs,
        renderedElement,
        renderedBridge.rendered,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
}

const CALL_INITIALIZE_WORKER = `setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();`;

export function generateSandboxRootFile(jayFile: JayHtmlSourceFile): string {
    // let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(
    //     jayFile.imports,
    // );
    let types = generateTypes(jayFile.types);
    let renderedSandboxRoot = renderSandboxRoot(jayFile.types, jayFile.body, jayFile.imports);
    let renderedImports = renderImports(
        Imports.for(
            Import.sandboxRoot,
            Import.sandboxChildComp,
            Import.handshakeMessageJayChannel,
            Import.jayPort,
            Import.setWorkerPort,
        ).plus(renderedSandboxRoot.imports),
        ImportsFor.elementSandbox,
        jayFile.imports,
        new Set(),
        RuntimeMode.WorkerSandbox,
    );

    let initializeWorker = `export function initializeWorker() {
  sandboxRoot(${renderedSandboxRoot.rendered});
}`;
    return [renderedImports, types, initializeWorker, CALL_INITIALIZE_WORKER]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
}
