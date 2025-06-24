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
    mergeRefsTrees,
    mkRef,
    mkRefsTree,
    RenderFragment,
    RuntimeMode,
    WithValidations,
    nestRefs,
    Ref,
    RefsTree,
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

import { JayHeadlessImports, JayHtmlNamespace, JayHtmlSourceFile } from './jay-html-source-file';
import { ensureSingleChildElement, isConditional, isForEach } from './jay-html-helpers';
import { generateTypes } from './jay-html-compile-types';
import { Indent } from './indent';
import {
    elementNameToJayType,
    optimizeRefs,
    ReferenceManagerTarget,
    RefNameGenerator,
    renderReferenceManager,
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
    refNameGenerator: RefNameGenerator;
    importerMode: RuntimeMode;
    namespaces: JayHtmlNamespace[];
    importedRefNameToRef: Map<string, Ref>;
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
                new RenderFragment(
                    `style: {cssText: '${attributes[attrName].replace(/'/g, "\\'")}'}`,
                ),
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
    { dynamicRef, variables, importedRefNameToRef, refNameGenerator }: RenderContext,
): RenderFragment {
    if (element.attributes.ref) {
        if (importedRefNameToRef.has(element.attributes.ref)) {
            const ref = importedRefNameToRef.get(element.attributes.ref);
            return new RenderFragment(`${ref.constName}()`);
        }
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let constName = refNameGenerator.newConstantName(refName, variables);
        let refs = mkRefsTree(
            [
                mkRef(
                    refName,
                    originalName,
                    constName,
                    dynamicRef,
                    false,
                    variables.currentType,
                    elementNameToJayType(element),
                ),
            ],
            {},
        );
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
        return RenderFragment.merge(prop, new RenderFragment('', imports, []));
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
    { dynamicRef, variables, refNameGenerator, importedRefNameToRef }: RenderContext,
): RenderFragment {
    if (importedRefNameToRef.has(element.attributes.ref)) {
        const ref = importedRefNameToRef.get(element.attributes.ref);
        return new RenderFragment(`${ref.constName}()`, Imports.none(), [], mkRefsTree([ref], {}));
    }
    let originalName = element.attributes.ref || refNameGenerator.newAutoRefNameGenerator();
    let refName = camelCase(originalName);
    let constName = refNameGenerator.newConstantName(refName, variables);
    let refs = mkRefsTree(
        [
            mkRef(
                refName,
                originalName,
                constName,
                dynamicRef,
                !element.attributes.ref,
                variables.currentType,
                new JayComponentType(element.rawTagName, []),
            ),
        ],
        {},
    );
    return new RenderFragment(`${constName}()`, Imports.for(), [], refs);
}

function renderNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSymbols, importedSandboxedSymbols, indent, importerMode } = context;

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
            mergeRefsTrees(attributes.refs, children.refs, ref.refs),
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
            mergeRefsTrees(attributes.refs, children.refs, ref.refs),
        );
    }

    function renderHtmlElement(htmlElement: HTMLElement, newContext: RenderContext) {
        if (importedSymbols.has(htmlElement.rawTagName))
            return renderNestedComponent(htmlElement, newContext);

        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = newContext.indent.child();
        if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE)
            childIndent = childIndent.noFirstLineBreak();

        let needDynamicElement = childNodes
            .map((_) => isConditional(_) || isForEach(_))
            .reduce((prev, current) => prev || current, false);

        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) => renderNode(_, newContext))
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      )
                      .map((children) =>
                          childIndent.firstLineBreak
                              ? `\n${children}\n${newContext.indent.firstLine}`
                              : children,
                      );

        let attributes = renderAttributes(htmlElement, newContext);
        let renderedRef = renderElementRef(htmlElement, newContext);

        if (needDynamicElement)
            return de(
                htmlElement.rawTagName,
                attributes,
                childRenders,
                renderedRef,
                newContext.indent,
            );
        else
            return e(
                htmlElement.rawTagName,
                attributes,
                childRenders,
                renderedRef,
                newContext.indent,
            );
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(
            `${indent.firstLine}c(${renderedCondition.rendered},\n() => ${childElement.rendered}\n${indent.firstLine})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations],
            mergeRefsTrees(renderedCondition.refs, childElement.refs),
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
        newContext: RenderContext,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let renderedRef = renderChildCompRef(htmlElement, newContext);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        if (
            importedSandboxedSymbols.has(htmlElement.rawTagName) ||
            importerMode === RuntimeMode.MainSandbox
        )
            return new RenderFragment(
                `${newContext.indent.firstLine}secureChildComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
                Imports.for(Import.secureChildComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
            );
        else
            return new RenderFragment(
                `${newContext.indent.firstLine}childComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
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
            // if (isForEach(htmlElement)) dynamicRef = true;

            if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, {
                    ...context,
                    indent: indent.child(),
                });
                let renderedCondition = parseCondition(condition, variables);
                return c(renderedCondition, childElement);
            } else if (isForEach(htmlElement)) {
                const forEach = htmlElement.getAttribute('forEach'); // todo extract type
                const trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                const forEachAccessor = parseAccessor(forEach, variables);
                const forEachAccessPath = forEachAccessor.terms;
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
                let newContext = {
                    ...context,
                    variables: forEachVariables,
                    indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    dynamicRef: true,
                };

                let childElement = renderHtmlElement(htmlElement, newContext);
                return nestRefs(
                    forEachAccessPath,
                    renderForEach(forEachFragment, forEachVariables, trackBy, childElement),
                );
            } else {
                return renderHtmlElement(htmlElement, context);
            }
        case NodeType.COMMENT_NODE:
            break;
    }
}

function processImportedHeadless(headlessImports: JayHeadlessImports[]): Map<string, Ref> {
    const result = new Map<string, Ref>();
    function processTreeNode(key: string, refsTree: RefsTree) {
        refsTree.refs.forEach((ref) => result.set(`${key}.${ref.ref}`, ref));
        Object.entries(refsTree.children).forEach(([key2, childTree]) => {
            processTreeNode(`${key}.${key2}`, childTree);
        });
    }
    headlessImports.forEach(({ key, refs }) => {
        processTreeNode(key, refs);
    });
    return result;
}

function renderFunctionImplementation(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    baseElementName: string,
    namespaces: JayHtmlNamespace[],
    headlessImports: JayHeadlessImports[],
    importerMode: RuntimeMode,
): {
    renderedRefs: string;
    renderedElement: string;
    elementType: string;
    preRenderType: string;
    refsType: string;
    renderedImplementation: RenderFragment;
} {
    const variables = new Variables(types);
    const { importedSymbols, importedSandboxedSymbols } =
        processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const rootElement = ensureSingleChildElement(rootBodyElement);
    let renderedRoot: RenderFragment;
    if (rootElement.val) {
        renderedRoot = renderNode(rootElement.val, {
            variables,
            importedSymbols,
            indent: new Indent('    '),
            dynamicRef: false,
            importedSandboxedSymbols,
            refNameGenerator: new RefNameGenerator(),
            importerMode,
            namespaces,
            importedRefNameToRef,
        });
        renderedRoot = optimizeRefs(renderedRoot, headlessImports);
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
    const { imports: refImports, renderedRefs } = renderRefsType(renderedRoot.refs, refsType);
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

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedRoot.refs,
        ReferenceManagerTarget.element,
    );

    const body = `export function render(options?: RenderElementOptions): ${preRenderType} {
${renderedRefsManager}    
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
        renderedImplementation: new RenderFragment(body, imports, renderedRoot.validations),
    };
}

function renderElementBridgeNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSymbols, indent } = context;

    function renderNestedComponent(
        htmlElement: HTMLElement,
        newContext: RenderContext,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let renderedRef = renderChildCompRef(htmlElement, newContext);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        return new RenderFragment(
            `${newContext.indent.firstLine}childComp(${htmlElement.rawTagName}, ${getProps}${renderedRef.rendered})`,
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

    function renderHtmlElement(htmlElement, newContext: RenderContext) {
        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = newContext.indent.withFirstLineBreak();
        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) =>
                          renderElementBridgeNode(_, {
                              ...newContext,
                              indent: childIndent,
                          }),
                      )
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      );
        if (importedSymbols.has(htmlElement.rawTagName)) {
            return renderNestedComponent(htmlElement, { ...newContext, indent: childIndent });
        } else {
            const renderedRef = renderElementRef(htmlElement, context);
            if (renderedRef.rendered !== '') {
                return new RenderFragment(
                    `${newContext.indent.firstLine}e(${renderedRef.rendered})`,
                    childRenders.imports.plus(Import.sandboxElement),
                    [...childRenders.validations, ...renderedRef.validations],
                    mergeRefsTrees(childRenders.refs, renderedRef.refs),
                );
            } else return childRenders;
        }
    }

    if (node.nodeType === NodeType.ELEMENT_NODE) {
        let htmlElement = node as HTMLElement;
        if (isForEach(htmlElement)) {
            const forEach = htmlElement.getAttribute('forEach'); // todo extract type
            const trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute
            const forEachAccessor = parseAccessor(forEach, variables);
            const forEachAccessPath = forEachAccessor.terms;

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
            let childElement = renderHtmlElement(htmlElement, {
                ...context,
                variables: forEachVariables,
                indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                dynamicRef: true,
            });
            return nestRefs(
                forEachAccessPath,
                renderForEach(forEachFragment, forEachVariables, trackBy, childElement),
            );
        } else return renderHtmlElement(htmlElement, context);
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
    headlessImports: JayHeadlessImports[],
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        refNameGenerator: new RefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
        namespaces: [],
        importedRefNameToRef,
    });
    renderedBridge = optimizeRefs(renderedBridge, headlessImports);

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedBridge.refs,
        ReferenceManagerTarget.elementBridge,
    );

    return new RenderFragment(
        `export function render(): ${preRenderType} {
${renderedRefsManager}        
    const render = (viewState: ${types.name}) => 
        elementBridge(viewState, refManager, () => [${renderedBridge.rendered}
            ]) as ${elementType};
        return [refManager.getPublicAPI() as ${refsType}, render]
    }`,
        Imports.for(Import.sandboxElementBridge)
            .plus(renderedBridge.imports)
            .plus(Import.RenderElement)
            .plus(refsManagerImport),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}

