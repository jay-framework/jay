import {
    Import, Imports, ImportsFor,
    JayImportLink,
    JayType,
    MainRuntimeModes,
    RenderFragment,
    RuntimeMode,
    WithValidations
} from "jay-compiler-shared";
import {JayHtmlSourceFile} from "../jay-target/jay-html-source-file";
import {
    elementNameToJayType,
    firstElementChild,
    generateTypes, Indent, isConditional, isForEach,
    newAutoRefNameGenerator, optimizeRefs,
    processImportedComponents, renderImports, renderRefsType
} from "../jay-target/jay-file-compiler";
import {HTMLElement, NodeType} from "node-html-parser";
import {parseReactTextExpression, parseTextExpression, Variables} from "../expressions/expression-compiler";
import Node from 'node-html-parser/dist/nodes/node';
import {camelCase} from "camel-case";
import {eventsFor} from "jay-4-react";

interface RenderContext {
    variables: Variables;
    importedSymbols: Set<string>;
    indent: Indent;
    dynamicRef: boolean;
    importedSandboxedSymbols: Set<string>;
    nextAutoRefName: () => string;
    importerMode: RuntimeMode;
}

function renderElementRef(
    element: HTMLElement,
    { dynamicRef, variables }: RenderContext,
): RenderFragment {
    if (element.attributes.ref) {
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let refs = [
            {
                ref: refName,
                constName: null,
                dynamicRef,
                autoRef: false,
                elementType: elementNameToJayType(element),
                viewStateType: variables.currentType,
            },
        ];
        return new RenderFragment(`{...eventsFor(eventsContext, '${refName}')}`, Imports.for(Import.eventsFor), [], refs);
    } else return RenderFragment.empty();
}


function renderReactNode(node: Node, renderContext: RenderContext) {
    let { variables, importedSymbols, importedSandboxedSymbols, indent, dynamicRef, importerMode } =
        renderContext;

    function textEscape(s: string): string {
        return s.replace(/'/g, "\\'");
    }
    function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
        return parseReactTextExpression(textEscape(text), variables).map((_) => indent.firstLine + _);
    }

    function e(
        tagName: string,
        attributes: RenderFragment,
        children: RenderFragment,
        ref: RenderFragment,
        currIndent: Indent = indent,
    ): RenderFragment {
        ref = ref.map(_ => _.length? ' ' + _: '');
        return new RenderFragment(
            `${currIndent.firstLine}<${tagName}${ref.rendered} ${attributes.rendered}>${children.rendered}${currIndent.lastLine}</${tagName}>`,
            children.imports.plus(attributes.imports).plus(ref.imports),
            [...attributes.validations, ...children.validations, ...ref.validations],
            [...attributes.refs, ...children.refs, ...ref.refs],
        );
    }


    function renderHtmlElement(htmlElement, newVariables: Variables, currIndent: Indent = indent) {
        // if (importedSymbols.has(htmlElement.rawTagName))
        //     return renderNestedComponent(htmlElement, newVariables, currIndent);

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

        let childContext = { ...renderContext, variables: newVariables, indent: childIndent, dynamicRef };

        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                    .map((_) => renderReactNode(_, childContext))
                    .reduce(
                        (prev, current) => RenderFragment.merge(prev, current, '\n'),
                        RenderFragment.empty(),
                    )
                    .map((children) =>
                        childIndent.firstLineBreak
                            ? `\n${children}\n${currIndent.firstLine}`
                            : children,
                    );

        let attributes = RenderFragment.empty() // renderAttributes(htmlElement, childContext);
        let renderedRef = renderElementRef(htmlElement, childContext);

        // if (needDynamicElement)
        //     return de(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
        // else
            return e(htmlElement.rawTagName, attributes, childRenders, renderedRef, currIndent);
    }

    switch (node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text, indent); //.map(_ => ident + _);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            return renderHtmlElement(htmlElement, variables);
        case NodeType.COMMENT_NODE:
            break;
    }
    return RenderFragment.empty();
}

function renderFunctionImplementation(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    baseElementName: string,
    importerMode: RuntimeMode,
): {
    renderedRefs: string;
    renderedReactProps: string;
    elementType: string;
    preRenderType: string;
    refsType: string;
    renderedImplementation: RenderFragment;
    refImportsInUse: Set<string>;
} {
    const variables = new Variables(types);
    const { importedSymbols, importedSandboxedSymbols } =
        processImportedComponents(importStatements);

    let renderedRoot = renderReactNode(firstElementChild(rootBodyElement), {
        variables,
        importedSymbols,
        indent: new Indent('    '),
        dynamicRef: false,
        importedSandboxedSymbols,
        nextAutoRefName: newAutoRefNameGenerator(),
        importerMode,
    });
    renderedRoot = optimizeRefs(renderedRoot);
    const elementType = baseElementName + 'Element';
    const refsType = baseElementName + 'ElementRefs';
    const viewStateType = types.name;
    const renderType = `${elementType}Render`;
    const reactPropsType = `${elementType}Props`;
    const preRenderType = `${elementType}PreRender`;
    let imports = Imports.none()
        .plus(Import.Jay4ReactElementProps)
        .plus(Import.ReactElement);
    const {
        imports: refImports,
        renderedRefs,
        refImportsInUse,
    } = renderRefsType(renderedRoot.refs, refsType);
    imports = imports.plus(refImports);

    const renderedReactProps = `export interface ${reactPropsType} extends Jay4ReactElementProps<${viewStateType}> {}`

    const renderedImplementation = renderedRoot.map(rootNode =>
        `export function render({
    vs,
    eventsContext,
}: ${reactPropsType}): ReactElement<${reactPropsType}, any> {
    return ${rootNode};
}`)

    return {
        renderedRefs,
        renderedReactProps,
        elementType,
        preRenderType,
        refsType,
        renderedImplementation: renderedImplementation.plusImport(imports),
        refImportsInUse
    };
}


export function generateElementDefinitionFileReactTarget(
    parsedFile: WithValidations<JayHtmlSourceFile>
): WithValidations<string> {
    return null;
}

export function generateElementFileReactTarget(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes
): WithValidations<string> {
    const types = generateTypes(jayFile.types);
    const { renderedRefs, renderedReactProps, renderedImplementation, refImportsInUse } =
        renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            importerMode,
        )
    let renderedFile = [
        renderImports(
            renderedImplementation.imports,
            ImportsFor.implementation,
            jayFile.imports,
            refImportsInUse,
            importerMode,
        ),
        types,
        renderedRefs,
        renderedReactProps,
        renderedImplementation.rendered,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
    return new WithValidations(renderedFile, renderedImplementation.validations);
}
