import {
    Import,
    Imports,
    ImportsFor,
    isArrayType,
    JayArrayType,
    JayComponentType,
    JayImportLink,
    JayType,
    JayUnknown,
    MainRuntimeModes,
    RenderFragment,
    RuntimeMode,
    WithValidations,
} from 'jay-compiler-shared';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
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
import { camelCase } from 'camel-case';

import { JayHtmlNamespace, JayHtmlSourceFile } from './jay-html-source-file';
import { ensureSingleChildElement, isConditional, isForEach } from './jay-html-helpers';
import { generateTypes } from './jay-html-compile-types';
import { Indent } from './indent';
import {
    elementNameToJayType,
    newAutoRefNameGenerator,
    optimizeRefs,
    renderRefsForReferenceManager,
    renderRefsType,
} from './jay-html-compile-refs';
import { processImportedComponents, renderImports } from './jay-html-compile-imports';
import { tagToNamespace } from './tag-to-namespace';

interface RenderContext {
    variables: Variables;
    importedSymbols: Set<string>;
    indent: Indent;
    dynamicRef: boolean;
    importedSandboxedSymbols: Set<string>;
    nextAutoRefName: () => string;
    importerMode: RuntimeMode;
    namespaces: JayHtmlNamespace[];
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
                new RenderFragment(`style: {cssText: '${attributes[attrName].replace(/'/g, "\\'")}'}`),
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
        } else {
            let attributeExpression = parseAttributeExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
        }
    });

    return renderedAttributes
        .reduce(
            (prev, current) => RenderFragment.merge(prev, current, ', '),
            RenderFragment.empty(),
        )
        .map((_: string) => `{${_}}`);
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
            .map((_: string) => `({${_}})`);
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
        const tagFunc = tagToNamespace(tagName, true, context.namespaces);
        return new RenderFragment(
            `${currIndent.firstLine}${tagFunc.elementFunction}('${tagFunc.tag}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports
                .plus(Import.dynamicElement)
                .plus(attributes.imports)
                .plus(ref.imports)
                .plus(tagFunc.import),
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
        const tagFunc = tagToNamespace(tagName, false, context.namespaces);
        return new RenderFragment(
            `${currIndent.firstLine}${tagFunc.elementFunction}('${tagFunc.tag}', ${attributes.rendered}, [${children.rendered}${currIndent.lastLine}]${refWithPrefixComma})`,
            children.imports
                .plus(Import.element)
                .plus(attributes.imports)
                .plus(ref.imports)
                .plus(tagFunc.import),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs],
        );
    }

    function renderHtmlElement(
        htmlElement: HTMLElement,
        newVariables: Variables,
        currIndent: Indent = indent,
    ) {
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
            `${indent.firstLine}c(${renderedCondition.rendered},\n() => ${childElement.rendered}\n${indent.firstLine})`,
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
        let getProps = `(${newVariables.currentVar}: ${newVariables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
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
                const forEach = htmlElement.getAttribute('forEach'); // todo extract type
                const trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                const forEachAccessor = parseAccessor(forEach, variables);
                if (forEachAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [
                        `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
                    ]);
                if (!isArrayType(forEachAccessor.resolvedType))
                    return new RenderFragment('', Imports.none(), [
                        `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
                    ]);

                const paramName = forEachAccessor.rootVar;
                const paramType = variables.currentType.name;
                const forEachFragment = forEachAccessor
                    .render()
                    .map((_) => `(${paramName}: ${paramType}) => ${_}`);
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

function renderFunctionImplementation(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    baseElementName: string,
    namespaces: JayHtmlNamespace[],
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
    const variables = new Variables(types);
    const { importedSymbols, importedSandboxedSymbols } =
        processImportedComponents(importStatements);
    const rootElement = ensureSingleChildElement(rootBodyElement);
    let renderedRoot: RenderFragment;
    if (rootElement.val) {
        renderedRoot = renderNode(rootElement.val, {
            variables,
            importedSymbols,
            indent: new Indent('    '),
            dynamicRef: false,
            importedSandboxedSymbols,
            nextAutoRefName: newAutoRefNameGenerator(),
            importerMode,
            namespaces,
        });
        renderedRoot = optimizeRefs(renderedRoot);
    } else renderedRoot = new RenderFragment('', Imports.none(), rootElement.validations);
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
        let getProps = `(${newVariables.currentVar}: ${newVariables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
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

            if (forEachAccessor.resolvedType === JayUnknown)
                return new RenderFragment('', Imports.none(), [
                    `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
                ]);
            if (!isArrayType(forEachAccessor.resolvedType))
                return new RenderFragment('', Imports.none(), [
                    `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
                ]);

            const paramName = forEachAccessor.rootVar;
            const paramType = variables.currentType.name;
            const forEachFragment = forEachAccessor
                .render()
                .map((_) => `(${paramName}: ${paramType}) => ${_}`);
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
        namespaces: [],
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
        namespaces: [],
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
            jayFile.namespaces,
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
    const types = generateTypes(jayFile.types);
    const { renderedRefs, renderedElement, renderedImplementation, refImportsInUse } =
        renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            jayFile.namespaces,
            importerMode,
        );
    const renderedFile = [
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
        jayFile.namespaces,
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
