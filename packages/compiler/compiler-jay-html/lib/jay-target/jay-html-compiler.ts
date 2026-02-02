import {
    Import,
    Imports,
    ImportsFor,
    isArrayType,
    isEnumType,
    isPromiseType,
    JayComponentType,
    JayErrorType,
    JayImportLink,
    JayType,
    JayUnknown,
    MainRuntimeModes,
    mergeRefsTrees,
    mkRef,
    mkRefsTree,
    nestRefs,
    RecursiveRegion,
    Ref,
    RefsTree,
    RenderFragment,
    RuntimeMode,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { generateAllPhaseViewStateTypes } from '../contract/phase-type-generator';
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
    parseStyleDeclarations,
    parseTextExpression,
    Variables,
} from '../expressions/expression-compiler';
import { camelCase } from '../case-utils';

import {
    JayHeadlessImports,
    JayHtmlHeadLink,
    JayHtmlNamespace,
    JayHtmlSourceFile,
} from './jay-html-source-file';
import {
    AsyncDirectiveType,
    AsyncDirectiveTypes,
    checkAsync,
    ensureSingleChildElement,
    isConditional,
    isForEach,
    isSlowForEach,
    getSlowForEachInfo,
    isRecurse,
    isRecurseWithData,
    isWithData,
} from './jay-html-helpers';
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

interface RecursiveRegionInfo {
    refName: string;
    hasRecurse: boolean;
    isInsideGuard: boolean; // true if inside forEach or conditional
}

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
    recursiveRegions: RecursiveRegionInfo[]; // Stack of recursive regions we're currently inside
    isInsideGuard: boolean; // Are we currently inside a forEach or conditional?
    usedComponentImports: Set<string>; // Tracks which component/contract types are actually used
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
const propertyMapping: Record<string, { type: number }> = {
    // DOM properties (use template-style parsing with dp())
    value: { type: PROPERTY },
    checked: { type: PROPERTY },

    // Boolean attributes (use condition-style parsing with ba())
    // The presence/absence of these attributes is controlled by a condition expression
    disabled: { type: BOOLEAN_ATTRIBUTE },
    selected: { type: BOOLEAN_ATTRIBUTE },
    readonly: { type: BOOLEAN_ATTRIBUTE },
    required: { type: BOOLEAN_ATTRIBUTE },
    hidden: { type: BOOLEAN_ATTRIBUTE },
    autofocus: { type: BOOLEAN_ATTRIBUTE },
    multiple: { type: BOOLEAN_ATTRIBUTE },
    open: { type: BOOLEAN_ATTRIBUTE },
    novalidate: { type: BOOLEAN_ATTRIBUTE },
    formnovalidate: { type: BOOLEAN_ATTRIBUTE },
    // Media attributes
    autoplay: { type: BOOLEAN_ATTRIBUTE },
    controls: { type: BOOLEAN_ATTRIBUTE },
    loop: { type: BOOLEAN_ATTRIBUTE },
    muted: { type: BOOLEAN_ATTRIBUTE },
    playsinline: { type: BOOLEAN_ATTRIBUTE },
    // Other
    reversed: { type: BOOLEAN_ATTRIBUTE },
    ismap: { type: BOOLEAN_ATTRIBUTE },
    defer: { type: BOOLEAN_ATTRIBUTE },
    async: { type: BOOLEAN_ATTRIBUTE },
    default: { type: BOOLEAN_ATTRIBUTE },
    inert: { type: BOOLEAN_ATTRIBUTE },
};
const attributesRequiresQuotes = /[- ]/;

/**
 * Parse style attribute and return either cssText (for fully static) or style object (with dynamic bindings)
 */
