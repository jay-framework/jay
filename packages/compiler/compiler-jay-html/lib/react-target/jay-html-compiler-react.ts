import {
    GenerateTarget,
    Import,
    Imports,
    ImportsFor,
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
} from '@jay-framework/compiler-shared';
import { JayHtmlSourceFile } from '../jay-target/jay-html-source-file';
import { HTMLElement, NodeType } from 'node-html-parser';
import {
    parseAccessor,
    parseComponentPropExpression,
    parseReactClassExpression,
    parseReactCondition,
    parseReactPropertyExpression,
    parseReactTextExpression,
    Variables,
} from '../expressions/expression-compiler';
import Node from 'node-html-parser/dist/nodes/node';
import { camelCase } from '../case-utils';
import parse from 'style-to-object';
import {
    ensureSingleChildElement,
    isConditional,
    isForEach,
    getComponentName,
} from '../jay-target/jay-html-helpers';
import { generateTypes } from '../jay-target/jay-html-compile-types';
import { Indent } from '../jay-target/indent';
import {
    elementNameToJayType,
    optimizeRefs,
    RefNameGenerator,
    renderRefsType,
} from '../jay-target/jay-html-compile-refs';
import { processImportedComponents, renderImports } from '../jay-target/jay-html-compile-imports';

interface RenderContext {
    variables: Variables;
    importedSymbols: Set<string>;
    indent: Indent;
    dynamicRef: boolean;
    importedSandboxedSymbols: Set<string>;
    nextAutoRefName: RefNameGenerator;
    importerMode: RuntimeMode;
}

const attributesRequiresQuotes = /[- ]/;
function inlineStyleToReact(inlineStyle: string): string {
    const styleObject = parse(inlineStyle);
    return (
        '{' +
        Object.entries(styleObject)
            .map(([key, value]) => {
                if (key.match(attributesRequiresQuotes)) return `"${key}": "${value}"`;
                else return `${key}: "${value}"`;
            })
            .join(',') +
        '}'
    );
}

const reactRenamedAttributes = {
    for: 'htmlFor',
};

