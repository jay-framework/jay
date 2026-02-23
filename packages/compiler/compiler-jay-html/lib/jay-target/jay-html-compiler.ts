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
    parseServerCondition,
    parseServerTemplateExpression,
    parseStyleDeclarations,
    parseTextExpression,
    Variables,
} from '../expressions/expression-compiler';
import { camelCase } from '../case-utils';
import { pascalCase } from 'change-case';

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
    getComponentName,
    extractComponentName,
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

/**
 * Represents a compiled headless component instance with inline template.
 * The render function and makeJayComponent call are emitted at module level,
 * and the page render function uses childComp to place it.
 */
interface HeadlessInstanceDefinition {
    /** Symbol name for the component (e.g., "_HeadlessProductCard0") */
    componentSymbol: string;
    /** Render function name (e.g., "_headlessProductCard0Render") */
    renderFnName: string;
    /** The compiled render function body as a string */
    renderFnCode: string;
    /** The plugin component import name (e.g., "productCard") */
    pluginComponentName: string;
    /** Additional imports needed for the inline template */
    imports: Imports;
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
    insideFastForEach: boolean; // Are we inside a fast-phase (client-side) forEach?
    usedComponentImports: Set<string>; // Tracks which component/contract types are actually used
    headlessContractNames: Set<string>; // Contract names from headless imports (for <jay:contract-name> detection)
    headlessImports: JayHeadlessImports[]; // Full headless imports (for headless instance compilation)
    headlessInstanceDefs: HeadlessInstanceDefinition[]; // Accumulator for inline template definitions
    headlessInstanceCounter: { count: number }; // Shared counter for unique naming
    coordinatePrefix: string[]; // Accumulated jayTrackBy values from ancestor slowForEach elements
    coordinateCounters: Map<string, number>; // Scope-level counter per prefix+contractName for unique coordinates
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

/**
 * Render only dynamic attributes for the hydrate target.
 * Static attributes are already in the DOM from SSR — no need to set them again.
 * Only emits da(), dp(), ba() bindings.
 */
function renderDynamicAttributes(
    element: HTMLElement,
    { variables }: RenderContext,
): RenderFragment {
    const attributes = element.attributes;
    const renderedAttributes: RenderFragment[] = [];
    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        const attrKey = attrCanonical.match(attributesRequiresQuotes)
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
            const styleFragment = renderStyleAttribute(attributes[attrName], variables);
            // Only include if it has dynamic imports (da)
            if (styleFragment.imports.has(Import.dynamicAttribute)) {
                renderedAttributes.push(styleFragment);
            }
        } else if (attrCanonical === 'class') {
            const classExpression = parseClassExpression(attributes[attrName], variables);
            // Only include if it has dynamic imports (da)
            if (classExpression.imports.has(Import.dynamicAttribute)) {
                renderedAttributes.push(classExpression.map((_) => `class: ${_}`));
            }
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const attributeExpression = parsePropertyExpression(attributes[attrName], variables);
            // Only include if it has dynamic imports (dp)
            if (attributeExpression.imports.has(Import.dynamicProperty)) {
                renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
            }
        } else if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            const attrValue = attributes[attrName];
            if (attrValue === '') {
                // Static boolean attribute — skip for hydration
            } else {
                const attributeExpression = parseBooleanAttributeExpression(attrValue, variables);
                if (attributeExpression.imports.has(Import.booleanAttribute)) {
                    renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
                }
            }
        } else {
            const attributeExpression = parseAttributeExpression(
                textEscape(attributes[attrName]),
                variables,
            );
            // Only include if it has dynamic imports (da)
            if (attributeExpression.imports.has(Import.dynamicAttribute)) {
                renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
            }
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
    componentName: string,
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
                new JayComponentType(componentName, []),
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
        // Check for component (jay:ComponentName or legacy ComponentName syntax)
        const componentMatch = getComponentName(
            htmlElement.rawTagName,
            newContext.importedSymbols,
            newContext.headlessContractNames,
        );
        if (componentMatch !== null) {
            if (componentMatch.kind === 'headless-instance') {
                return renderHeadlessInstance(htmlElement, newContext, componentMatch.name);
            }
            return renderNestedComponent(htmlElement, newContext, componentMatch.name);
        }

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
        componentName: string,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let renderedRef = renderChildCompRef(htmlElement, newContext, componentName);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        if (importedSandboxedSymbols.has(componentName) || importerMode === RuntimeMode.MainSandbox)
            return new RenderFragment(
                `${newContext.indent.firstLine}secureChildComp(${componentName}, ${getProps}${renderedRef.rendered})`,
                Imports.for(Import.secureChildComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
            );
        else
            return new RenderFragment(
                `${newContext.indent.firstLine}childComp(${componentName}, ${getProps}${renderedRef.rendered})`,
                Imports.for(Import.childComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
            );
    }

    /**
     * Render a headless component instance with inline template.
     *
     * <jay:product-card productId="prod-hero">
     *   <article class="hero-card">
     *     <h2>{name}</h2>
     *   </article>
     * </jay:product-card>
     *
     * Compiles the inline template children against the component's ViewState,
     * generates a render function + makeJayComponent definition (accumulated in context),
     * and returns a childComp() call for the page render function.
     */
    function renderHeadlessInstance(
        htmlElement: HTMLElement,
        newContext: RenderContext,
        contractName: string,
    ): RenderFragment {
        // Find the matching headless import
        const headlessImport = newContext.headlessImports.find(
            (h) => h.contractName === contractName,
        );
        if (!headlessImport) {
            return new RenderFragment(
                '',
                Imports.none(),
                [`No headless import found for contract "${contractName}"`],
                mkRefsTree([], {}),
            );
        }

        // Generate unique names for this instance
        const idx = newContext.headlessInstanceCounter.count++;
        const pascal = pascalCase(contractName);
        const componentSymbol = `_Headless${pascal}${idx}`;
        const renderFnName = `_headless${pascal}${idx}Render`;
        const pluginComponentName = headlessImport.codeLink.names[0].name;

        // Type names for the inline component
        const interactiveViewStateType = `${pascal}InteractiveViewState`;
        const refsTypeName = `${pascal}Refs`;
        const elementType = `_Headless${pascal}${idx}Element`;
        const renderType = `_Headless${pascal}${idx}ElementRender`;
        const preRenderType = `_Headless${pascal}${idx}ElementPreRender`;

        // Track that InteractiveViewState is used (so it gets imported)
        newContext.usedComponentImports.add(interactiveViewStateType);

        // Add InteractiveViewState to the contract link's names if not already present
        // (needed so the import filtering keeps it)
        for (const link of headlessImport.contractLinks) {
            if (!link.names.some((n) => n.name === interactiveViewStateType)) {
                link.names.push({ name: interactiveViewStateType, type: JayUnknown });
            }
        }

        // Compile inline template children against the component's ViewState
        const componentVariables = new Variables(headlessImport.rootType);
        const childIndent = newContext.indent.child(false);

        const childNodes = htmlElement.childNodes.filter(
            (_) => _.nodeType !== NodeType.TEXT_NODE || _.innerText.trim() !== '',
        );

        let inlineBody: RenderFragment;
        if (childNodes.length === 0) {
            inlineBody = new RenderFragment(
                '',
                Imports.none(),
                [
                    `Headless component instance <jay:${contractName}> must have inline template content`,
                ],
                mkRefsTree([], {}),
            );
        } else {
            // Build importedRefNameToRef from the contract's refs tree
            // This maps template ref attribute names (camelCase) to contract Ref objects
            // We use originalName as the ref field so ReferencesManager.for() uses the
            // original tag name (e.g., 'add to cart') rather than the camelCased version
            const instanceRefMap = new Map<string, Ref>();
            const collectContractRefs = (refsTree: RefsTree) => {
                for (const ref of refsTree.refs) {
                    // Create a ref with originalName as the ref field for ReferencesManager
                    const refWithOriginalName = mkRef(
                        ref.originalName, // Use original tag name for ReferencesManager
                        ref.originalName,
                        ref.constName,
                        ref.repeated,
                        ref.autoRef,
                        ref.viewStateType,
                        ref.elementType,
                    );
                    // Map camelCase(tagName) -> Ref, so ref="addToCart" matches tag "add to cart"
                    instanceRefMap.set(camelCase(ref.originalName), refWithOriginalName);
                }
                for (const child of Object.values(refsTree.children)) {
                    collectContractRefs(child);
                }
            };
            collectContractRefs(headlessImport.refs);

            // Compile each child against the component's ViewState
            const childContext: RenderContext = {
                ...newContext,
                variables: componentVariables,
                indent: childIndent,
                importedRefNameToRef: instanceRefMap,
                recursiveRegions: [],
                isInsideGuard: false,
                insideFastForEach: false,
                // Don't detect nested headless instances inside headless instances (for now)
                headlessContractNames: new Set(),
            };

            inlineBody = childNodes
                .map((_) => renderNode(_, childContext))
                .reduce(
                    (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                    RenderFragment.empty(),
                );
        }

        // Generate ReferencesManager from inline template refs
        const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
            inlineBody.refs,
            ReferenceManagerTarget.element,
        );

        // Build coordinate key: use explicit ref if present, otherwise auto-generate with scope counter
        const explicitRef = htmlElement.attributes.ref;
        let coordinateRef: string;
        if (explicitRef) {
            coordinateRef = explicitRef;
        } else {
            const counterKey = [...newContext.coordinatePrefix, contractName].join('/');
            const localIndex = newContext.coordinateCounters.get(counterKey) ?? 0;
            newContext.coordinateCounters.set(counterKey, localIndex + 1);
            coordinateRef = String(localIndex);
        }

        // For static instances: string key. For forEach instances: factory function.
        const isInsideForEach = newContext.insideFastForEach;
        const coordinateSuffix = `${contractName}:${coordinateRef}`;
        const coordinateKey = isInsideForEach
            ? undefined // will use factory
            : [...newContext.coordinatePrefix, coordinateSuffix].join('/');

        // Generate type aliases and render function code
        const renderFnCode = `
// Inline template for headless component: ${contractName} #${idx}
type ${elementType} = JayElement<${interactiveViewStateType}, ${refsTypeName}>;
type ${renderType} = RenderElement<${interactiveViewStateType}, ${refsTypeName}, ${elementType}>;
type ${preRenderType} = [${refsTypeName}, ${renderType}];

function ${renderFnName}(options?: RenderElementOptions): ${preRenderType} {
    ${renderedRefsManager}
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
${inlineBody.rendered}
        ) as ${elementType};
    return [refManager.getPublicAPI() as ${refsTypeName}, render];
}

const ${componentSymbol} = makeHeadlessInstanceComponent(
    ${renderFnName},
    ${pluginComponentName}.comp,
    ${isInsideForEach ? `(dataIds) => [...dataIds, '${coordinateSuffix}'].toString()` : `'${coordinateKey}'`},
    ${pluginComponentName}.contexts,
);`;

        // Accumulate the definition
        newContext.headlessInstanceDefs.push({
            componentSymbol,
            renderFnName,
            renderFnCode,
            pluginComponentName,
            imports: inlineBody.imports.plus(refsManagerImport),
        });

        // Generate props getter (from parent ViewState to component props)
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;

        // Generate ref for the headless instance (same as headful components)
        let renderedRef = renderChildCompRef(htmlElement, newContext, componentSymbol);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);

        // Return childComp call for the page render function
        return new RenderFragment(
            `${newContext.indent.firstLine}childComp(${componentSymbol}, ${getProps}${renderedRef.rendered})`,
            Imports.for(Import.childComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports)
                .plus(Import.ConstructContext)
                .plus(Import.makeHeadlessInstanceComponent),
            [
                ...propsGetterAndRefs.validations,
                ...inlineBody.validations,
                ...renderedRef.validations,
            ],
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
                    insideFastForEach: true, // Fast-phase forEach — headless instances not supported
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
                    coordinatePrefix: [...context.coordinatePrefix, jayTrackBy],
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
    // Only page-level headless imports (with key) contribute to the page's ref map
    headlessImports
        .filter(({ key }) => key)
        .forEach(({ key, refs }) => {
            processTreeNode(key!, refs);
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
    // Build set of headless contract names for detecting <jay:contract-name> instances
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
    const rootElement = ensureSingleChildElement(rootBodyElement);
    let renderedRoot: RenderFragment;
    const usedComponentImports = new Set<string>(); // Track used component types
    const headlessInstanceDefs: HeadlessInstanceDefinition[] = [];
    const headlessInstanceCounter = { count: 0 };
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
            insideFastForEach: false, // Not inside any fast forEach initially
            usedComponentImports, // Track which component types are used
            headlessContractNames, // For detecting <jay:contract-name> instances
            headlessImports, // Full headless imports for instance compilation
            headlessInstanceDefs, // Accumulator for inline template definitions
            headlessInstanceCounter, // Counter for unique naming
            coordinatePrefix: [], // Root has empty coordinate prefix
            coordinateCounters: new Map(), // Scope-level counter for unique coordinates
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

    // Generate headless component instance definitions (if any)
    const headlessDefsCode =
        headlessInstanceDefs.length > 0
            ? headlessInstanceDefs.map((def) => def.renderFnCode).join('\n') + '\n\n'
            : '';

    // Merge imports from headless instance definitions
    for (const def of headlessInstanceDefs) {
        imports = imports.plus(def.imports);
    }

    const body = `${headlessDefsCode}export function render(options?: RenderElementOptions): ${preRenderType} {
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
        componentName: string,
    ): RenderFragment {
        let propsGetterAndRefs = renderChildCompProps(htmlElement, newContext);
        let renderedRef = renderChildCompRef(htmlElement, newContext, componentName);
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);
        let getProps = `(${newContext.variables.currentVar}: ${newContext.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        return new RenderFragment(
            `${newContext.indent.firstLine}childComp(${componentName}, ${getProps}${renderedRef.rendered})`,
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
        // Check for component (jay:ComponentName or legacy ComponentName syntax)
        const componentMatch = getComponentName(
            htmlElement.rawTagName,
            newContext.importedSymbols,
            newContext.headlessContractNames,
        );
        if (componentMatch !== null) {
            const componentName = componentMatch.name;
            if (componentMatch.kind === 'headless-instance') {
                // Headless component instances are not supported in sandbox mode
                return new RenderFragment('', Imports.none(), [], mkRefsTree([], {}));
            }
            return renderNestedComponent(
                htmlElement,
                { ...newContext, indent: childIndent },
                componentName,
            );
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
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
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
        insideFastForEach: false,
        usedComponentImports: new Set<string>(), // Not used for bridge
        headlessContractNames,
        headlessImports,
        headlessInstanceDefs: [], // Not used for bridge
        headlessInstanceCounter: { count: 0 },
        coordinatePrefix: [],
        coordinateCounters: new Map(),
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
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
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
        insideFastForEach: false,
        usedComponentImports: new Set<string>(), // Not used for sandbox
        headlessContractNames,
        headlessImports,
        headlessInstanceDefs: [], // Not used for sandbox
        headlessInstanceCounter: { count: 0 },
        coordinatePrefix: [],
        coordinateCounters: new Map(),
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
    // Page-level headless components (with key) affect the ViewState
    const pageLevelHeadless = jayFile.headlessImports?.filter((h) => h.key) ?? [];
    const hasHeadlessComponents = pageLevelHeadless.length > 0;

    // If we have a contract reference, generate phase types from contract
    if (jayFile.contract) {
        const basePhaseTypes = generateAllPhaseViewStateTypes(
            jayFile.contract,
            actualViewStateTypeName,
        );

        // If we have headless components, we need to extend the Interactive phase to include them
        if (hasHeadlessComponents) {
            // Only page-level headless imports (with key) extend the interactive ViewState
            const headlessProps = jayFile.headlessImports
                .filter((h) => h.key)
                .map((h) => `'${h.key}'`)
                .join(' | ');
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

// ============================================================================
// Hydrate Target
// ============================================================================

interface HydrateContext {
    variables: Variables;
    indent: Indent;
    coordinateCounter: { count: number };
    dynamicRef: boolean;
    refNameGenerator: RefNameGenerator;
    importedRefNameToRef: Map<string, Ref>;
    importedSymbols: Set<string>;
    headlessContractNames: Set<string>;
}

/**
 * Recursive tree walker for the hydrate compilation target.
 * Emits adoptText/adoptElement calls for dynamic nodes, skips static ones.
 */
/** Merge multiple hydrate fragments, filtering out empty ones to avoid stray commas. */
function mergeHydrateFragments(fragments: RenderFragment[], combinator: string): RenderFragment {
    return fragments
        .filter((f) => f.rendered.trim().length > 0)
        .reduce(
            (prev, curr) => RenderFragment.merge(prev, curr, combinator),
            RenderFragment.empty(),
        );
}

function renderHydrateNode(node: Node, context: HydrateContext): RenderFragment {
    if (node.nodeType === NodeType.ELEMENT_NODE) {
        return renderHydrateElement(node as HTMLElement, context);
    }
    // Text nodes are handled by their parent element
    return RenderFragment.empty();
}

function buildRenderContext(context: HydrateContext): RenderContext {
    return {
        variables: context.variables,
        importedSymbols: context.importedSymbols,
        indent: context.indent,
        dynamicRef: context.dynamicRef,
        importedSandboxedSymbols: new Set(),
        refNameGenerator: context.refNameGenerator,
        importerMode: RuntimeMode.MainTrusted,
        namespaces: [],
        importedRefNameToRef: context.importedRefNameToRef,
        recursiveRegions: [],
        isInsideGuard: false,
        insideFastForEach: false,
        usedComponentImports: new Set(),
        headlessContractNames: context.headlessContractNames,
        headlessImports: [],
        headlessInstanceDefs: [],
        headlessInstanceCounter: { count: 0 },
        coordinatePrefix: [],
        coordinateCounters: new Map(),
    };
}

function renderHydrateElement(element: HTMLElement, context: HydrateContext): RenderFragment {
    const renderContext = buildRenderContext(context);

    // --- Conditional (if=) ---
    if (isConditional(element)) {
        const condition = element.getAttribute('if');
        const renderedCondition = parseCondition(condition, context.variables);
        const coordinate = String(context.coordinateCounter.count++);
        // Render the element content as the adopt callback.
        // forceAdopt=true ensures the element is always adopted even if its
        // content is purely static (e.g., <div if="cond">static text</div>).
        // Without this, renderHydrateElementContent would skip adoption and
        // the callback would return undefined, crashing hydrateConditional.
        const childContent = renderHydrateElementContent(
            element,
            context,
            renderContext,
            coordinate,
            true,
        );
        const adoptBody = childContent.rendered.trim()
            ? `() => ${childContent.rendered.trim()}`
            : '() => {}';
        return new RenderFragment(
            `${context.indent.firstLine}hydrateConditional(${renderedCondition.rendered}, ${adoptBody})`,
            Imports.for(Import.hydrateConditional)
                .plus(renderedCondition.imports)
                .plus(childContent.imports),
            [...renderedCondition.validations, ...childContent.validations],
            childContent.refs,
        );
    }

    // --- forEach ---
    if (isForEach(element)) {
        const { variables, indent } = context;
        const forEach = element.getAttribute('forEach');
        const trackBy = element.getAttribute('trackBy');
        const forEachAccessor = parseAccessor(forEach, variables);

        if (forEachAccessor.resolvedType === JayUnknown)
            return new RenderFragment('', Imports.none(), [
                `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
            ]);
        if (!isArrayType(forEachAccessor.resolvedType))
            return new RenderFragment('', Imports.none(), [
                `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
            ]);

        const containerCoordinate = String(context.coordinateCounter.count++);
        const paramName = forEachAccessor.rootVar;
        const paramType = variables.currentType.name;
        const forEachFragment = forEachAccessor
            .render()
            .map((_) => `(${paramName}: ${paramType}) => ${_}`);
        const forEachVariables = variables.childVariableFor(forEachAccessor);

        // Adopt callback: render item children and return as an array.
        // hydrateForEach combines them into a single BaseJayElement internally.
        const itemChildNodes = element.childNodes.filter(
            (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
        );
        const itemContext: HydrateContext = {
            ...context,
            variables: forEachVariables,
            indent: indent.child().child(),
            coordinateCounter: { count: 0 },
        };
        const itemContent = mergeHydrateFragments(
            itemChildNodes.map((child) => renderHydrateNode(child, itemContext)),
            ',\n',
        );
        const adoptBody = itemContent.rendered.trim()
            ? `() => [\n${itemContent.rendered},\n${indent.firstLine}    ]`
            : '() => []';

        // Create callback: render the item element using the standard element target
        const createRenderContext: RenderContext = {
            ...renderContext,
            variables: forEachVariables,
            indent: new Indent('    ').child().noFirstLineBreak(),
            dynamicRef: true,
            isInsideGuard: true,
            insideFastForEach: true,
        };
        const createChildNodes = element.childNodes.filter(
            (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
        );
        let createChildren =
            createChildNodes.length === 0
                ? RenderFragment.empty()
                : createChildNodes
                      .map((_) =>
                          renderNode(_, {
                              ...createRenderContext,
                              indent: createRenderContext.indent.child(),
                          }),
                      )
                      .reduce(
                          (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                          RenderFragment.empty(),
                      );
        const createAttributes = renderAttributes(element, createRenderContext);
        const createBody = `(${forEachVariables.currentVar}: ${forEachVariables.currentType.name}) => {\n${indent.firstLine}    return e('${element.rawTagName}', ${createAttributes.rendered}, [${createChildren.rendered}]);\n${indent.firstLine}    }`;

        return new RenderFragment(
            `${indent.firstLine}hydrateForEach("${containerCoordinate}", ${forEachFragment.rendered}, '${trackBy}',\n${indent.firstLine}    ${adoptBody},\n${indent.firstLine}    ${createBody},\n${indent.firstLine})`,
            Imports.for(Import.hydrateForEach)
                .plus(Import.element)
                .plus(forEachFragment.imports)
                .plus(itemContent.imports)
                .plus(createChildren.imports)
                .plus(createAttributes.imports),
            [
                ...forEachFragment.validations,
                ...itemContent.validations,
                ...createChildren.validations,
            ],
            mergeRefsTrees(itemContent.refs, createChildren.refs),
        );
    }

    // --- Component (childComp) ---
    const componentMatch = getComponentName(
        element.rawTagName,
        context.importedSymbols,
        context.headlessContractNames,
    );
    if (componentMatch !== null) {
        const componentName = componentMatch.name;
        // In hydrate mode, child components handle their own hydration.
        // Emit the same childComp() call as the standard element target.
        const propsGetterAndRefs = renderChildCompProps(element, renderContext);
        const renderedRef = renderChildCompRef(element, renderContext, componentName);
        const refSuffix = renderedRef.rendered !== '' ? `, ${renderedRef.rendered}` : '';
        const getProps = `(${context.variables.currentVar}: ${context.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;
        return new RenderFragment(
            `${context.indent.firstLine}childComp(${componentName}, ${getProps}${refSuffix})`,
            Imports.for(Import.childComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports),
            propsGetterAndRefs.validations,
            renderedRef.refs,
        );
    }

    // --- Regular element (text, attributes, refs) ---
    return renderHydrateElementContent(element, context, renderContext, null);
}

/**
 * Render the content of an element for hydration (text, attributes, refs).
 * If coordinateOverride is provided, use it; otherwise assign automatically.
 * If forceAdopt is true, always emit an adoptElement even if the element is static
 * (used for the root body element to provide a single composition point).
 */
function renderHydrateElementContent(
    element: HTMLElement,
    context: HydrateContext,
    renderContext: RenderContext,
    coordinateOverride: string | null,
    forceAdopt: boolean = false,
): RenderFragment {
    const { variables, indent } = context;
    const refAttr = element.attributes.ref;
    const refName = refAttr ? camelCase(refAttr) : null;

    // Parse only dynamic attributes (static ones already in DOM from SSR)
    const attributes = renderDynamicAttributes(element, renderContext);
    const hasDynamicAttrs =
        attributes.imports.has(Import.dynamicAttribute) ||
        attributes.imports.has(Import.dynamicProperty) ||
        attributes.imports.has(Import.booleanAttribute);

    // Filter child nodes (remove whitespace-only text nodes if there are multiple children)
    const childNodes =
        element.childNodes.length > 1
            ? element.childNodes.filter(
                  (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
              )
            : element.childNodes;

    // Check if this element has a single dynamic text child
    let textFragment: RenderFragment | null = null;
    if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const rendered = parseTextExpression(textEscape(text), variables);
        if (rendered.imports.has(Import.dynamicText)) {
            textFragment = rendered;
        }
    }

    // Check if children contain conditionals or forEach (makes parent a container)
    const hasInteractiveChildren = childNodes.some(
        (child) =>
            child.nodeType === NodeType.ELEMENT_NODE &&
            (isConditional(child as HTMLElement) || isForEach(child as HTMLElement)),
    );

    // Determine if this element itself needs adoption
    const needsAdoption =
        hasDynamicAttrs ||
        textFragment !== null ||
        refName !== null ||
        hasInteractiveChildren ||
        forceAdopt;

    if (!needsAdoption) {
        // Static element — recurse into children to find nested dynamic nodes
        return mergeHydrateFragments(
            childNodes.map((child) => renderHydrateNode(child, context)),
            ',\n',
        );
    }

    // Assign coordinate
    const coordinate =
        coordinateOverride !== null
            ? coordinateOverride
            : refName || String(context.coordinateCounter.count++);

    // Build the ref argument if present
    const renderedRef = renderElementRef(element, renderContext);

    // If this element has interactive children (conditionals/forEach), render them
    if (hasInteractiveChildren) {
        const childFragments = mergeHydrateFragments(
            childNodes.map((child) => renderHydrateNode(child, context)),
            ',\n',
        );
        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';
        const childrenArr = childFragments.rendered.trim() ? `[${childFragments.rendered}]` : '[]';
        return new RenderFragment(
            `${indent.firstLine}adoptElement("${coordinate}", ${attributes.rendered}, ${childrenArr}${refSuffix})`,
            Imports.for(Import.adoptElement)
                .plus(attributes.imports)
                .plus(childFragments.imports)
                .plus(renderedRef.imports),
            [...attributes.validations, ...childFragments.validations, ...renderedRef.validations],
            mergeRefsTrees(childFragments.refs, renderedRef.refs),
        );
    }

    if (textFragment && !hasDynamicAttrs) {
        // Simple text adoption: adoptText("coord", accessor, ref?)
        const accessor = textFragment.rendered.replace(/^dt\(/, '').replace(/\)$/, '');
        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';
        return new RenderFragment(
            `${indent.firstLine}adoptText("${coordinate}", ${accessor}${refSuffix})`,
            Imports.for(Import.adoptText)
                .plus(textFragment.imports.minus(Import.dynamicText))
                .plus(renderedRef.imports),
            [...textFragment.validations, ...renderedRef.validations],
            renderedRef.refs,
        );
    }

    if (hasDynamicAttrs) {
        // Element adoption with dynamic attributes
        let childrenRendered = '[]';
        let childImports = Imports.none();
        let childValidations: string[] = [];

        if (textFragment) {
            const accessor = textFragment.rendered.replace(/^dt\(/, '').replace(/\)$/, '');
            childrenRendered = `[adoptText("${coordinate}", ${accessor})]`;
            childImports = Imports.for(Import.adoptText).plus(
                textFragment.imports.minus(Import.dynamicText),
            );
            childValidations = textFragment.validations;
        }

        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';

        return new RenderFragment(
            `${indent.firstLine}adoptElement("${coordinate}", ${attributes.rendered}, ${childrenRendered}${refSuffix})`,
            Imports.for(Import.adoptElement)
                .plus(attributes.imports)
                .plus(childImports)
                .plus(renderedRef.imports),
            [...attributes.validations, ...childValidations, ...renderedRef.validations],
            renderedRef.refs,
        );
    }

    // Has ref (or forceAdopt) but no dynamic text and no dynamic attrs
    // Recurse into children to find nested dynamic nodes
    const childFragments = mergeHydrateFragments(
        childNodes.map((child) => renderHydrateNode(child, context)),
        ',\n',
    );
    const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';
    const childrenArr = childFragments.rendered.trim() ? `[${childFragments.rendered}]` : '[]';
    return new RenderFragment(
        `${indent.firstLine}adoptElement("${coordinate}", {}, ${childrenArr}${refSuffix})`,
        Imports.for(Import.adoptElement).plus(childFragments.imports).plus(renderedRef.imports),
        [...childFragments.validations, ...renderedRef.validations],
        mergeRefsTrees(childFragments.refs, renderedRef.refs),
    );
}

function renderHydrate(
    types: JayType,
    rootBodyElement: HTMLElement,
    importStatements: JayImportLink[],
    elementType: string,
    preRenderType: string,
    refsType: string,
    headlessImports: JayHeadlessImports[],
): RenderFragment {
    const variables = new Variables(types);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const { importedSymbols } = processImportedComponents(importStatements);
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
    const context: HydrateContext = {
        variables,
        indent: new Indent('        '),
        coordinateCounter: { count: 0 },
        dynamicRef: false,
        refNameGenerator: new RefNameGenerator(),
        importedRefNameToRef,
        importedSymbols,
        headlessContractNames,
    };

    // Always adopt the root body element — it provides the single-expression
    // return value for the constructor, composing all children.
    let renderedHydrate = renderHydrateElementContent(
        rootBodyElement,
        context,
        buildRenderContext(context),
        null,
        true, // forceAdopt — root body element always needs adoption
    );
    renderedHydrate = optimizeRefs(renderedHydrate, headlessImports);

    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        renderedHydrate.refs,
        ReferenceManagerTarget.element,
    );

    const hasAdoptCalls = renderedHydrate.rendered.trim().length > 0;
    const hydrateBody = hasAdoptCalls
        ? `() =>\n${renderedHydrate.rendered}`
        : `() => ({ dom: rootElement, update: () => {}, mount: () => {}, unmount: () => {} })`;

    return new RenderFragment(
        `export function hydrate(rootElement: Element, options?: RenderElementOptions): ${preRenderType} {
${renderedRefsManager}
    const render = (viewState: ${types.name}) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, ${hydrateBody}) as ${elementType};
    return [refManager.getPublicAPI() as ${refsType}, render];
}`,
        Imports.for(Import.ConstructContext, Import.RenderElementOptions)
            .plus(renderedHydrate.imports)
            .plus(refsManagerImport),
        renderedHydrate.validations,
        renderedHydrate.refs,
    );
}

export function generateElementHydrateFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
): WithValidations<string> {
    const types = generateTypes(jayFile.types);
    const {
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
        importerMode,
        jayFile.headLinks,
    );
    const phaseTypes = generatePhaseSpecificTypes(jayFile);
    const renderedHydrate = renderHydrate(
        jayFile.types,
        jayFile.body,
        jayFile.imports,
        elementType,
        preRenderType,
        refsType,
        jayFile.headlessImports,
    );

    // If we have contract or inline data, replace the 2-parameter JayContract with 5-parameter version
    let finalRenderedElement = renderedElement;
    if (jayFile.contract || jayFile.hasInlineData) {
        const baseName = jayFile.baseElementName;
        const contractPattern = new RegExp(
            `export type ${baseName}Contract = JayContract<([^,]+), ${baseName}ElementRefs>;`,
            'g',
        );
        finalRenderedElement = finalRenderedElement.replace(
            contractPattern,
            (match, viewStateType) => {
                return `export type ${baseName}Contract = JayContract<
    ${viewStateType},
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;
            },
        );
    }

    // Combine imports: type definitions (from renderedImplementation) + hydrate function.
    // Strip element creation imports that come from the type definitions but aren't
    // actually used in the hydrate code. Keep them if the hydrate code itself needs them
    // (e.g., forEach create callback uses e() and dt()).
    const typeOnlyImports = renderedImplementation.imports
        .minus(renderedHydrate.imports)
        .minus(Import.element)
        .minus(Import.dynamicText)
        .minus(Import.dynamicElement)
        .minus(Import.conditional)
        .minus(Import.forEach);
    const hydrateImports = typeOnlyImports.plus(Import.jayElement).plus(renderedHydrate.imports);

    const renderedFile = [
        renderImports(hydrateImports, ImportsFor.implementation, jayFile.imports, importerMode),
        types,
        renderedRefs,
        phaseTypes,
        finalRenderedElement,
        renderedHydrate.rendered,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
    return new WithValidations(renderedFile, renderedHydrate.validations);
}

// ============================================================================
// Server Element Target
// ============================================================================

interface ServerContext {
    variables: Variables;
    indent: Indent;
    coordinateCounter: { count: number };
}

/** Helper: create a single-line w() statement as a RenderFragment */
function w(indent: Indent, code: string, imports: Imports = Imports.none()): RenderFragment {
    return new RenderFragment(`${indent.firstLine}w(${code});`, imports);
}

function renderServerNode(node: Node, context: ServerContext): RenderFragment {
    if (node.nodeType === NodeType.TEXT_NODE) {
        const text = node.innerText;
        if (text.trim() === '') return RenderFragment.empty();
        // Use template PEG rule to get raw accessor (no dt() wrapping)
        const [fragment, isDynamic] = parseServerTemplateExpression(
            textEscape(text),
            context.variables,
        );
        if (isDynamic) {
            return w(
                context.indent,
                `escapeHtml(String(${fragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            );
        }
        // Static text — fragment.rendered is already single-quoted
        return w(context.indent, fragment.rendered);
    }
    if (node.nodeType === NodeType.ELEMENT_NODE) {
        return renderServerElement(node as HTMLElement, context);
    }
    return RenderFragment.empty();
}

function renderServerElement(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables, indent } = context;

    // --- Conditional (if=) ---
    if (isConditional(element)) {
        const condition = element.getAttribute('if');
        // Use condition PEG rule (raw expression, no arrow function wrapping)
        const renderedCondition = parseServerCondition(condition, variables);
        // Force coordinate assignment on conditional elements to keep the coordinate
        // counter aligned with the hydrate target (which always assigns coordinates
        // to conditionals). Without this, coordinates diverge after the first
        // conditional and hydration fails to adopt the correct elements.
        const body = renderServerElementContent(
            element,
            { ...context, indent: new Indent(indent.curr + '    ') },
            true,
        );
        return new RenderFragment(
            `${indent.firstLine}if (${renderedCondition.rendered}) {\n${body.rendered}\n${indent.firstLine}}`,
            body.imports,
            body.validations,
        );
    }

    // --- forEach ---
    if (isForEach(element)) {
        const forEach = element.getAttribute('forEach');
        const trackBy = element.getAttribute('trackBy');
        const forEachAccessor = parseAccessor(forEach, variables);

        if (forEachAccessor.resolvedType === JayUnknown)
            return new RenderFragment('', Imports.none(), [
                `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
            ]);
        if (!isArrayType(forEachAccessor.resolvedType))
            return new RenderFragment('', Imports.none(), [
                `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
            ]);

        const forEachVariables = variables.childVariableFor(forEachAccessor);
        const arrayExpr = forEachAccessor.render().rendered;
        const itemIndent = new Indent(indent.curr + '    ');
        const itemContext: ServerContext = {
            ...context,
            variables: forEachVariables,
            indent: itemIndent,
            coordinateCounter: { count: 0 },
        };

        // Build opening tag for each item with jay-coordinate from trackBy
        const trackByExpr = `${forEachVariables.currentVar}.${trackBy}`;
        const openTag = renderServerOpenTag(element, itemContext, null);
        const coordinateW = w(
            itemIndent,
            `' jay-coordinate="' + escapeAttr(String(${trackByExpr})) + '">'`,
            Imports.for(Import.escapeAttr),
        );

        // Render children
        const childNodes = element.childNodes.filter(
            (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
        );
        const children = mergeServerFragments(
            childNodes.map((child) => renderServerNode(child, itemContext)),
        );
        const closeTag = w(itemIndent, `'</${element.rawTagName}>'`);

        const itemBody = mergeServerFragments([openTag, coordinateW, children, closeTag]);

        return new RenderFragment(
            `${indent.firstLine}for (const ${forEachVariables.currentVar} of ${arrayExpr}) {\n${itemBody.rendered}\n${indent.firstLine}}`,
            itemBody.imports,
            itemBody.validations,
        );
    }

    // --- Async directives are handled by the parent's child processing ---
    // when-loading, when-resolved, when-rejected are never reached here
    // because renderServerElementContent groups them and handles them directly.

    // --- Regular element ---
    return renderServerElementContent(element, context);
}

/** Merge multiple server fragments, filtering out empty ones. */
function mergeServerFragments(fragments: RenderFragment[]): RenderFragment {
    return fragments
        .filter((f) => f.rendered.trim().length > 0)
        .reduce((prev, curr) => RenderFragment.merge(prev, curr, '\n'), RenderFragment.empty());
}

/**
 * Build the opening tag w() calls (tag name + attributes) as a RenderFragment.
 * coordinateClose: if non-null, append jay-coordinate and '>'; if null, just '>'.
 */
function renderServerOpenTag(
    element: HTMLElement,
    context: ServerContext,
    coordinateClose: string | null,
): RenderFragment {
    const parts: RenderFragment[] = [];
    parts.push(w(context.indent, `'<${element.rawTagName}'`));

    const attrs = renderServerAttributes(element, context);
    if (attrs.rendered.trim()) {
        parts.push(attrs);
    }

    // coordinateClose is appended by the caller for forEach (dynamic coordinate)
    // For regular elements, it's included here
    if (coordinateClose !== null) {
        parts.push(w(context.indent, `' jay-coordinate="${coordinateClose}">'`));
    }
    // If coordinateClose is null, caller handles closing the tag

    return mergeServerFragments(parts);
}

function renderServerAttributes(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables, indent } = context;
    const attributes = element.attributes;
    const parts: RenderFragment[] = [];

    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
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

        const attrValue = attributes[attrName];

        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue === '') {
                parts.push(w(indent, `' ${attrCanonical}'`));
            } else {
                // Use condition PEG rule (raw expression)
                const condExpr = parseServerCondition(attrValue, variables);
                parts.push(
                    new RenderFragment(
                        `${indent.firstLine}if (${condExpr.rendered}) { w(' ${attrCanonical}'); }`,
                    ),
                );
            }
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [fragment, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) {
                parts.push(
                    w(
                        indent,
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' ${attrCanonical}="${escaped}"'`));
            }
        } else if (attrCanonical === 'class') {
            // Class attribute — may have conditional class syntax like {bool1?main}
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) {
                // classExpression PEG wraps dynamic classes with da(vs => `...`).
                // Extract the template literal: strip "da(vs => " prefix and ")" suffix.
                const rawExpr = classExpr.rendered.replace(/^da\(\w+ => /, '').replace(/\)$/, '');
                parts.push(
                    w(
                        indent,
                        `' class="' + escapeAttr(String(${rawExpr})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' class="${escaped}"'`));
            }
        } else if (attrCanonical === 'style') {
            const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            parts.push(w(indent, `' style="${escaped}"'`));
        } else {
            // Regular attribute — use template PEG rule for raw accessor
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    w(
                        indent,
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(w(indent, `' ${attrCanonical}="${escaped}"'`));
            }
        }
    });

    return mergeServerFragments(parts);
}

/** Void elements that don't have closing tags */
const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

/**
 * Render a server node as a string concatenation expression (for async template functions).
 * Instead of w() calls, returns string expressions like `'<span>' + escapeHtml(String(val)) + '</span>'`.
 */
function renderServerNodeAsString(node: Node, context: ServerContext): RenderFragment {
    if (node.nodeType === NodeType.TEXT_NODE) {
        const text = node.innerText;
        if (text.trim() === '') return RenderFragment.empty();
        const [fragment, isDynamic] = parseServerTemplateExpression(
            textEscape(text),
            context.variables,
        );
        if (isDynamic) {
            return new RenderFragment(
                `escapeHtml(String(${fragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            );
        }
        return new RenderFragment(fragment.rendered);
    }
    if (node.nodeType === NodeType.ELEMENT_NODE) {
        const el = node as HTMLElement;
        // Handle forEach inside template strings — use .map().join('')
        if (isForEach(el)) {
            return renderServerForEachAsString(el, context);
        }
        return renderServerElementAsString(el, context);
    }
    return RenderFragment.empty();
}

/**
 * Render a forEach element as a string expression using .map().join('').
 */
function renderServerForEachAsString(element: HTMLElement, context: ServerContext): RenderFragment {
    const { variables } = context;
    const forEach = element.getAttribute('forEach');
    const forEachAccessor = parseAccessor(forEach, variables);

    if (forEachAccessor.resolvedType === JayUnknown)
        return new RenderFragment('', Imports.none(), [
            `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
        ]);
    if (!isArrayType(forEachAccessor.resolvedType))
        return new RenderFragment('', Imports.none(), [
            `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
        ]);

    const forEachVariables = variables.childVariableFor(forEachAccessor);
    const arrayExpr = forEachAccessor.render().rendered;
    const itemContext: ServerContext = {
        ...context,
        variables: forEachVariables,
        coordinateCounter: { count: 0 },
    };

    // Render the element content (not the forEach wrapper) as a string
    const itemContent = renderServerElementAsString(element, itemContext);

    return new RenderFragment(
        `${arrayExpr}.map((${forEachVariables.currentVar}) => ${itemContent.rendered}).join('')`,
        itemContent.imports,
        itemContent.validations,
    );
}

/**
 * Render a server element as a string concatenation expression (for async template functions).
 * Handles conditionals and forEach within resolved/rejected templates.
 */
function renderServerElementAsString(
    element: HTMLElement,
    context: ServerContext,
    overrideCoordinate?: string,
): RenderFragment {
    const { variables } = context;
    const refAttr = element.attributes.ref;
    const refName = refAttr ? camelCase(refAttr) : null;

    const childNodes =
        element.childNodes.length > 1
            ? element.childNodes.filter(
                  (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
              )
            : element.childNodes;

    // Determine coordinate
    let dynamicTextFragment: RenderFragment | null = null;
    if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const [fragment, isDynamic] = parseServerTemplateExpression(textEscape(text), variables);
        if (isDynamic) {
            dynamicTextFragment = fragment;
        }
    }

    const needsCoordinate =
        overrideCoordinate !== undefined ||
        dynamicTextFragment !== null ||
        refName !== null ||
        hasDynamicAttributeBindings(element, variables) ||
        hasInteractiveChildElements(childNodes);

    let coordinate: string | null = null;
    if (needsCoordinate) {
        coordinate = overrideCoordinate || refName || String(context.coordinateCounter.count++);
    }

    const isVoid = voidElements.has(element.rawTagName.toLowerCase());
    const stringParts: RenderFragment[] = [];

    // Opening tag
    stringParts.push(new RenderFragment(`'<${element.rawTagName}'`));

    // Attributes (rendered as string parts)
    const attrs = renderServerAttributesAsString(element, context);
    if (attrs.rendered.trim()) {
        stringParts.push(attrs);
    }

    if (coordinate !== null) {
        stringParts.push(new RenderFragment(`' jay-coordinate="${coordinate}">'`));
    } else {
        stringParts.push(new RenderFragment(`'>'`));
    }

    if (!isVoid) {
        // Children
        if (dynamicTextFragment) {
            stringParts.push(
                new RenderFragment(
                    `escapeHtml(String(${dynamicTextFragment.rendered}))`,
                    Imports.for(Import.escapeHtml),
                ),
            );
        } else {
            for (const child of childNodes) {
                const childFragment = renderServerNodeAsString(child, context);
                if (childFragment.rendered.trim()) {
                    stringParts.push(childFragment);
                }
            }
        }

        // Closing tag
        stringParts.push(new RenderFragment(`'</${element.rawTagName}>'`));
    }

    // Join all parts with ' + '
    const filtered = stringParts.filter((f) => f.rendered.trim().length > 0);
    if (filtered.length === 0) return RenderFragment.empty();
    return filtered.reduce(
        (prev, curr) =>
            new RenderFragment(
                prev.rendered + ' + ' + curr.rendered,
                prev.imports.plus(curr.imports),
                [...prev.validations, ...curr.validations],
            ),
    );
}

/**
 * Render attributes as string parts for template string mode.
 * Returns a fragment like `' class="foo"' + ' href="' + escapeAttr(...) + '"'`
 */
function renderServerAttributesAsString(
    element: HTMLElement,
    context: ServerContext,
): RenderFragment {
    const { variables } = context;
    const attributes = element.attributes;
    const parts: RenderFragment[] = [];

    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
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

        const attrValue = attributes[attrName];

        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue === '') {
                parts.push(new RenderFragment(`' ${attrCanonical}'`));
            }
            // Dynamic boolean attributes in template strings are complex — skip for now
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [fragment, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) {
                parts.push(
                    new RenderFragment(
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' ${attrCanonical}="${escaped}"'`));
            }
        } else if (attrCanonical === 'class') {
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) {
                const rawExpr = classExpr.rendered.replace(/^da\(\w+ => /, '').replace(/\)$/, '');
                parts.push(
                    new RenderFragment(
                        `' class="' + escapeAttr(String(${rawExpr})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' class="${escaped}"'`));
            }
        } else if (attrCanonical === 'style') {
            const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            parts.push(new RenderFragment(`' style="${escaped}"'`));
        } else {
            const [fragment, isDynamic] = parseServerTemplateExpression(
                textEscape(attrValue),
                variables,
            );
            if (isDynamic) {
                parts.push(
                    new RenderFragment(
                        `' ${attrCanonical}="' + escapeAttr(String(${fragment.rendered})) + '"'`,
                        Imports.for(Import.escapeAttr),
                    ),
                );
            } else {
                const escaped = attrValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                parts.push(new RenderFragment(`' ${attrCanonical}="${escaped}"'`));
            }
        }
    });

    const filtered = parts.filter((f) => f.rendered.trim().length > 0);
    if (filtered.length === 0) return RenderFragment.empty();
    return filtered.reduce(
        (prev, curr) =>
            new RenderFragment(
                prev.rendered + ' + ' + curr.rendered,
                prev.imports.plus(curr.imports),
                [...prev.validations, ...curr.validations],
            ),
    );
}

/**
 * Collect async directive groups from child nodes.
 * Groups when-loading, when-resolved, when-rejected by property name.
 */
interface AsyncGroup {
    propertyName: string;
    loadingElement: HTMLElement | null;
    resolvedElement: HTMLElement | null;
    rejectedElement: HTMLElement | null;
}

function collectAsyncGroups(childNodes: Node[]): Map<string, AsyncGroup> {
    const groups = new Map<string, AsyncGroup>();
    for (const child of childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const el = child as HTMLElement;
        const asyncDir = checkAsync(el);
        if (!asyncDir.isAsync) continue;
        const propName = el.getAttribute(asyncDir.directive);
        if (!groups.has(propName)) {
            groups.set(propName, {
                propertyName: propName,
                loadingElement: null,
                resolvedElement: null,
                rejectedElement: null,
            });
        }
        const group = groups.get(propName);
        if (asyncDir === AsyncDirectiveTypes.loading) group.loadingElement = el;
        else if (asyncDir === AsyncDirectiveTypes.resolved) group.resolvedElement = el;
        else if (asyncDir === AsyncDirectiveTypes.rejected) group.rejectedElement = el;
    }
    return groups;
}

function renderServerElementContent(
    element: HTMLElement,
    context: ServerContext,
    forceCoordinate: boolean = false,
): RenderFragment {
    const { variables, indent } = context;
    const refAttr = element.attributes.ref;
    const refName = refAttr ? camelCase(refAttr) : null;

    // Check if this element has a single dynamic text child
    const childNodes =
        element.childNodes.length > 1
            ? element.childNodes.filter(
                  (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
              )
            : element.childNodes;

    let dynamicTextFragment: RenderFragment | null = null;
    if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const [fragment, isDynamic] = parseServerTemplateExpression(textEscape(text), variables);
        if (isDynamic) {
            dynamicTextFragment = fragment;
        }
    }

    // Determine coordinate
    const needsCoordinate =
        forceCoordinate ||
        dynamicTextFragment !== null ||
        refName !== null ||
        hasDynamicAttributeBindings(element, variables) ||
        hasInteractiveChildElements(childNodes);

    let coordinate: string | null = null;
    if (needsCoordinate) {
        coordinate = refName || String(context.coordinateCounter.count++);
    }

    const isVoid = voidElements.has(element.rawTagName.toLowerCase());
    const parts: RenderFragment[] = [];

    // Opening tag
    parts.push(w(indent, `'<${element.rawTagName}'`));
    const attrs = renderServerAttributes(element, context);
    if (attrs.rendered.trim()) {
        parts.push(attrs);
    }
    if (coordinate !== null) {
        parts.push(w(indent, `' jay-coordinate="${coordinate}">'`));
    } else {
        parts.push(w(indent, `'>'`));
    }

    if (isVoid) return mergeServerFragments(parts);

    // Children
    if (dynamicTextFragment) {
        parts.push(
            w(
                indent,
                `escapeHtml(String(${dynamicTextFragment.rendered}))`,
                Imports.for(Import.escapeHtml),
            ),
        );
    } else {
        const childContext = { ...context, indent: new Indent(indent.curr + '    ') };
        // Collect async groups for this element's children
        const asyncGroups = collectAsyncGroups(childNodes);
        const processedAsyncProps = new Set<string>();

        for (const child of childNodes) {
            // Skip async resolved/rejected — they're handled when we encounter their loading sibling
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                const asyncDir = checkAsync(child as HTMLElement);
                if (
                    asyncDir === AsyncDirectiveTypes.resolved ||
                    asyncDir === AsyncDirectiveTypes.rejected
                ) {
                    continue;
                }
                if (asyncDir === AsyncDirectiveTypes.loading) {
                    const propName = (child as HTMLElement).getAttribute(asyncDir.directive);
                    if (processedAsyncProps.has(propName)) continue;
                    processedAsyncProps.add(propName);

                    const group = asyncGroups.get(propName);
                    const asyncFragment = renderServerAsyncGroup(group, childContext);
                    if (asyncFragment.rendered.trim()) {
                        parts.push(asyncFragment);
                    }
                    continue;
                }
            }

            const childFragment = renderServerNode(child, childContext);
            if (childFragment.rendered.trim()) {
                parts.push(childFragment);
            }
        }
    }

    // Closing tag
    parts.push(w(indent, `'</${element.rawTagName}>'`));

    return mergeServerFragments(parts);
}

/**
 * Render an async group: when-loading inline + onAsync() call with resolved/rejected templates.
 */
function renderServerAsyncGroup(group: AsyncGroup, context: ServerContext): RenderFragment {
    const { variables, indent } = context;
    const propName = group.propertyName;
    const parts: RenderFragment[] = [];

    // Parse the async accessor from the parent's variables
    const asyncAccessor = parseAccessor(propName, variables);
    if (asyncAccessor.resolvedType === JayUnknown) {
        return new RenderFragment('', Imports.none(), [
            `async directive - failed to resolve type for when-loading=${propName}`,
        ]);
    }
    if (!isPromiseType(asyncAccessor.resolvedType)) {
        return new RenderFragment('', Imports.none(), [
            `async directive - resolved type for when-loading=${propName} is not a promise`,
        ]);
    }

    // 1. Render when-loading inline with jay-async wrapper
    if (group.loadingElement) {
        parts.push(w(indent, `'<div jay-async="${propName}:pending">'`));

        // Render the loading element's content (using parent variables — not resolved type)
        const loadingContent = renderServerElementContent(group.loadingElement, context);
        if (loadingContent.rendered.trim()) {
            parts.push(loadingContent);
        }

        parts.push(w(indent, `'</div>'`));
    }

    // 2. Build onAsync() call with resolved/rejected template functions
    const templateParts: string[] = [];
    let templateImports = Imports.none();
    const templateValidations: string[] = [];

    if (group.resolvedElement) {
        const promiseResolvedType = asyncAccessor.resolvedType.itemType;
        const resolvedVariables = new Variables(promiseResolvedType, variables, 1);
        const resolvedContext: ServerContext = {
            ...context,
            variables: resolvedVariables,
            coordinateCounter: { count: 0 },
        };
        const resolvedString = renderServerElementAsString(
            group.resolvedElement,
            resolvedContext,
            propName,
        );
        templateParts.push(
            `resolved: (${resolvedVariables.currentVar}) => ${resolvedString.rendered}`,
        );
        templateImports = templateImports.plus(resolvedString.imports);
        templateValidations.push(...resolvedString.validations);
    }

    if (group.rejectedElement) {
        const rejectedVariables = new Variables(JayErrorType, variables, 1);
        const rejectedContext: ServerContext = {
            ...context,
            variables: rejectedVariables,
            coordinateCounter: { count: 0 },
        };
        const rejectedString = renderServerElementAsString(
            group.rejectedElement,
            rejectedContext,
            propName,
        );
        templateParts.push(
            `rejected: (${rejectedVariables.currentVar}) => ${rejectedString.rendered}`,
        );
        templateImports = templateImports.plus(rejectedString.imports);
        templateValidations.push(...rejectedString.validations);
    }

    // Emit onAsync call
    const asyncExpr = asyncAccessor.render().rendered;
    const onAsyncCall = `${indent.firstLine}onAsync(${asyncExpr}, '${propName}', {${templateParts.join(', ')}});`;
    parts.push(new RenderFragment(onAsyncCall, templateImports, templateValidations));

    return mergeServerFragments(parts);
}

function hasDynamicAttributeBindings(element: HTMLElement, variables: Variables): boolean {
    const attributes = element.attributes;
    for (const attrName of Object.keys(attributes)) {
        const attrCanonical = attrName.toLowerCase();
        if (
            attrCanonical === 'if' ||
            attrCanonical === 'foreach' ||
            attrCanonical === 'trackby' ||
            attrCanonical === 'ref' ||
            attrCanonical === 'slowforeach' ||
            attrCanonical === 'jayindex' ||
            attrCanonical === 'jaytrackby'
        )
            continue;
        const attrValue = attributes[attrName];
        if (propertyMapping[attrCanonical]?.type === BOOLEAN_ATTRIBUTE) {
            if (attrValue !== '') return true; // Dynamic boolean is always dynamic
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const [, isDynamic] = parseServerTemplateExpression(attrValue, variables);
            if (isDynamic) return true;
        } else if (attrCanonical === 'class') {
            const classExpr = parseClassExpression(attrValue, variables);
            if (classExpr.imports.has(Import.dynamicAttribute)) return true;
        } else {
            const [, isDynamic] = parseServerTemplateExpression(textEscape(attrValue), variables);
            if (isDynamic) return true;
        }
    }
    return false;
}

function hasInteractiveChildElements(childNodes: Node[]): boolean {
    return childNodes.some(
        (child) =>
            child.nodeType === NodeType.ELEMENT_NODE &&
            (isConditional(child as HTMLElement) ||
                isForEach(child as HTMLElement) ||
                checkAsync(child as HTMLElement).isAsync),
    );
}

export function generateServerElementFile(jayFile: JayHtmlSourceFile): WithValidations<string> {
    const types = generateTypes(jayFile.types);
    const variables = new Variables(jayFile.types);
    const rootElement = ensureSingleChildElement(jayFile.body);

    if (!rootElement.val) {
        return new WithValidations('', rootElement.validations);
    }

    const context: ServerContext = {
        variables,
        indent: new Indent('    '),
        coordinateCounter: { count: 0 },
    };

    // Render root element with forced coordinate (matches hydrate forceAdopt)
    const rendered = renderServerElementContent(rootElement.val as HTMLElement, context, true);

    const viewStateType = jayFile.types.name;

    // Detect if async is used (onAsync call was emitted)
    const hasAsync = rendered.rendered.includes('onAsync(');

    // Build import statement for ssr-runtime
    const importParts: string[] = [];
    if (rendered.imports.has(Import.escapeHtml)) importParts.push('escapeHtml');
    if (rendered.imports.has(Import.escapeAttr)) importParts.push('escapeAttr');
    importParts.push('type ServerRenderContext');

    const importStatement = `import {${importParts.join(', ')}} from "@jay-framework/ssr-runtime";`;

    // Destructure onAsync from ctx when async directives are present
    const ctxDestructure = hasAsync
        ? 'const { write: w, onAsync } = ctx;'
        : 'const { write: w } = ctx;';

    const renderedFile = [
        importStatement,
        types,
        `export function renderToStream(vs: ${viewStateType}, ctx: ServerRenderContext): void {
    ${ctxDestructure}
${rendered.rendered}
}`,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');

    return new WithValidations(renderedFile, rendered.validations);
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