function renderStyleAttribute(styleString: string, variables: Variables): RenderFragment {
    const { declarations, hasDynamic } = parseStyleDeclarations(styleString, variables);

    // If fully static, use cssText for optimization
    if (!hasDynamic) {
        return new RenderFragment(`style: {cssText: '${styleString.replace(/'/g, "\\'")}'}`);
    }

    // Generate style object with dynamic and static properties
    const styleProps = declarations.map((decl) => {
        const propKey = decl.property.match(attributesRequiresQuotes)
            ? `"${decl.property}"`
            : decl.property;
        return decl.valueFragment.map((_) => `${propKey}: ${_}`);
    });

    // Combine all style properties into a single style object
    return styleProps
        .reduce(
            (prev, current) => RenderFragment.merge(prev, current, ', '),
            RenderFragment.empty(),
        )
        .map((_: string) => `style: {${_}}`);
}

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
            attrCanonical === 'ref' ||
            attrCanonical === 'slowforeach' ||
            attrCanonical === 'jayindex' ||
            attrCanonical === 'jaytrackby' ||
            attrCanonical === AsyncDirectiveTypes.loading.directive ||
            attrCanonical === AsyncDirectiveTypes.resolved.directive ||
            attrCanonical === AsyncDirectiveTypes.rejected.directive
        )
            return;
        if (attrCanonical === 'style') {
            renderedAttributes.push(renderStyleAttribute(attributes[attrName], variables));
        } else if (attrCanonical === 'class') {
            let classExpression = parseClassExpression(attributes[attrName], variables);
            renderedAttributes.push(classExpression.map((_) => `class: ${_}`));
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            let attributeExpression = parsePropertyExpression(attributes[attrName], variables);
            renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
        } else if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            const attrValue = attributes[attrName];
            // Empty boolean attribute (e.g., <button disabled></button>) renders as empty string
            if (attrValue === '') {
                renderedAttributes.push(new RenderFragment(`${attrKey}: ''`, Imports.none()));
            } else {
                let attributeExpression = parseBooleanAttributeExpression(attrValue, variables);
                renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
            }
        } else {
            // Escape single quotes in attribute values so they can be safely wrapped in single quotes
            let attributeExpression = parseAttributeExpression(
                textEscape(attributes[attrName]),
                variables,
            );
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
            const importedRef = importedRefNameToRef.get(element.attributes.ref);
            // Generate a unique constName for this imported ref using the ref name generator
            // This ensures that refs with the same base name (e.g., "removeButton" in different
            // branches like lineItems.removeButton and coupon.removeButton) get unique variable names
            const uniqueConstName = refNameGenerator.newConstantName(importedRef.ref, variables);
            // Create a new ref with the unique constName so the declaration matches the usage
            // Set autoRef to false since this ref is explicitly used in the template
            // Use the full ref path from the template attribute as originalName for matching
            const refWithUniqueConstName = mkRef(
                importedRef.ref,
                element.attributes.ref, // Full path from template, e.g., "filters.filter2.categories.isSelected"
                uniqueConstName,
                importedRef.repeated,
                false, // Not autoRef - it's explicitly used in template
                importedRef.viewStateType,
                importedRef.elementType,
            );
            // Nest the ref based on its path (e.g., "cartPage.lineItems.removeButton" -> nested under cartPage.lineItems)
            const refPath = element.attributes.ref.split('.');
            // Remove the last element (the ref name itself) to get the nesting path
            const nestingPath = refPath.slice(0, -1);
            const nestedRefs = nestRefs(
                nestingPath,
                new RenderFragment(
                    '',
                    Imports.none(),
                    [],
                    mkRefsTree([refWithUniqueConstName], {}),
                ),
            );
            return new RenderFragment(
                `${uniqueConstName}()`,
                nestedRefs.imports,
                nestedRefs.validations,
                nestedRefs.refs,
            );
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
        const importedRef = importedRefNameToRef.get(element.attributes.ref);
        // Generate a unique constName for this imported ref using the ref name generator
        // This ensures that refs with the same base name get unique variable names
        const uniqueConstName = refNameGenerator.newConstantName(importedRef.ref, variables);
        // Create a new ref with the unique constName so the declaration matches the usage
        // Set autoRef to false since this ref is explicitly used in the template
        // Use the full ref path from the template attribute as originalName for matching
        const refWithUniqueConstName = mkRef(
            importedRef.ref,
            element.attributes.ref, // Full path from template, e.g., "filters.filter2.categories.isSelected"
            uniqueConstName,
            importedRef.repeated,
            false, // Not autoRef - it's explicitly used in template
            importedRef.viewStateType,
            importedRef.elementType,
        );
        // Nest the ref based on its path (e.g., "cartPage.lineItems.removeButton" -> nested under cartPage.lineItems)
        const refPath = element.attributes.ref.split('.');
        // Remove the last element (the ref name itself) to get the nesting path
        const nestingPath = refPath.slice(0, -1);
        const nestedRefs = nestRefs(
            nestingPath,
            new RenderFragment('', Imports.none(), [], mkRefsTree([refWithUniqueConstName], {})),
        );
        return new RenderFragment(
            `${uniqueConstName}()`,
            nestedRefs.imports,
            nestedRefs.validations,
            nestedRefs.refs,
        );
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
            [...attributes.recursiveRegions, ...children.recursiveRegions, ...ref.recursiveRegions],
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
            [...attributes.recursiveRegions, ...children.recursiveRegions, ...ref.recursiveRegions],
        );
    }

    function renderHtmlElement(htmlElement: HTMLElement, newContext: RenderContext) {
        if (importedSymbols.has(htmlElement.rawTagName))
            return renderNestedComponent(htmlElement, newContext);

        // Check if this element defines a recursive region
        let contextForChildren = newContext;
        let currentRegion: RecursiveRegionInfo | null = null;
        if (htmlElement.hasAttribute('ref')) {
            const refName = htmlElement.getAttribute('ref');
            currentRegion = {
                refName,
                hasRecurse: false,
                isInsideGuard: newContext.isInsideGuard,
            };
            contextForChildren = {
                ...newContext,
                recursiveRegions: [...newContext.recursiveRegions, currentRegion],
            };
        }

        let childNodes =
            node.childNodes.length > 1
                ? node.childNodes.filter(
                      (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
                  )
                : node.childNodes;

        let childIndent = contextForChildren.indent.child();
        if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE)
            childIndent = childIndent.noFirstLineBreak();

        let needDynamicElement = childNodes
            .map(
                (_) =>
                    isConditional(_) ||
                    isForEach(_) ||
                    isSlowForEach(_) ||
                    isRecurseWithData(_) ||
                    isWithData(_) ||
                    checkAsync(_).isAsync,
            )
            .reduce((prev, current) => prev || current, false);

        let childRenders =
            childNodes.length === 0
                ? RenderFragment.empty()
                : childNodes
                      .map((_) => renderNode(_, contextForChildren))
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      )
                      .map((children) =>
                          childIndent.firstLineBreak
                              ? `\n${children}\n${contextForChildren.indent.firstLine}`
                              : children,
                      );

        let attributes = renderAttributes(htmlElement, contextForChildren);
        let renderedRef = renderElementRef(htmlElement, contextForChildren);

        let result: RenderFragment;
        if (needDynamicElement)
            result = de(
                htmlElement.rawTagName,
                attributes,
                childRenders,
                renderedRef,
                newContext.indent,
            );
        else
            result = e(
                htmlElement.rawTagName,
                attributes,
                childRenders,
                renderedRef,
                newContext.indent,
            );

        // If this element has a ref that contains recursion, extract it to a function
        if (currentRegion && currentRegion.hasRecurse) {
            const functionName = `renderRecursiveRegion_${currentRegion.refName}`;
            const recursiveRegion: RecursiveRegion = {
                refName: currentRegion.refName,
                renderedContent: result.rendered,
                viewStateType: contextForChildren.variables.currentType.name,
            };

            // Replace the inline element with a function call (no parameters)
            const functionCall = `${newContext.indent.firstLine}${functionName}()`;

            result = new RenderFragment(
                functionCall,
                result.imports.plus(Import.baseJayElement),
                result.validations,
                result.refs,
                [...result.recursiveRegions, recursiveRegion],
            );
        }

        return result;
    }

    function c(renderedCondition: RenderFragment, childElement: RenderFragment) {
        return new RenderFragment(
            `${indent.firstLine}c(${renderedCondition.rendered},\n() => ${childElement.rendered}\n${indent.firstLine})`,
            Imports.merge(childElement.imports, renderedCondition.imports).plus(Import.conditional),
            [...renderedCondition.validations, ...childElement.validations],
            mergeRefsTrees(renderedCondition.refs, childElement.refs),
            [...renderedCondition.recursiveRegions, ...childElement.recursiveRegions],
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
            [...renderedForEach.recursiveRegions, ...childElement.recursiveRegions],
        );
    }

    function renderAsync(
        asyncType: AsyncDirectiveType,
        getPromiseFragment: RenderFragment,
        childElement: RenderFragment,
        resolvedGenericTypes: string,
    ) {
        return new RenderFragment(
            `${indent.firstLine}${asyncType.name}${resolvedGenericTypes}(${getPromiseFragment.rendered}, () => ${childElement.rendered.trim()})`,
            childElement.imports.plus(asyncType.import),
            [...getPromiseFragment.validations, ...childElement.validations],
            childElement.refs,
            [...getPromiseFragment.recursiveRegions, ...childElement.recursiveRegions],
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

            if (isWithData(htmlElement)) {
                // Handle <with-data accessor="expression"> element
                const accessor = htmlElement.getAttribute('accessor');

                if (!accessor) {
                    return new RenderFragment('', Imports.none(), [
                        '<with-data> element must have an "accessor" attribute',
                    ]);
                }

                // Parse the accessor to get the new context type
                const accessorExpr = parseAccessor(accessor, variables);

                // Use cached child variables for the accessor path
                // This ensures that multiple with-data blocks with the same accessor
                // share the same Variables instance and thus share ref names
                const newVariables = variables.childVariableForWithData(accessorExpr);

                // Render children (not the with-data element itself) with new context
                const childNodes = htmlElement.childNodes.filter(
                    (child) =>
                        child.nodeType !== NodeType.TEXT_NODE || child.innerText.trim() !== '',
                );

                if (childNodes.length !== 1) {
                    return new RenderFragment('', Imports.none(), [
                        `<with-data> element must have exactly one child element, but found ${childNodes.length}`,
                    ]);
                }

                const childElement = renderNode(childNodes[0], {
                    ...context,
                    variables: newVariables,
                    indent: indent,
                });

                // Generate accessor function for withData
                const accessorFunction = `(${variables.currentVar}: ${variables.currentType.name}) => ${accessorExpr.render().rendered}`;

                // Nest refs under the accessor path (e.g., refs inside <with-data accessor="tree">
                // should be nested under the "tree" key)
                const nestedChildElement = nestRefs(accessorExpr.terms, childElement);

                // Wrap in withData call
                return new RenderFragment(
                    `${indent.firstLine}withData(${accessorFunction}, () => ${nestedChildElement.rendered})`,
                    nestedChildElement.imports
                        .plus(Import.withData)
                        .plus(accessorExpr.render().imports),
                    [...accessorExpr.validations, ...nestedChildElement.validations],
                    nestedChildElement.refs,
                    nestedChildElement.recursiveRegions,
                );
            } else if (isRecurse(htmlElement)) {
                // Handle <recurse ref="name" accessor="path" /> element
                const refAttr = htmlElement.getAttribute('ref');
                const accessorAttr = htmlElement.getAttribute('accessor');

                if (!refAttr) {
                    return new RenderFragment('', Imports.none(), [
                        '<recurse> element must have a "ref" attribute',
                    ]);
                }

                // Find the recursive region with matching ref
                const region = context.recursiveRegions.find((r) => r.refName === refAttr);

                if (!region) {
                    return new RenderFragment('', Imports.none(), [
                        `<recurse ref="${refAttr}"> references unknown ref - no element with ref="${refAttr}" found as ancestor`,
                    ]);
                }

                // Validate recursion guard
                // Recursion with accessor uses withData which has built-in null check (self-guarding)
                // Recursion without accessor (or with ".") relies on forEach context, so needs explicit guard
                if ((!accessorAttr || accessorAttr === '.') && !context.isInsideGuard) {
                    return new RenderFragment('', Imports.none(), [
                        `<recurse ref="${refAttr}"> without accessor must be inside a forEach loop or conditional (if="...") to provide context and prevent infinite recursion. ` +
                            `Suggestions: ` +
                            `1) Wrap in a forEach loop if iterating over an array (e.g., <li forEach="children" trackBy="id"><recurse ref="${refAttr}"/></li>), ` +
                            `2) Add an accessor attribute if accessing a nested property (e.g., <recurse ref="${refAttr}" accessor="child"/>), or ` +
                            `3) Wrap in a conditional to guard the recursion (e.g., <div if="hasChild"><recurse ref="${refAttr}" accessor="child"/></div>).`,
                    ]);
                }

                // Mark that this region has recursion
                region.hasRecurse = true;

                // Generate the recursive function call
                const functionName = `renderRecursiveRegion_${refAttr}`;

                // If accessor is provided and not ".", we need to use withData to switch context
                if (accessorAttr && accessorAttr !== '.') {
                    const accessor = parseAccessor(accessorAttr, variables);
                    const accessorCode = accessor.render();

                    // withData expects a function: (data) => data.child
                    const accessorFunction = `(${variables.currentVar}) => ${accessorCode.rendered}`;
                    return new RenderFragment(
                        `${indent.firstLine}withData(${accessorFunction}, () => ${functionName}())`,
                        Imports.for(Import.withData).plus(accessorCode.imports),
                        [...accessor.validations, ...accessorCode.validations],
                        mkRefsTree([], {}),
                    );
                } else {
                    // No accessor or "." means use current context (forEach case)
                    return new RenderFragment(
                        `${indent.firstLine}${functionName}()`,
                        Imports.none(),
                        [],
                        mkRefsTree([], {}),
                    );
                }
            } else if (isConditional(htmlElement)) {
                let condition = htmlElement.getAttribute('if');
                let childElement = renderHtmlElement(htmlElement, {
                    ...context,
                    indent: indent.child(),
                    isInsideGuard: true, // Mark that we're inside a guard
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
                let forEachVariables = variables.childVariableFor(forEachAccessor);

                // Track the forEach iteration type as a used component import
                context.usedComponentImports.add(forEachVariables.currentType.name);

                let newContext = {
                    ...context,
                    variables: forEachVariables,
                    indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    dynamicRef: true,
                    isInsideGuard: true, // Mark that we're inside a guard
                };

                let childElement = renderHtmlElement(htmlElement, newContext);
                return nestRefs(
                    forEachAccessPath,
                    renderForEach(forEachFragment, forEachVariables, trackBy, childElement),
                );
            } else if (isSlowForEach(htmlElement)) {
                // Handle pre-rendered slow array items
                const slowForEachInfo = getSlowForEachInfo(htmlElement);
                if (!slowForEachInfo) {
                    return new RenderFragment('', Imports.none(), [
                        `slowForEach element is missing required attributes (slowForEach, jayIndex, jayTrackBy)`,
                    ]);
                }

                const { arrayName, jayIndex, jayTrackBy } = slowForEachInfo;

                // Parse the array accessor to get type info
                const arrayAccessor = parseAccessor(arrayName, variables);
                if (arrayAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [
                        `slowForEach directive - failed to resolve array type [slowForEach=${arrayName}]`,
                    ]);
                if (!isArrayType(arrayAccessor.resolvedType))
                    return new RenderFragment('', Imports.none(), [
                        `slowForEach directive - resolved type is not an array [slowForEach=${arrayName}]`,
                    ]);

                // Get the item type for the child context
                let slowForEachVariables = variables.childVariableFor(arrayAccessor);

                // Track the iteration type as a used component import
                context.usedComponentImports.add(slowForEachVariables.currentType.name);

                let newContext = {
                    ...context,
                    variables: slowForEachVariables,
                    indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    dynamicRef: true,
                    isInsideGuard: true, // Mark that we're inside a guard
                };

                // Render the element (without the slowForEach directive attributes)
                let childElement = renderHtmlElement(htmlElement, newContext);

                // Get type names for generic parameters
                const parentTypeName = variables.currentType.name;
                const itemTypeName = slowForEachVariables.currentType.name;

                // Generate accessor function similar to regular forEach
                // This handles nested paths like productSearch.filters.categoryFilter.categories
                const paramName = arrayAccessor.rootVar;
                const getItemsFragment = arrayAccessor
                    .render()
                    .map((_) => `(${paramName}: ${parentTypeName}) => ${_}`);

                // Wrap with slowForEachItem - element is wrapped in a function for context setup
                // Include generic types to ensure proper TypeScript inference
                const slowForEachFragment = new RenderFragment(
                    `${indent.firstLine}slowForEachItem<${parentTypeName}, ${itemTypeName}>(${getItemsFragment.rendered}, ${jayIndex}, '${jayTrackBy}',\n${indent.firstLine}() => ${childElement.rendered}\n${indent.firstLine})`,
                    childElement.imports
                        .plus(Import.slowForEachItem)
                        .plus(getItemsFragment.imports),
                    [...getItemsFragment.validations, ...childElement.validations],
                    childElement.refs,
                    childElement.recursiveRegions,
                );

                return nestRefs(arrayName.split('.'), slowForEachFragment);
            } else if (checkAsync(htmlElement).isAsync) {
                const asyncDirective = checkAsync(htmlElement);
                const asyncProperty = htmlElement.getAttribute(asyncDirective.directive);
                const asyncAccessor = parseAccessor(asyncProperty, variables);
                const asyncAccessPath = asyncAccessor.terms;
                if (asyncAccessor.resolvedType === JayUnknown)
                    return new RenderFragment('', Imports.none(), [
                        `async directive - failed to resolve type for ${asyncDirective}=${asyncProperty}`,
                    ]);
                if (!isPromiseType(asyncAccessor.resolvedType))
                    return new RenderFragment('', Imports.none(), [
                        `async directive - resolved type for ${asyncDirective}=${asyncProperty} is not a promise, found ${asyncAccessor.resolvedType.name}`,
                    ]);

                const getPromiseFragment: RenderFragment = asyncAccessor
                    .render()
                    .map((_) => `vs => ${_}`);

                if (asyncDirective === AsyncDirectiveTypes.resolved) {
                    const promiseResolvedType = asyncAccessor.resolvedType.itemType;
                    const childVariables = new Variables(promiseResolvedType, variables, 1);

                    let newContext = {
                        ...context,
                        variables: childVariables,
                        indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    };

                    let childElement = renderHtmlElement(htmlElement, newContext);
                    return nestRefs(
                        asyncAccessPath,
                        renderAsync(
                            asyncDirective,
                            getPromiseFragment,
                            childElement,
                            `<${variables.currentType.name}, ${childVariables.currentType.name}>`,
                        ),
                    );
                } else if (asyncDirective === AsyncDirectiveTypes.loading) {
                    let childElement = renderHtmlElement(htmlElement, context);
                    return nestRefs(
                        asyncAccessPath,
                        renderAsync(asyncDirective, getPromiseFragment, childElement, ''),
                    );
                } else if (asyncDirective === AsyncDirectiveTypes.rejected) {
                    const childVariables = new Variables(JayErrorType, variables, 1);

                    let newContext = {
                        ...context,
                        variables: childVariables,
                        indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    };

                    let childElement = renderHtmlElement(htmlElement, newContext);
                    return nestRefs(
                        asyncAccessPath,
                        renderAsync(asyncDirective, getPromiseFragment, childElement, ''),
                    );
                }
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

function renderHeadLinksArray(headLinks: JayHtmlHeadLink[]): string {
    if (headLinks.length === 0) {
        return '[]';
    }

    const linksCode = headLinks
        .map((link) => {
            const attributesCode =
                Object.keys(link.attributes).length > 0
                    ? `, attributes: ${JSON.stringify(link.attributes)}`
                    : '';
            return `{ rel: ${JSON.stringify(link.rel)}, href: ${JSON.stringify(link.href)}${attributesCode} }`;
        })
        .join(', ');

    return `[${linksCode}]`;
}

function generateCssImport(jayFile: JayHtmlSourceFile): string {
    if (!jayFile.css || !jayFile.filename) {
        return '';
    }
    return `import './${jayFile.filename}.css';`;
}

function generateRecursiveFunctions(recursiveRegions: RecursiveRegion[]): string {
    if (recursiveRegions.length === 0) {
        return '';
    }

    return recursiveRegions
        .map((region) => {
            const functionName = `renderRecursiveRegion_${region.refName}`;
            const returnType = `BaseJayElement<${region.viewStateType}>`;

            return `    function ${functionName}(): ${returnType} {
        return ${region.renderedContent};
    }`;
        })
        .join('\n\n');
}

function renderFunctionImplementation(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    baseElementName: string,
    namespaces: JayHtmlNamespace[],
    headlessImports: JayHeadlessImports[],
    importerMode: RuntimeMode,
    headLinks: JayHtmlHeadLink[] = [],
): {
    renderedRefs: string;
    renderedElement: string;
    elementType: string;
    preRenderType: string;
    refsType: string;
    renderedImplementation: RenderFragment;
    usedComponentImports: Set<string>;
} {
    const variables = new Variables(types);
    const { importedSymbols, importedSandboxedSymbols } =
        processImportedComponents(importStatements);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const rootElement = ensureSingleChildElement(rootBodyElement);
    let renderedRoot: RenderFragment;
    const usedComponentImports = new Set<string>(); // Track used component types
    if (rootElement.val) {
        // Check if the root element is a directive that needs wrapping
        const needsWrapper =
            isWithData(rootElement.val) ||
            isForEach(rootElement.val) ||
            isConditional(rootElement.val) ||
            isRecurse(rootElement.val) ||
            checkAsync(rootElement.val).isAsync;

        const indent = needsWrapper ? new Indent('        ') : new Indent('    ');

        renderedRoot = renderNode(rootElement.val, {
            variables,
            importedSymbols,
            indent: indent,
            dynamicRef: false,
            importedSandboxedSymbols,
            refNameGenerator: new RefNameGenerator(),
            importerMode,
            namespaces,
            importedRefNameToRef,
            recursiveRegions: [], // Initialize empty recursive regions stack
            isInsideGuard: false, // Not inside any guard initially
            usedComponentImports, // Track which component types are used
        });

        if (needsWrapper) {
            // Wrap the directive in a dynamic element

            // Wrap in a dynamic element
            renderedRoot = new RenderFragment(
                `de('div', {}, [\n${renderedRoot.rendered}\n    ])`,
                renderedRoot.imports.plus(Import.dynamicElement),
                renderedRoot.validations,
                renderedRoot.refs,
                renderedRoot.recursiveRegions,
            );
        }
        renderedRoot = optimizeRefs(renderedRoot, headlessImports);
    } else renderedRoot = new RenderFragment('', Imports.none(), rootElement.validations);
    const elementType = baseElementName + 'Element';
    const refsType = baseElementName + 'ElementRefs';
    const viewStateType = types.name;
    const renderType = `${elementType}Render`;
    const preRenderType = `${elementType}PreRender`;
    const contractType = `${baseElementName}Contract`;
    let imports = renderedRoot.imports
        .plus(Import.ConstructContext)
        .plus(Import.RenderElementOptions)
        .plus(Import.RenderElement)
        .plus(Import.ReferencesManager)
        .plus(Import.jayContract);

    if (headLinks.length > 0) {
        imports = imports.plus(Import.injectHeadLinks);
    }

    const { imports: refImports, renderedRefs } = renderRefsType(renderedRoot.refs, refsType);
    imports = imports.plus(refImports);

    let renderedElement = `export type ${elementType} = JayElement<${viewStateType}, ${refsType}>
export type ${renderType} = RenderElement<${viewStateType}, ${refsType}, ${elementType}>
export type ${preRenderType} = [${refsType}, ${renderType}]
export type ${contractType} = JayContract<${viewStateType}, ${refsType}>;
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

    // Generate head links injection code
    const headLinksInjection =
        headLinks.length > 0
            ? `    injectHeadLinks(${renderHeadLinksArray(headLinks)});
    `
            : '';

    // Generate recursive render functions
    const recursiveFunctions = generateRecursiveFunctions(renderedRoot.recursiveRegions);
    const recursiveFunctionsSection = recursiveFunctions ? `\n${recursiveFunctions}\n\n` : '';

    const body = `export function render(options?: RenderElementOptions): ${preRenderType} {
${renderedRefsManager}    
${headLinksInjection}${recursiveFunctionsSection}    const render = (viewState: ${viewStateType}) => ConstructContext.withRootContext(
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
        usedComponentImports, // Track which component types were used
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

    function renderAsync(
        asyncType: 'resolved' | 'pending' | 'rejected',
        renderedAsync: RenderFragment,
        asyncVariables: Variables,
        childElement: RenderFragment,
    ) {
        const importMap = {
            resolved: Import.resolved,
            pending: Import.pending,
            rejected: Import.rejected,
        };

        return new RenderFragment(
            `${indent.firstLine}${asyncType}(${renderedAsync.rendered}, () => ${childElement.rendered.trim()})`,
            childElement.imports.plus(importMap[asyncType]),
            [...renderedAsync.validations, ...childElement.validations],
            childElement.refs,
            [...renderedAsync.recursiveRegions, ...childElement.recursiveRegions],
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
            let forEachVariables = variables.childVariableFor(forEachAccessor);
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
        recursiveRegions: [], // Initialize empty recursive regions stack
        isInsideGuard: false, // Not inside any guard initially
        usedComponentImports: new Set<string>(), // Not used for bridge
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
        recursiveRegions: [], // Initialize empty recursive regions stack
        isInsideGuard: false, // Not inside any guard initially
        usedComponentImports: new Set<string>(), // Not used for sandbox
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

function generatePhaseSpecificTypes(jayFile: JayHtmlSourceFile): string {
    const baseName = jayFile.baseElementName;
    // Get the actual ViewState type name from the JayType (might be imported, like "Node")
    const actualViewStateTypeName = jayFile.types.name;
    const hasHeadlessComponents = jayFile.headlessImports && jayFile.headlessImports.length > 0;

    // If we have a contract reference, generate phase types from contract
    if (jayFile.contract) {
        const basePhaseTypes = generateAllPhaseViewStateTypes(
            jayFile.contract,
            actualViewStateTypeName,
        );

        // If we have headless components, we need to extend the Interactive phase to include them
        if (hasHeadlessComponents) {
            const headlessProps = jayFile.headlessImports.map((h) => `'${h.key}'`).join(' | ');
            const interactiveTypeName = `${baseName}InteractiveViewState`;

            // Replace the Interactive phase type to include headless components
            const interactivePattern = new RegExp(
                `export type ${interactiveTypeName} = ([^;]+);`,
                'g',
            );

            return basePhaseTypes.replace(interactivePattern, (match, originalType) => {
                // If the original type is empty {}, just pick the headless properties
                if (originalType.trim() === '{}') {
                    return `export type ${interactiveTypeName} = Pick<${actualViewStateTypeName}, ${headlessProps}>;`;
                }
                // Otherwise, combine with the existing type
                return `export type ${interactiveTypeName} = ${originalType.trim()} & Pick<${actualViewStateTypeName}, ${headlessProps}>;`;
            });
        }

        return basePhaseTypes;
    }

    // If inline data, default to interactive phase
    if (jayFile.hasInlineData) {
        return [
            `export type ${baseName}SlowViewState = {};`,
            `export type ${baseName}FastViewState = {};`,
            `export type ${baseName}InteractiveViewState = ${actualViewStateTypeName};`,
        ].join('\n');
    }

    // Fallback (shouldn't happen)
    return '';
}

export function generateElementDefinitionFile(
    parsedFile: WithValidations<JayHtmlSourceFile>,
): WithValidations<string> {
    return parsedFile.map((jayFile) => {
        const baseName = jayFile.baseElementName;
        const types = generateTypes(jayFile.types);
        let { renderedRefs, renderedElement, preRenderType, renderedImplementation } =
            renderFunctionImplementation(
                jayFile.types,
                jayFile.body,
                jayFile.imports,
                jayFile.baseElementName,
                jayFile.namespaces,
                jayFile.headlessImports,
                RuntimeMode.WorkerTrusted,
                jayFile.headLinks,
            );
        const cssImport = generateCssImport(jayFile);
        const phaseTypes = generatePhaseSpecificTypes(jayFile);

        // If we have contract or inline data, replace the 2-parameter JayContract with 5-parameter version
        if (jayFile.contract || jayFile.hasInlineData) {
            const old2ParamContract = `export type ${baseName}Contract = JayContract<${baseName}ViewState, ${baseName}ElementRefs>;`;
            const new5ParamContract = `export type ${baseName}Contract = JayContract<
    ${baseName}ViewState,
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;
            renderedElement = renderedElement.replace(old2ParamContract, new5ParamContract);
        }

        return [
            renderImports(
                renderedImplementation.imports.plus(Import.jayElement),
                ImportsFor.definition,
                jayFile.imports,
                RuntimeMode.MainTrusted,
            ),
            cssImport,
            types,
            renderedRefs,
            phaseTypes,
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
    let { renderedRefs, renderedElement, renderedImplementation, usedComponentImports } =
        renderFunctionImplementation(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            jayFile.baseElementName,
            jayFile.namespaces,
            jayFile.headlessImports,
            importerMode,
            jayFile.headLinks,
        );
    const cssImport = generateCssImport(jayFile);
    const phaseTypes = generatePhaseSpecificTypes(jayFile);

    // If we have contract or inline data, replace the 2-parameter JayContract with 5-parameter version
    if (jayFile.contract || jayFile.hasInlineData) {
        const baseName = jayFile.baseElementName;
        // Use regex to match any ViewState type name (not just ${baseName}ViewState)
        // This handles cases like imported types (e.g., "Node" instead of "RecursiveComponentsViewState")
        const contractPattern = new RegExp(
            `export type ${baseName}Contract = JayContract<([^,]+), ${baseName}ElementRefs>;`,
            'g',
        );

        renderedElement = renderedElement.replace(contractPattern, (match, viewStateType) => {
            return `export type ${baseName}Contract = JayContract<
    ${viewStateType},
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;
        });
    }

    // Build the set of used component type names from headless imports
    // Start with types tracked during rendering (forEach iteration types)
    const usedHeadlessTypeNames = new Set(usedComponentImports);

    // Add types that are used in the generated type definitions
    // These come from headless imports and are used in ViewState/Refs interfaces
    const headlessModules = new Set<string>();
    for (const headless of jayFile.headlessImports) {
        // The main ViewState and Refs types are always used when a headless import exists
        usedHeadlessTypeNames.add(headless.rootType.name);
        for (const link of headless.contractLinks) {
            headlessModules.add(link.module);
            for (const name of link.names) {
                // Add the Refs types and enum types (they're always needed)
                if (name.name.endsWith('Refs') || isEnumType(name.type)) {
                    usedHeadlessTypeNames.add(name.name);
                }
            }
        }
    }

    // Filter imports: only filter headless contract imports (to remove unused nested types)
    // Keep all regular component imports unchanged
    const filteredImports = jayFile.imports
        .map((importLink) => {
            // Only filter imports from headless contracts
            if (!headlessModules.has(importLink.module)) {
                return importLink; // Keep non-headless imports unchanged
            }
            // Filter to only include used names
            const filteredNames = importLink.names.filter((name) =>
                usedHeadlessTypeNames.has(name.as || name.name),
            );
            if (filteredNames.length === 0) {
                return null;
            }
            return { ...importLink, names: filteredNames };
        })
        .filter((imp): imp is JayImportLink => imp !== null);

    const renderedFile = [
        renderImports(
            renderedImplementation.imports.plus(Import.element).plus(Import.jayElement),
            ImportsFor.implementation,
            filteredImports,
            importerMode,
        ),
        cssImport,
        types,
        renderedRefs,
        phaseTypes,
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
        jayFile.headLinks,
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
    const phaseTypes = generatePhaseSpecificTypes(jayFile);

    // If we have contract or inline data, replace the 2-parameter JayContract with 5-parameter version
    if (jayFile.contract || jayFile.hasInlineData) {
        const baseName = jayFile.baseElementName;
        // Use regex to match any ViewState type name (not just ${baseName}ViewState)
        // This handles cases like imported types (e.g., "Node" instead of "RecursiveComponentsViewState")
        const contractPattern = new RegExp(
            `export type ${baseName}Contract = JayContract<([^,]+), ${baseName}ElementRefs>;`,
            'g',
        );

        renderedElement = renderedElement.replace(contractPattern, (match, viewStateType) => {
            return `export type ${baseName}Contract = JayContract<
    ${viewStateType},
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;
        });
    }

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
        phaseTypes,
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