// Helper to escape single quotes in strings (used for text content)
function textEscape(s: string): string {
    return s.replace(/'/g, "\\'");
}

// Boolean attributes use condition-style parsing
// The presence/absence is controlled by a condition expression
const booleanAttributes = new Set([
    'disabled',
    'selected',
    'readonly',
    'required',
    'hidden',
    'autofocus',
    'multiple',
    'open',
    'novalidate',
    'formnovalidate',
    // Media attributes
    'autoplay',
    'controls',
    'loop',
    'muted',
    'playsinline',
    // Other
    'reversed',
    'ismap',
    'defer',
    'async',
    'default',
    'inert',
]);

function renderAttributes(element: HTMLElement, { variables }: RenderContext): RenderFragment {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach((attrName) => {
        const reactAttributeName = reactRenamedAttributes[attrName] || attrName;
        const attrCanonical = attrName.toLowerCase();
        if (attrName === `trackBy`)
            renderedAttributes.push(
                new RenderFragment(`key={${variables.currentVar}.${attributes[attrName]}}`),
            );
        else if (attrName === 'if' || attrName === 'forEach' || attrName === 'ref') return;
        else if (attrName === 'style')
            renderedAttributes.push(
                new RenderFragment(`style={${inlineStyleToReact(attributes[attrName])}}`),
            );
        else if (attrName === 'class') {
            let classExpression = parseReactClassExpression(attributes[attrName], variables);
            renderedAttributes.push(classExpression.map((_) => `className=${_}`));
        } else if (booleanAttributes.has(attrCanonical)) {
            const attrValue = attributes[attrName];
            // Empty boolean attribute (e.g., <button disabled></button>)
            if (attrValue === '') {
                renderedAttributes.push(new RenderFragment(`${reactAttributeName}`));
            } else {
                // Use condition-style parsing for boolean attributes
                let conditionExpression = parseReactCondition(attrValue, variables);
                renderedAttributes.push(
                    conditionExpression.map((_) => `${reactAttributeName}={${_}}`),
                );
            }
        } else {
            let attributeExpression = parseReactPropertyExpression(attributes[attrName], variables);
            if (attributeExpression.rendered === "''")
                renderedAttributes.push(attributeExpression.map((_) => `${reactAttributeName}`));
            else {
                // For JSX, if the value contains single quotes, use expression syntax {value}
                // instead of single-quoted attribute values which don't support escaping
                const rawValue = attributes[attrName];
                if (rawValue.includes("'") && attributeExpression.rendered.startsWith("'")) {
                    // Static value with single quotes - use expression syntax with double quotes
                    renderedAttributes.push(
                        new RenderFragment(`${reactAttributeName}={"${rawValue}"}`),
                    );
                } else {
                    renderedAttributes.push(
                        attributeExpression.map((_) => `${reactAttributeName}=${_}`),
                    );
                }
            }
        }
    });

    return renderedAttributes.reduce(
        (prev, current) => RenderFragment.merge(prev, current, ' '),
        RenderFragment.empty(),
    );
}

function renderElementRef(
    element: HTMLElement,
    { dynamicRef, variables }: RenderContext,
): RenderFragment {
    if (element.attributes.ref) {
        let originalName = element.attributes.ref;
        let refName = camelCase(originalName);
        let refs = [
            mkRef(
                refName,
                originalName,
                null,
                dynamicRef,
                false,
                variables.currentType,
                elementNameToJayType(element),
            ),
        ];
        return new RenderFragment(
            `{...eventsFor(${variables.currentContext}, '${refName}')}`,
            Imports.for(Import.eventsFor),
            [],
            mkRefsTree(refs, {}),
        );
    } else return RenderFragment.empty();
}

function renderChildCompProps(element: HTMLElement, { variables }: RenderContext): RenderFragment {
    let attributes = element.attributes;
    let props: RenderFragment[] = [];
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
            props.push(prop.map((_) => `${attrKey}={${_}}`));
        }
    });

    if (isPropsDirectAssignment) {
        let prop = parseComponentPropExpression(attributes.props, variables);
        return RenderFragment.merge(prop, new RenderFragment('', imports, [], mkRefsTree([], {})));
    } else {
        return props.reduce(
            (prev, current) => RenderFragment.merge(prev, current, ' '),
            RenderFragment.empty(),
        );
    }
}

function renderChildCompRef(
    element: HTMLElement,
    { dynamicRef, variables, nextAutoRefName }: RenderContext,
    componentName: string,
): RenderFragment {
    let originalName = element.attributes.ref || nextAutoRefName.newAutoRefNameGenerator();
    let refName = camelCase(originalName);
    let constName = nextAutoRefName.newConstantName(refName, variables);
    let refs = [
        mkRef(
            refName,
            element.attributes.ref,
            constName,
            dynamicRef,
            !element.attributes.ref,
            variables.currentType,
            new JayComponentType(componentName, []),
        ),
    ];
    if (!refs[0].autoRef)
        return new RenderFragment(
            `{...eventsFor(${variables.currentContext}, '${refName}')}`,
            Imports.for(Import.eventsFor),
            [],
            mkRefsTree(refs, {}),
        );
    else return new RenderFragment('', Imports.for(Import.eventsFor), [], mkRefsTree(refs, {}));
}