function renderSandboxRoot(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    headlessImports: JayHeadlessImports[],
) {
    let variables = new Variables(types);
    let { importedSymbols, importedSandboxedSymbols } = processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    let renderedBridge = renderElementBridgeNode(rootBodyElement, {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        refNameGenerator: new RefNameGenerator(),
        importerMode: RuntimeMode.WorkerSandbox,
        namespaces: [],
        importedRefNameToRef,
    });
    let refsPart =
        renderedBridge.rendered.length > 0
            ? `
${renderedBridge.rendered}
  `
            : '';

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedBridge.refs,
        ReferenceManagerTarget.sandboxRoot,
    );

    return new RenderFragment(
        `() => {
${renderedRefsManager}
        return [${refsPart}]
    }`,
        renderedBridge.imports.plus(refsManagerImport),
        renderedBridge.validations,
        renderedBridge.refs,
    );
}

export function generateElementDefinitionFile(
    parsedFile: WithValidations<JayHtmlSourceFile>,
): WithValidations<string> {
    return parsedFile.map((jayFile) => {
        let types = generateTypes(jayFile.types);
        let { renderedRefs, renderedElement, preRenderType, renderedImplementation } =
            renderFunctionImplementation(
                jayFile.types,
                jayFile.body,
                jayFile.imports,
                jayFile.baseElementName,
                jayFile.namespaces,
                jayFile.headlessImports,
                RuntimeMode.WorkerTrusted,
            );
        return [
            renderImports(
                renderedImplementation.imports.plus(Import.jayElement),
                ImportsFor.definition,
                jayFile.imports,
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
    const { renderedRefs, renderedElement, renderedImplementation } = renderFunctionImplementation(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        jayFile.baseElementName,
        jayFile.namespaces,
        jayFile.headlessImports,
        importerMode,
    );
    const renderedFile = [
        renderImports(
            renderedImplementation.imports.plus(Import.element).plus(Import.jayElement),
            ImportsFor.implementation,
            jayFile.imports,
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
    } = renderFunctionImplementation(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        jayFile.baseElementName,
        jayFile.namespaces,
        jayFile.headlessImports,
        RuntimeMode.WorkerSandbox,
    );
    let renderedBridge = renderBridge(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        elementType,
        preRenderType,
        refsType,
        jayFile.headlessImports,
    );
    return [
        renderImports(
            renderedImplementation.imports
                .plus(Import.element)
                .plus(Import.jayElement)
                .plus(renderedBridge.imports),
            ImportsFor.elementSandbox,
            jayFile.imports,
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
    let types = generateTypes(jayFile.types);
    let renderedSandboxRoot = renderSandboxRoot(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        jayFile.headlessImports,
    );
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
        RuntimeMode.WorkerSandbox,
    );

    let initializeWorker = `export function initializeWorker() {
  sandboxRoot(${renderedSandboxRoot.rendered});
}`;
    return [renderedImports, types, initializeWorker, CALL_INITIALIZE_WORKER]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
}