function renderReactNode(
    node: Node,
    renderContext: RenderContext,
    outReactChildComps: Map<string, string>,
): RenderFragment {
    let { variables, importedSymbols, importedSandboxedSymbols, indent, dynamicRef, importerMode } =
        renderContext;

    function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
        return parseReactTextExpression(textEscape(text), variables).map(
            (_) => indent.firstLine + _,
        );
    }

    function e(
        tagName: string,
        attributes: RenderFragment,
        children: RenderFragment,
        ref: RenderFragment,
        currIndent: Indent = indent,
    ): RenderFragment {
        ref = ref.map((_) => (_.length ? ' ' + _ : ''));
        if (children.rendered.length === 0)
            return new RenderFragment(
                `${currIndent.firstLine}<${tagName}${ref.rendered} ${attributes.rendered}/>`,
                children.imports.plus(attributes.imports).plus(ref.imports),
                [...attributes.validations, ...children.validations, ...ref.validations],
                mergeRefsTrees(attributes.refs, children.refs, ref.refs),
            );
        else
            return new RenderFragment(
                `${currIndent.firstLine}<${tagName}${ref.rendered} ${attributes.rendered}>${children.rendered}${currIndent.lastLine}</${tagName}>`,
                children.imports.plus(attributes.imports).plus(ref.imports),
                [...attributes.validations, ...children.validations, ...ref.validations],
                mergeRefsTrees(attributes.refs, children.refs, ref.refs),
            );
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(
            `${indent.firstLine}{(${renderedCondition.rendered}) && (${childElement.rendered})}`,
            Imports.merge(childElement.imports, renderedCondition.imports),
            [...renderedCondition.validations, ...childElement.validations],
            mergeRefsTrees(renderedCondition.refs, childElement.refs),
        );
    }

    function renderForEach(
        renderedForEach: RenderFragment,
        parentVariables: Variables,
        collectionVariables: Variables,
        trackBy: string,
        childElement: RenderFragment,
    ) {
        return new RenderFragment(
            `${indent.firstLine}{${renderedForEach.rendered}.map((${collectionVariables.currentVar}: ${collectionVariables.currentType.name}) => {
${indent.curr}const ${collectionVariables.currentContext} = ${parentVariables.currentContext}.child(${collectionVariables.currentVar}.${trackBy}, ${collectionVariables.currentVar});            
${indent.curr}return (${childElement.rendered})})}`,
            childElement.imports,
            [...renderedForEach.validations, ...childElement.validations],
            childElement.refs,
        );
    }

    function renderNestedComponent(
        htmlElement: HTMLElement,
        newContext: RenderContext,
        componentName: string,
    ): RenderFragment {
        let props = renderChildCompProps(htmlElement, {
            ...renderContext,
            dynamicRef,
            variables: newContext.variables,
        });
        let refs = renderChildCompRef(
            htmlElement,
            {
                ...renderContext,
                dynamicRef,
                variables: newContext.variables,
            },
            componentName,
        );
        const reactChildComp = 'React' + componentName;
        outReactChildComps.set(componentName, reactChildComp);
        return new RenderFragment(
            `${newContext.indent.firstLine}<${reactChildComp} ${props.rendered} ${refs.rendered}/>`,
            Imports.none().plus(props.imports).plus(refs.imports),
            props.validations,
            refs.refs,
        );
    }

    function renderHtmlElement(htmlElement, newContext: RenderContext) {
        // Check for component (jay:ComponentName or legacy ComponentName syntax)
        const componentName = getComponentName(htmlElement.rawTagName, importedSymbols);
        if (componentName !== null)
            return renderNestedComponent(htmlElement, newContext, componentName);

        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = newContext.indent.child();
        if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE)
            childIndent = childIndent.noFirstLineBreak();

        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) =>
                          renderReactNode(
                              _,
                              { ...newContext, indent: childIndent },
                              outReactChildComps,
                          ),
                      )
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, '\n'),
                          RenderFragment.empty(),
                      )
                      .map((children) =>
                          childIndent.firstLineBreak
                              ? `\n${children}\n${newContext.indent.firstLine}`
                              : children,
                      );

        let attributes = renderAttributes(htmlElement, newContext);
        let renderedRef = renderElementRef(htmlElement, newContext);

        return e(htmlElement.rawTagName, attributes, childRenders, renderedRef, newContext.indent);
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
                let childElement = renderHtmlElement(htmlElement, {
                    ...renderContext,
                    indent: indent.child(),
                });
                let renderedCondition = parseReactCondition(condition, variables);
                return c(renderedCondition, childElement);
            } else if (isForEach(htmlElement)) {
                const forEach = htmlElement.getAttribute('forEach'); // todo extract type
                const trackBy = htmlElement.getAttribute('trackBy'); // todo validate as attribute

                const forEachAccessor = parseAccessor(forEach, variables);
                const forEachAccessPath = forEachAccessor.terms;
                // Todo check if type unknown throw exception
                let forEachFragment = forEachAccessor.render();
                if (forEachAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [
                        `forEach directive - failed to resolve type for forEach=${forEach}`,
                    ]);
                let forEachVariables = variables.childVariableFor(forEachAccessor);
                let newContext = {
                    ...renderContext,
                    variables: forEachVariables,
                    indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    dynamicRef: true,
                };

                let childElement = renderHtmlElement(htmlElement, newContext);
                return nestRefs(
                    forEachAccessPath,
                    renderForEach(
                        forEachFragment,
                        variables,
                        forEachVariables,
                        trackBy,
                        childElement,
                    ),
                );
            } else return renderHtmlElement(htmlElement, renderContext);
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
} {
    const variables = new Variables(types);
    const { importedSymbols, importedSandboxedSymbols } =
        processImportedComponents(importStatements);

    const rootElement = ensureSingleChildElement(rootBodyElement);
    const reactChildComps = new Map<string, string>();
    let renderedRoot: RenderFragment;
    if (rootElement.val) {
        renderedRoot = renderReactNode(
            rootElement.val,
            {
                variables,
                importedSymbols,
                indent: new Indent('    '),
                dynamicRef: false,
                importedSandboxedSymbols,
                nextAutoRefName: new RefNameGenerator(),
                importerMode,
            },
            reactChildComps,
        );
        renderedRoot = optimizeRefs(renderedRoot);
    } else renderedRoot = new RenderFragment('', Imports.none(), rootElement.validations);
    const elementType = baseElementName + 'Element';
    const refsType = baseElementName + 'ElementRefs';
    const viewStateType = types.name;
    const reactPropsType = `${elementType}Props`;
    const preRenderType = `${elementType}PreRender`;
    let imports = Imports.none()
        .plus(Import.Jay4ReactElementProps)
        .plus(Import.ReactElement)
        .plus(Import.mimicJayElement);
    const { imports: refImports, renderedRefs } = renderRefsType(
        renderedRoot.refs,
        refsType,
        GenerateTarget.react,
    );
    imports = imports.plus(refImports);

    const renderedReactProps = `export interface ${reactPropsType} extends Jay4ReactElementProps<${viewStateType}> {}`;

    let renderedReactChildComponents = '';
    if (reactChildComps.size > 0) {
        imports = imports.plus(Import.jay2React);
        renderedReactChildComponents =
            [...reactChildComps.entries()]
                .map(([comp, reactComp]) => `const ${reactComp} = jay2React(() => ${comp});`)
                .join('\n') + '\n\n';
    }
    const renderedImplementation = renderedRoot.map(
        (rootNode) =>
            `${renderedReactChildComponents}export function reactRender({
    vs,
    context,
}: ${reactPropsType}): ReactElement<${reactPropsType}, any> {
    return ${rootNode};
}

export const render = mimicJayElement(reactRender)`,
    );

    return {
        renderedRefs,
        renderedReactProps,
        elementType,
        preRenderType,
        refsType,
        renderedImplementation: renderedImplementation.plusImport(imports),
    };
}

export function generateElementFileReactTarget(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
): WithValidations<string> {
    const types = generateTypes(jayFile.types);
    const { renderedRefs, renderedReactProps, renderedImplementation } =
        renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            importerMode,
        );
    let renderedFile = [
        renderImports(
            renderedImplementation.imports,
            ImportsFor.implementation,
            jayFile.imports,
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
