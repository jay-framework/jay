/**
 * Hydrate compilation target.
 * Extracted from jay-html-compiler.ts (Design Log #118).
 */
import {
    Import,
    Imports,
    JayErrorType,
    JayImportLink,
    JayPromiseType,
    JayType,
    JayTypeAlias,
    JayUnknown,
    mergeRefsTrees,
    mkRef,
    mkRefsTree,
    nestRefs,
    Ref,
    RefsTree,
    RenderFragment,
    RuntimeMode,
    computeInstanceKey,
    compileForEachInstanceKeyExpr,
} from '@jay-framework/compiler-shared';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import {
    parseAccessor,
    parseClassExpression,
    parseCondition,
    parseTextExpression,
    Variables,
} from '../expressions/expression-compiler';
import { camelCase } from '../case-utils';
import { pascalCase } from 'change-case';
import { Contract } from '../contract';
import { JayHeadlessImports, JayHtmlNamespace } from './jay-html-source-file';
import {
    AsyncDirectiveTypes,
    checkAsync,
    ensureSingleChildElement,
    getComponentName,
    getSlowForEachInfo,
    isConditional,
    isForEach,
    isSlowForEach,
} from './jay-html-helpers';
import { Indent } from './indent';
import {
    elementNameToJayType,
    optimizeRefs,
    ReferenceManagerTarget,
    RefNameGenerator,
    renderReferenceManager,
} from './jay-html-compile-refs';
import { processImportedComponents } from './jay-html-compile-imports';
import { assignCoordinates } from './assign-coordinates';
import {
    BOOLEAN_ATTRIBUTE,
    buildContractRefMap,
    COORD_ATTR,
    extractHeadlessCoordinate,
    filterContentNodes,
    isValidationError,
    PROPERTY,
    propertyMapping,
    resolveHeadlessImport,
    textEscape,
    validateAsyncAccessor,
    validateForEachAccessor,
    validateSlowForEachAccessor,
} from './jay-html-compiler-shared';
import {
    buildInteractivePaths,
    conditionIsInteractive,
    simplifyConditionForHydrate,
    textHasInteractiveBindings,
} from './jay-html-compiler-phase';
import {
    hasDynamicAttributeBindings,
    hasInteractiveChildElements,
    hasMixedContentDynamicText,
    hasMixedContentDynamicTextInteractive,
} from './jay-html-compiler-server';
import {
    type HeadlessInstanceDefinition,
    type RenderContext,
    processImportedHeadless,
    renderAttributes,
    renderChildCompProps,
    renderChildCompRef,
    renderDynamicAttributes,
    renderElementRef,
    renderNode,
} from './jay-html-compiler';

interface HydrateContext {
    variables: Variables;
    indent: Indent;
    dynamicRef: boolean;
    refNameGenerator: RefNameGenerator;
    importedRefNameToRef: Map<string, Ref>;
    importedSymbols: Set<string>;
    headlessContractNames: Set<string>;
    /** Full headless imports (for headless instance compilation) */
    headlessImports: JayHeadlessImports[];
    /** Accumulated headless instance definitions (emitted at module level) */
    headlessInstanceDefs: HeadlessInstanceDefinition[];
    /** Counter for unique headless instance names */
    headlessInstanceCounter: { count: number };
    /** Whether we're inside a forEach (affects coordinate key format) */
    insideFastForEach: boolean;
    /** Whether we're inside a slowForEach (affects instance key computation) */
    insideSlowForEach: boolean;
    /** The jayTrackBy value of the current slowForEach (for stripping coordinate prefixes) */
    slowForEachJayTrackBy?: string;
    /** Variable mappings for compiling $placeholder coordinates inside forEach */
    varMappings: Record<string, string>;
    /**
     * When compiling a headless instance's adopt inline template, the instance's full coordinate
     * (e.g. "0/2/1/product-widget:0"). Child adoptElement calls use relative coordinates so
     * childCompHydrate's forInstance(instanceCoord) can resolve them correctly.
     */
    instanceCoordPrefix?: string;
    /** Property paths whose phase is 'fast+interactive' — only these need client adoption */
    interactivePaths: Set<string>;
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
        insideFastForEach: context.insideFastForEach,
        usedComponentImports: new Set(),
        headlessContractNames: context.headlessContractNames,
        headlessImports: context.headlessImports,
        headlessInstanceDefs: context.headlessInstanceDefs,
        headlessInstanceCounter: context.headlessInstanceCounter,
        // Element target still uses its own coordinate logic (DL#103: out of scope)
        coordinatePrefix: [],
        coordinateCounters: new Map(),
    };
}

function renderHydrateElement(element: HTMLElement, context: HydrateContext): RenderFragment {
    const renderContext = buildRenderContext(context);

    // --- Headless component instance (<jay:contract-name>) ---
    // Must be checked BEFORE conditional, since a headless instance may have if= attribute.
    const componentMatch = getComponentName(
        element.rawTagName,
        context.importedSymbols,
        context.headlessContractNames,
    );
    if (componentMatch !== null && componentMatch.kind === 'headless-instance') {
        return renderHydrateHeadlessInstance(element, context, renderContext, componentMatch.name);
    }

    // --- Conditional (if=) ---
    // Skip hydrateConditional for non-interactive conditions (slow/fast-only).
    // These are resolved at SSR and static on the client — treat as regular element.
    if (
        isConditional(element) &&
        conditionIsInteractive(element.getAttribute('if'), context.interactivePaths)
    ) {
        const condition = simplifyConditionForHydrate(
            element.getAttribute('if'),
            context.interactivePaths,
        );
        const renderedCondition = parseCondition(condition, context.variables);
        // Read coordinate from jay-coordinate-base (DL#103)
        const coordinate = element.getAttribute(COORD_ATTR) || '0';
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

        // Generate creation callback for false-at-SSR fallback (Level 3).
        // Uses the standard element target (e(), dt(), da()) — same pattern
        // as hydrateForEach's createItem callback.
        const createRenderContext: RenderContext = {
            ...renderContext,
            indent: new Indent('    ').child().noFirstLineBreak(),
            isInsideGuard: true,
        };
        const createChildNodes = filterContentNodes(element.childNodes);
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
        // Use de() (dynamicElement) when children include conditionals/forEach,
        // matching the standard element target's e() vs de() decision.
        const needDynamicElement = createChildNodes.some(
            (_) =>
                _.nodeType === NodeType.ELEMENT_NODE &&
                (isConditional(_ as HTMLElement) ||
                    isForEach(_ as HTMLElement) ||
                    isSlowForEach(_ as HTMLElement) ||
                    checkAsync(_ as HTMLElement).isAsync),
        );
        const createElementFunc = needDynamicElement ? 'de' : 'e';
        const createElementImport = needDynamicElement ? Import.dynamicElement : Import.element;
        const createBody = `() => ${createElementFunc}('${element.rawTagName}', ${createAttributes.rendered}, [${createChildren.rendered}])`;

        return new RenderFragment(
            `${context.indent.firstLine}hydrateConditional(${renderedCondition.rendered}, ${adoptBody},\n${context.indent.firstLine}    ${createBody})`,
            Imports.for(Import.hydrateConditional)
                .plus(createElementImport)
                .plus(renderedCondition.imports)
                .plus(childContent.imports)
                .plus(createChildren.imports)
                .plus(createAttributes.imports),
            [
                ...renderedCondition.validations,
                ...childContent.validations,
                ...createChildren.validations,
            ],
            childContent.refs,
        );
    }

    // --- forEach ---
    if (isForEach(element)) {
        const { variables, indent } = context;
        const forEach = element.getAttribute('forEach');
        const trackBy = element.getAttribute('trackBy');

        const validated = validateForEachAccessor(forEach, variables);
        if (isValidationError(validated)) return validated;
        const { accessor: forEachAccessor, childVariables: forEachVariables } = validated;

        const paramName = forEachAccessor.rootVar;
        const paramType = variables.currentType.name;
        const forEachFragment = forEachAccessor
            .render()
            .map((_) => `(${paramName}: ${paramType}) => ${_}`);

        // Snapshot ref name generator state BEFORE the adopt callback runs.
        // The create callback needs the same starting state so it generates
        // the same ref names as the adopt callback for this forEach.
        const preAdoptRefNameGenerator = context.refNameGenerator.clone();

        // Adopt callback: render item children and return as an array.
        // hydrateForEach combines them into a single BaseJayElement internally.
        const itemChildNodes = filterContentNodes(element.childNodes);
        const trackByExpr = `${forEachVariables.currentVar}.${trackBy}`;
        const itemContext: HydrateContext = {
            ...context,
            variables: forEachVariables,
            indent: indent.child().child(),
            dynamicRef: true, // Refs inside forEach are collection refs
            insideFastForEach: true,
            varMappings: { ...context.varMappings, [trackBy]: trackByExpr },
        };
        // Check if forEach item element itself needs adoption (dynamic attrs or ref)
        const itemRenderCtx = buildRenderContext(itemContext);
        const itemAttrs = renderDynamicAttributes(element, itemRenderCtx);
        const itemHasDynamicAttrs =
            itemAttrs.imports.has(Import.dynamicAttribute) ||
            itemAttrs.imports.has(Import.dynamicProperty) ||
            itemAttrs.imports.has(Import.booleanAttribute);
        const itemRefFragment = renderElementRef(element, itemRenderCtx);
        const needsItemAdoption = itemHasDynamicAttrs || !!itemRefFragment.rendered.trim();

        // Check if forEach item children contain interactive conditionals or forEach (DL#121).
        // When true, wrap in adoptDynamicElement to create a Kindergarten with groups for
        // dynamic children, enabling condition toggling after hydration.
        const itemHasInteractiveChildren = itemChildNodes.some(
            (child) =>
                child.nodeType === NodeType.ELEMENT_NODE &&
                ((isConditional(child as HTMLElement) &&
                    conditionIsInteractive(
                        (child as HTMLElement).getAttribute('if'),
                        context.interactivePaths,
                    )) ||
                    isForEach(child as HTMLElement)),
        );

        let adoptBody: string;
        let itemContent: RenderFragment;

        if (itemHasInteractiveChildren) {
            // Build children with STATIC/dynamic classification — same pattern as
            // adoptDynamicElement for regular elements.
            const childParts: string[] = [];
            let childImports = Imports.none();
            const childValidations: string[] = [];
            const childRefs: RefsTree[] = [];

            for (const child of itemChildNodes) {
                if (child.nodeType !== NodeType.ELEMENT_NODE) {
                    // Text nodes: render normally, include if they produce hydrate code
                    const frag = renderHydrateNode(child, itemContext);
                    if (frag.rendered.trim()) {
                        childParts.push(frag.rendered);
                        childImports = childImports.plus(frag.imports);
                        childValidations.push(...frag.validations);
                        if (frag.refs) childRefs.push(frag.refs);
                    }
                    continue;
                }
                const htmlChild = child as HTMLElement;
                if (
                    (isConditional(htmlChild) &&
                        conditionIsInteractive(
                            htmlChild.getAttribute('if'),
                            context.interactivePaths,
                        )) ||
                    isForEach(htmlChild)
                ) {
                    // Dynamic child: render normally (hydrateConditional/hydrateForEach)
                    const frag = renderHydrateNode(child, itemContext);
                    if (frag.rendered.trim()) {
                        childParts.push(frag.rendered);
                        childImports = childImports.plus(frag.imports);
                        childValidations.push(...frag.validations);
                        if (frag.refs) childRefs.push(frag.refs);
                    }
                } else {
                    // Static or adopted child: check if it produces hydrate code
                    const frag = renderHydrateNode(child, itemContext);
                    if (frag.rendered.trim()) {
                        childParts.push(frag.rendered);
                        childImports = childImports.plus(frag.imports);
                        childValidations.push(...frag.validations);
                        if (frag.refs) childRefs.push(frag.refs);
                    } else {
                        // No hydrate code — emit STATIC sentinel
                        childParts.push(`${itemContext.indent.firstLine}STATIC`);
                        childImports = childImports.plus(Import.STATIC);
                    }
                }
            }

            const refSuffix = itemRefFragment.rendered ? `, ${itemRefFragment.rendered}` : '';
            const childrenArr = childParts.length
                ? `[\n${childParts.join(',\n')},\n${indent.firstLine}        ]`
                : '[]';
            adoptBody = `() => [\n${indent.firstLine}        adoptDynamicElement("", ${itemAttrs.rendered}, ${childrenArr}${refSuffix}),\n${indent.firstLine}    ]`;

            itemContent = new RenderFragment(
                '',
                Imports.for(Import.adoptDynamicElement).plus(childImports),
                childValidations,
                mergeRefsTrees(...childRefs),
            );
        } else {
            itemContent = mergeHydrateFragments(
                itemChildNodes.map((child) => renderHydrateNode(child, itemContext)),
                ',\n',
            );

            if (needsItemAdoption) {
                const refSuffix = itemRefFragment.rendered ? `, ${itemRefFragment.rendered}` : '';
                const childrenArr = itemContent.rendered.trim()
                    ? `[\n${itemContent.rendered},\n${indent.firstLine}        ]`
                    : '[]';
                adoptBody = `() => [\n${indent.firstLine}        adoptElement("", ${itemAttrs.rendered}, ${childrenArr}${refSuffix}),\n${indent.firstLine}    ]`;
            } else {
                adoptBody = itemContent.rendered.trim()
                    ? `() => [\n${itemContent.rendered},\n${indent.firstLine}    ]`
                    : '() => []';
            }
        }

        // Create callback: render the item element using the standard element target.
        // Use the pre-adopt snapshot of the RefNameGenerator so the create callback
        // generates the same ref names as the adopt callback. A fresh generator would
        // restart naming (e.g., refIncrement instead of refIncrement2 for the second
        // forEach). Cloning BEFORE the adopt callback captures the right starting state
        // so both paths independently arrive at the same names.
        // Keep headlessInstanceCounter shared (not reset) so the element target's
        // renderHeadlessInstance generates unique names (counter=1+) that don't conflict
        // with the adopt path's definitions (counter=0).
        const createRenderContext: RenderContext = {
            ...renderContext,
            variables: forEachVariables,
            indent: new Indent('    ').child().noFirstLineBreak(),
            dynamicRef: true,
            isInsideGuard: true,
            insideFastForEach: true,
            refNameGenerator: preAdoptRefNameGenerator,
            coordinateCounters: new Map(),
        };
        const createChildNodes = filterContentNodes(element.childNodes);
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
        // Use de() when children include conditionals/forEach, matching standard target
        const forEachNeedsDynamic = createChildNodes.some(
            (_) =>
                _.nodeType === NodeType.ELEMENT_NODE &&
                (isConditional(_ as HTMLElement) ||
                    isForEach(_ as HTMLElement) ||
                    isSlowForEach(_ as HTMLElement) ||
                    checkAsync(_ as HTMLElement).isAsync),
        );
        const forEachElementFunc = forEachNeedsDynamic ? 'de' : 'e';
        const forEachElementImport = forEachNeedsDynamic ? Import.dynamicElement : Import.element;
        // Render ref on the forEach item element for the create callback
        const createItemRef = renderElementRef(element, createRenderContext);
        const createRefSuffix = createItemRef.rendered ? `, ${createItemRef.rendered}` : '';
        const createBody = `(${forEachVariables.currentVar}: ${forEachVariables.currentType.name}) => {\n${indent.firstLine}    return ${forEachElementFunc}('${element.rawTagName}', ${createAttributes.rendered}, [${createChildren.rendered}]${createRefSuffix});\n${indent.firstLine}    }`;

        let allImports = Imports.for(Import.hydrateForEach)
            .plus(forEachElementImport)
            .plus(forEachFragment.imports)
            .plus(itemContent.imports)
            .plus(createChildren.imports)
            .plus(createAttributes.imports)
            .plus(itemAttrs.imports)
            .plus(itemRefFragment.imports)
            .plus(createItemRef.imports);
        if (needsItemAdoption && !itemHasInteractiveChildren) {
            allImports = allImports.plus(Import.adoptElement);
        }
        const hydrateForEachFragment = new RenderFragment(
            `${indent.firstLine}hydrateForEach(${forEachFragment.rendered}, '${trackBy}',\n${indent.firstLine}    ${adoptBody},\n${indent.firstLine}    ${createBody},\n${indent.firstLine})`,
            allImports,
            [
                ...forEachFragment.validations,
                ...itemContent.validations,
                ...createChildren.validations,
            ],
            mergeRefsTrees(itemContent.refs, itemRefFragment.refs),
        );
        // Nest refs under the forEach access path, matching the standard element target
        return nestRefs(forEachAccessor.terms, hydrateForEachFragment);
    }

    // --- slowForEach (pre-rendered slow-phase forEach items) ---
    if (isSlowForEach(element)) {
        const slowForEachInfo = getSlowForEachInfo(element);
        if (!slowForEachInfo) {
            return new RenderFragment('', Imports.none(), [
                `slowForEach element is missing required attributes (slowForEach, jayIndex, jayTrackBy)`,
            ]);
        }

        const { arrayName, jayIndex, jayTrackBy } = slowForEachInfo;
        const { variables, indent } = context;

        const slowValidated = validateSlowForEachAccessor(arrayName, variables);
        if (isValidationError(slowValidated)) return slowValidated;
        const { accessor: arrayAccessor, childVariables: slowForEachVariables } = slowValidated;
        const parentTypeName = variables.currentType.name;
        const itemTypeName = slowForEachVariables.currentType.name;
        const paramName = arrayAccessor.rootVar;
        const getItemsFragment = arrayAccessor
            .render()
            .map((_) => `(${paramName}: ${parentTypeName}) => ${_}`);

        // Render element content in the item's variable scope.
        // Children read their own jay-coordinate-base (pre-assigned with jayTrackBy prefix).
        // Accumulate slowForEachJayTrackBy for nested slowForEach — assignCoordinates
        // uses the accumulated slowForEachPrefix (e.g., "outer/inner") for child coordinates,
        // so the stripping logic must match.
        const accumulatedJayTrackBy = context.slowForEachJayTrackBy
            ? `${context.slowForEachJayTrackBy}/${jayTrackBy}`
            : jayTrackBy;
        const itemContext: HydrateContext = {
            ...context,
            variables: slowForEachVariables,
            indent: indent.child().child(),
            dynamicRef: true,
            insideSlowForEach: true,
            slowForEachJayTrackBy: accumulatedJayTrackBy,
        };
        const renderContext2 = buildRenderContext(itemContext);
        // Process children individually to determine if wrapping is needed (DL#115).
        // slowForEachItem's callback must return a single BaseJayElement. When there are
        // multiple dynamic children, wrap in adoptElement to provide a single return value.
        const itemChildNodes = filterContentNodes(element.childNodes);
        const childFragments = itemChildNodes.map((child) => renderHydrateNode(child, itemContext));
        const nonEmptyChildren = childFragments.filter((f) => f.rendered.trim());

        // Drop fully static items — nothing to adopt
        if (nonEmptyChildren.length === 0) {
            return RenderFragment.empty();
        }

        let callbackBody: string;
        let callbackImports = Imports.none();
        let callbackValidations: string[] = [];
        let callbackRefs: RefsTree | undefined;

        if (nonEmptyChildren.length === 1) {
            // Single dynamic child — use directly, no wrapper needed
            callbackBody = nonEmptyChildren[0].rendered.trim();
            callbackImports = nonEmptyChildren[0].imports;
            callbackValidations = [...nonEmptyChildren[0].validations];
            callbackRefs = nonEmptyChildren[0].refs;
        } else {
            // Multiple dynamic children — wrap in adoptElement/adoptDynamicElement.
            // The '' coordinate resolves to coordinateBase itself (the jayTrackBy value),
            // matching the jay-coordinate attribute on the slow forEach item's root element.
            //
            // Check if any child is a dynamic group (conditional/forEach) that needs
            // Kindergarten for DOM positioning. If so, use adoptDynamicElement with STATIC
            // sentinels for non-dynamic children.
            const hasDynamicGroups = itemChildNodes.some(
                (child) =>
                    child.nodeType === NodeType.ELEMENT_NODE &&
                    ((isConditional(child as HTMLElement) &&
                        conditionIsInteractive(
                            (child as HTMLElement).getAttribute('if'),
                            itemContext.interactivePaths,
                        )) ||
                        isForEach(child as HTMLElement) ||
                        isSlowForEach(child as HTMLElement)),
            );

            if (hasDynamicGroups) {
                // adoptDynamicElement with STATIC sentinels for proper Kindergarten positioning
                const childParts: string[] = [];
                for (let i = 0; i < childFragments.length; i++) {
                    const frag = childFragments[i];
                    if (frag.rendered.trim()) {
                        childParts.push(frag.rendered);
                        callbackImports = callbackImports.plus(frag.imports);
                        callbackValidations.push(...frag.validations);
                        if (frag.refs)
                            callbackRefs = callbackRefs
                                ? mergeRefsTrees(callbackRefs, frag.refs)
                                : frag.refs;
                    } else if (itemChildNodes[i].nodeType === NodeType.ELEMENT_NODE) {
                        childParts.push(`${indent.firstLine}        STATIC`);
                        callbackImports = callbackImports.plus(Import.STATIC);
                    }
                }
                const childrenArr = childParts.join(',\n');
                callbackBody = `adoptDynamicElement('', {}, [\n${childrenArr},\n${indent.firstLine}    ])`;
                callbackImports = callbackImports.plus(Import.adoptDynamicElement);
            } else {
                // No dynamic groups — plain adoptElement suffices
                const childrenArr = nonEmptyChildren.map((f) => f.rendered).join(',\n');
                callbackBody = `adoptElement('', {}, [\n${childrenArr},\n${indent.firstLine}    ])`;
                for (const f of nonEmptyChildren) {
                    callbackImports = callbackImports.plus(f.imports);
                    callbackValidations.push(...f.validations);
                    if (f.refs)
                        callbackRefs = callbackRefs ? mergeRefsTrees(callbackRefs, f.refs) : f.refs;
                }
                callbackImports = callbackImports.plus(Import.adoptElement);
            }
        }

        const slowForEachFragment = new RenderFragment(
            `${indent.firstLine}slowForEachItem<${parentTypeName}, ${itemTypeName}>(${getItemsFragment.rendered}, ${jayIndex}, '${jayTrackBy}',\n${indent.firstLine}() => ${callbackBody}\n${indent.firstLine})`,
            Imports.for(Import.slowForEachItem)
                .plus(getItemsFragment.imports)
                .plus(callbackImports),
            [...getItemsFragment.validations, ...callbackValidations],
            callbackRefs,
        );

        return nestRefs(arrayName.split('.'), slowForEachFragment);
    }

    // --- Async directives (when-loading, when-resolved, when-rejected) ---
    // Async elements are handled by SSR swap scripts which replace the pending
    // placeholder with resolved/rejected content before hydration runs.
    // The resolved content is static after SSR — skip adoption entirely.
    if (checkAsync(element).isAsync) {
        return RenderFragment.empty();
    }

    // --- Headful component (childComp) ---
    // componentMatch was already computed above (headless-instance check).
    // Only headful components reach here.
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
 * Render a headless component instance for the hydrate target.
 * Generates adopt-based inline template preRender using withHydrationChildContext,
 * plus makeHeadlessInstanceComponent definition and childCompHydrate call.
 *
 * For forEach context, generates TWO separate definitions (adopt + create).
 */
function renderHydrateHeadlessInstance(
    element: HTMLElement,
    context: HydrateContext,
    renderContext: RenderContext,
    contractName: string,
): RenderFragment {
    const headlessResult = resolveHeadlessImport(contractName, context.headlessImports);
    if (isValidationError(headlessResult)) return headlessResult;
    const headlessImport = headlessResult;

    // Generate unique names
    const idx = context.headlessInstanceCounter.count++;
    const pascal = pascalCase(contractName);
    const renderFnName = `_headless${pascal}${idx}HydrateRender`;
    const pluginComponentName = headlessImport.codeLink.names[0].name;

    // Type names
    const interactiveViewStateType = `${pascal}InteractiveViewState`;
    const refsTypeName = `${pascal}Refs`;
    const elementType = `_Headless${pascal}${idx}Element`;
    const renderType = `_Headless${pascal}${idx}ElementRender`;
    const preRenderType = `_Headless${pascal}${idx}ElementPreRender`;

    // Ensure InteractiveViewState is imported
    for (const link of headlessImport.contractLinks) {
        if (!link.names.some((n) => n.name === interactiveViewStateType)) {
            link.names.push({ name: interactiveViewStateType, type: JayUnknown });
        }
    }

    // Read instance coordinate from pre-assigned jay-coordinate-base (DL#103)
    const coordResult = extractHeadlessCoordinate(element, contractName);
    if (isValidationError(coordResult)) return coordResult;
    const { instanceCoord, coordSegments, coordinateSuffix } = coordResult;
    const isInsideForEach = context.insideFastForEach;

    // Compute instance key for __headlessInstances lookup (same logic as server target)
    let coordinateKey: string | undefined;
    if (isInsideForEach) {
        coordinateKey = undefined; // forEach: key computed at runtime
    } else if (context.insideSlowForEach) {
        // slowForEach: key is trackByValue/suffix — only first segment is the prefix
        const prefix = coordSegments[0];
        coordinateKey = computeInstanceKey(coordinateSuffix, 'slowForEach', prefix);
    } else {
        // Static instance: key is just the suffix
        coordinateKey = computeInstanceKey(coordinateSuffix, 'static');
    }

    // --- Compile adopt inline template (hydrate APIs) ---
    const componentVariables = new Variables(headlessImport.rootType);
    const childNodes = filterContentNodes(element.childNodes);
    if (childNodes.length === 0) {
        return new RenderFragment('', Imports.none(), [
            `Headless component instance <jay:${contractName}> must have inline template content`,
        ]);
    }

    // Build ref map from contract refs
    const instanceRefMap = buildContractRefMap(headlessImport.refs);

    // Compile adopt inline template using HydrateContext with component's ViewState.
    // instanceCoordPrefix: child adoptElement uses relative coords so forInstance(instanceCoord) resolves.
    // Use the headless component's contract for interactivePaths — the widget's bindings
    // are resolved against the widget's contract, not the page's contract.
    const adoptChildIndent = new Indent('            ');
    const adoptItemContext: HydrateContext = {
        ...context,
        variables: componentVariables,
        indent: adoptChildIndent,
        importedRefNameToRef: instanceRefMap,
        dynamicRef: false,
        insideFastForEach: false,
        headlessContractNames: new Set(),
        headlessImports: [],
        varMappings: {},
        instanceCoordPrefix: instanceCoord,
        interactivePaths: buildInteractivePaths(headlessImport.contract),
    };
    const adoptRenderContext = buildRenderContext(adoptItemContext);

    // Render adopt inline template children
    let adoptInlineBody: RenderFragment;
    if (childNodes.length === 1) {
        adoptInlineBody = renderHydrateElementContent(
            childNodes[0] as HTMLElement,
            adoptItemContext,
            adoptRenderContext,
            null,
            true, // forceAdopt
        );
    } else {
        // Multiple children — wrap in adoptElement("0", {}, [children]) so the callback
        // returns a single element (comma expression would return only the last).
        // Children get coordinates "0/0", "0/1", etc. to match server wrapper structure.
        const adoptChildContext: HydrateContext = {
            ...adoptItemContext,
        };
        const adoptChildren = mergeHydrateFragments(
            childNodes.map((child) => renderHydrateNode(child, adoptChildContext)),
            ',\n',
        );
        adoptInlineBody = new RenderFragment(
            `${adoptChildIndent.firstLine}adoptElement("0", {}, [\n${adoptChildren.rendered}\n${adoptChildIndent.firstLine}])`,
            adoptChildren.imports.plus(Import.adoptElement),
            adoptChildren.validations,
            adoptChildren.refs,
        );
    }

    // Generate ReferencesManager for the adopt inline template
    const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
        adoptInlineBody.refs,
        ReferenceManagerTarget.element,
    );

    // Adopt render function code
    // The viewState parameter already has the correct instance data — makeHeadlessInstanceComponent's
    // wrapped constructor resolves fastVS from HEADLESS_INSTANCES and merges it into compCore.render().
    // No need to look up instanceVs separately.
    const adoptRenderFnCode = `
// Hydrate inline template for headless component: ${contractName} #${idx}
type ${elementType} = JayElement<${interactiveViewStateType}, ${refsTypeName}>;
type ${renderType} = RenderElement<${interactiveViewStateType}, ${refsTypeName}, ${elementType}>;
type ${preRenderType} = [${refsTypeName}, ${renderType}];

function ${renderFnName}(options?: RenderElementOptions): ${preRenderType} {
    ${renderedRefsManager}
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
${adoptInlineBody.rendered}
        ) as ${elementType};
    return [refManager.getPublicAPI() as ${refsTypeName}, render];
}`;

    // Component symbol and definition
    let adoptComponentSymbol: string;
    let adoptComponentDef: string;
    if (isInsideForEach) {
        adoptComponentSymbol = `_Headless${pascal}${idx}Adopt`;
        adoptComponentDef = `const ${adoptComponentSymbol} = makeHeadlessInstanceComponent(\n    ${renderFnName},\n    ${pluginComponentName},\n    (dataIds) => [...dataIds, '${coordinateSuffix}'].toString(),\n);`;
    } else {
        adoptComponentSymbol = `_Headless${pascal}${idx}`;
        // Use the __headlessInstances key (not full DOM coordinate) for data lookup.
        // Static: 'widget:0', slowForEach: 'p1/widget:0'
        adoptComponentDef = `const ${adoptComponentSymbol} = makeHeadlessInstanceComponent(\n    ${renderFnName},\n    ${pluginComponentName},\n    '${coordinateKey}',\n);`;
    }

    let adoptImports = adoptInlineBody.imports
        .plus(refsManagerImport)
        .plus(Import.ConstructContext)
        .plus(Import.makeHeadlessInstanceComponent);

    // --- For fast conditionals: also generate create inline template (element APIs) ---
    // forEach doesn't need a create version here — the forEach handler's create callback
    // generates it naturally via renderNode() → renderHeadlessInstance() (element target).
    const ifCondition = element.attributes.if;
    const needsCreateVersion = !!ifCondition;
    let createComponentSymbol: string | undefined;
    let createRenderFnCode = '';
    let createImports = Imports.none();
    if (needsCreateVersion) {
        const createRenderFnName = `_headless${pascal}${idx}Render`;
        createComponentSymbol = `_Headless${pascal}${idx}Create`;

        // Use the element target's renderHeadlessInstance to compile the create version.
        // Build a RenderContext for the create inline template.
        const createChildIndent = new Indent('            ');
        const createRenderContext: RenderContext = {
            ...renderContext,
            variables: componentVariables,
            indent: createChildIndent,
            importedRefNameToRef: instanceRefMap,
            dynamicRef: false,
            isInsideGuard: true,
            insideFastForEach: false,
            headlessContractNames: new Set(),
            headlessImports: [],
            coordinatePrefix: [],
            coordinateCounters: new Map(),
        };

        const createRenderedChildren = childNodes
            .map((_) => renderNode(_, createRenderContext))
            .reduce(
                (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                RenderFragment.empty(),
            );

        let createInlineBody: RenderFragment;
        if (childNodes.length > 1) {
            createInlineBody = new RenderFragment(
                `${createChildIndent.firstLine}de('div', {}, [\n${createRenderedChildren.rendered}\n])`,
                createRenderedChildren.imports.plus(Import.dynamicElement),
                createRenderedChildren.validations,
                createRenderedChildren.refs,
            );
        } else {
            createInlineBody = createRenderedChildren;
        }

        const { renderedRefsManager: createRefsManager, refsManagerImport: createRefsImport } =
            renderReferenceManager(createInlineBody.refs, ReferenceManagerTarget.element);

        createRenderFnCode = `
function ${createRenderFnName}(options?: RenderElementOptions): ${preRenderType} {
    ${createRefsManager}
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
${createInlineBody.rendered}
        ) as ${elementType};
    return [refManager.getPublicAPI() as ${refsTypeName}, render];
}

const ${createComponentSymbol} = makeHeadlessInstanceComponent(
    ${createRenderFnName},
    ${pluginComponentName},
    ${isInsideForEach ? `(dataIds) => [...dataIds, '${coordinateSuffix}'].toString()` : `'${coordinateKey}'`},
);`;
        createImports = createInlineBody.imports.plus(createRefsImport);
    }

    // Accumulate the definition(s)
    context.headlessInstanceDefs.push({
        componentSymbol: adoptComponentSymbol,
        renderFnName,
        renderFnCode:
            adoptRenderFnCode +
            '\n' +
            adoptComponentDef +
            (createRenderFnCode ? '\n' + createRenderFnCode : ''),
        pluginComponentName,
        imports: adoptImports.plus(createImports),
    });

    // --- Generate props getter ---
    const propsGetterAndRefs = renderChildCompProps(
        element,
        renderContext,
        headlessImport.contract?.props,
    );
    const getProps = `(${context.variables.currentVar}: ${context.variables.currentType.name}) => ${propsGetterAndRefs.rendered}`;

    // --- Generate ref ---
    const refOriginalName =
        element.attributes.ref || context.refNameGenerator.newAutoRefNameGenerator();
    const refRefName = camelCase(refOriginalName);
    const refConstName = context.refNameGenerator.newConstantName(refRefName, context.variables);
    const isRepeated = context.dynamicRef;
    const contractRefType = isRepeated ? `${pascal}RepeatedRefs` : `${pascal}Refs`;
    for (const link of headlessImport.contractLinks) {
        if (!link.names.some((n) => n.name === contractRefType)) {
            link.names.push({ name: contractRefType, type: JayUnknown });
        }
    }
    const instanceRef = mkRef(
        refRefName,
        refOriginalName,
        refConstName,
        isRepeated,
        !element.attributes.ref,
        context.variables.currentType,
        new JayTypeAlias(contractRefType),
    );
    let renderedRef = new RenderFragment(
        `${refConstName}()`,
        Imports.for(),
        [],
        mkRefsTree([instanceRef], {}),
    );
    if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);

    // --- Build the call expression ---
    // childCompHydrate's forInstance(coord) sets coordinateBase for child adoptElement resolution.
    // Static: full instanceCoord (e.g. "0/2/1/product-widget:0").
    // forEach/slowForEach: strip the first segment ($trackBy or jayTrackBy) — forItem already
    // scopes by trackBy value. Remaining path includes intermediate wrapper elements.
    // e.g. "$_id/0/stock-status:0" → "0/stock-status:0"
    const coordKeyArg =
        isInsideForEach || context.insideSlowForEach
            ? `'${coordSegments.slice(1).join('/')}'`
            : `'${instanceCoord}'`;

    if (ifCondition) {
        // Fast conditional: wrap in hydrateConditional with adopt and create callbacks.
        // createComponentSymbol is guaranteed to exist here (needsCreateVersion was true).
        const renderedCondition = parseCondition(ifCondition, context.variables);
        const adoptCall = `() => childCompHydrate(${adoptComponentSymbol}, ${getProps}, ${coordKeyArg}${renderedRef.rendered})`;
        const createCall = `() => childComp(${createComponentSymbol}, ${getProps}${renderedRef.rendered})`;
        const callExpr = `${context.indent.firstLine}hydrateConditional(${renderedCondition.rendered}, ${adoptCall},\n${context.indent.firstLine}    ${createCall})`;

        return new RenderFragment(
            callExpr,
            Imports.for(Import.childCompHydrate, Import.hydrateConditional, Import.childComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports)
                .plus(renderedCondition.imports),
            [
                ...propsGetterAndRefs.validations,
                ...adoptInlineBody.validations,
                ...renderedRef.validations,
            ],
            renderedRef.refs,
        );
    }

    return new RenderFragment(
        `${context.indent.firstLine}childCompHydrate(${adoptComponentSymbol}, ${getProps}, ${coordKeyArg}${renderedRef.rendered})`,
        Imports.for(Import.childCompHydrate)
            .plus(propsGetterAndRefs.imports)
            .plus(renderedRef.imports),
        [
            ...propsGetterAndRefs.validations,
            ...adoptInlineBody.validations,
            ...renderedRef.validations,
        ],
        renderedRef.refs,
    );
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
    const childNodes = filterContentNodes(element.childNodes, true);

    // Check if this element has a single dynamic text child, or data-jay-dynamic (from wrap in slow render)
    let textFragment: RenderFragment | null = null;
    const dataJayDynamic = element.getAttribute('data-jay-dynamic');
    if (dataJayDynamic) {
        const rendered = parseTextExpression(textEscape(dataJayDynamic), variables);
        if (rendered.imports.has(Import.dynamicText)) {
            textFragment = rendered;
        }
        // Skip adoption if bindings are all non-interactive (slow/fast-only)
        if (
            textFragment &&
            context.interactivePaths.size > 0 &&
            !textHasInteractiveBindings(dataJayDynamic, context.interactivePaths)
        ) {
            textFragment = null;
        }
    } else if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE) {
        const text = childNodes[0].innerText || '';
        const rendered = parseTextExpression(textEscape(text), variables);
        if (rendered.imports.has(Import.dynamicText)) {
            textFragment = rendered;
        }
        // Skip adoption if bindings are all non-interactive (slow/fast-only)
        if (
            textFragment &&
            context.interactivePaths.size > 0 &&
            !textHasInteractiveBindings(text, context.interactivePaths)
        ) {
            textFragment = null;
        }
    }

    // Check if children contain interactive conditionals or forEach (makes parent a container).
    // Non-interactive conditionals (slow/fast-only) are resolved at SSR and don't need adoption.
    const hasInteractiveChildren = childNodes.some(
        (child) =>
            child.nodeType === NodeType.ELEMENT_NODE &&
            ((isConditional(child as HTMLElement) &&
                conditionIsInteractive(
                    (child as HTMLElement).getAttribute('if'),
                    context.interactivePaths,
                )) ||
                isForEach(child as HTMLElement)),
    );

    // Mixed content: text with binding + element siblings (DL#102 — adoptText by position)
    const hasTextWithInteractiveBinding = (n: Node) =>
        n.nodeType === NodeType.TEXT_NODE &&
        /\{[^}]+\}/.test((n as Node & { innerText?: string }).innerText || '') &&
        (context.interactivePaths.size === 0 ||
            textHasInteractiveBindings(
                (n as Node & { innerText?: string }).innerText || '',
                context.interactivePaths,
            ));
    const hasMixedContentDynamicText =
        childNodes.some(hasTextWithInteractiveBinding) &&
        childNodes.some((n) => n.nodeType === NodeType.ELEMENT_NODE);

    // Determine if this element itself needs adoption
    const needsAdoption =
        hasDynamicAttrs ||
        textFragment !== null ||
        refName !== null ||
        hasInteractiveChildren ||
        hasMixedContentDynamicText ||
        forceAdopt;

    if (!needsAdoption) {
        // Static element — recurse into children to find nested dynamic nodes
        return mergeHydrateFragments(
            childNodes.map((child) => renderHydrateNode(child, context)),
            ',\n',
        );
    }

    // Read pre-assigned coordinate from jay-coordinate-base (DL#103).
    const coordTemplate = element.getAttribute(COORD_ATTR);
    let coordinate = coordTemplate || coordinateOverride || '0';
    // When inside headless adopt (instanceCoordPrefix set), use relative coord for forInstance resolution.
    if (
        context.instanceCoordPrefix &&
        coordTemplate?.startsWith(context.instanceCoordPrefix + '/')
    ) {
        coordinate = coordTemplate.slice(context.instanceCoordPrefix.length + 1);
    }
    // When inside forEach, strip the $trackBy prefix (e.g. "$_id/0/0" → "0/0").
    // hydrateForEach's forItem(id) already sets coordinateBase to [id], so
    // resolveCoordinate("0/0") correctly resolves to "1/0/0" at runtime.
    if (context.insideFastForEach && coordinate.startsWith('$')) {
        const slashIndex = coordinate.indexOf('/');
        coordinate = slashIndex >= 0 ? coordinate.slice(slashIndex + 1) : '0';
    }
    // When inside slowForEach, strip the jayTrackBy prefix from coordinates.
    // slowForEachItem's forItem already pushes jayTrackBy onto coordinateBase,
    // so coordinates must be relative. Root element (coordinate === jayTrackBy)
    // becomes '' which resolveCoordinate handles as the coordinateBase itself.
    if (context.slowForEachJayTrackBy && coordTemplate) {
        if (coordinate === context.slowForEachJayTrackBy) {
            coordinate = '';
        } else if (coordinate.startsWith(context.slowForEachJayTrackBy + '/')) {
            coordinate = coordinate.slice(context.slowForEachJayTrackBy.length + 1);
        }
    }

    // Build the ref argument if present
    const renderedRef = renderElementRef(element, renderContext);

    // If this element has interactive children (conditionals/forEach), use adoptDynamicElement
    // which creates a Kindergarten with one group per child position. Static children that
    // produce no hydrate code are represented by the STATIC sentinel.
    if (hasInteractiveChildren) {
        const childParts: string[] = [];
        let childImports = Imports.none();
        const childValidations: string[] = [];
        const childRefs: RefsTree[] = [];

        for (const child of childNodes) {
            if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
            const htmlChild = child as HTMLElement;
            if (
                (isConditional(htmlChild) &&
                    conditionIsInteractive(
                        htmlChild.getAttribute('if'),
                        context.interactivePaths,
                    )) ||
                isForEach(htmlChild)
            ) {
                // Dynamic child: render normally (produces hydrateForEach/hydrateConditional)
                const frag = renderHydrateNode(child, context);
                if (frag.rendered.trim()) {
                    childParts.push(frag.rendered);
                    childImports = childImports.plus(frag.imports);
                    childValidations.push(...frag.validations);
                    if (frag.refs) childRefs.push(frag.refs);
                }
            } else {
                // Static or adopted child: check if it produces hydrate code
                const frag = renderHydrateNode(child, context);
                if (frag.rendered.trim()) {
                    // Has hydrate code (e.g. dynamic text, refs) — render as regular child
                    childParts.push(frag.rendered);
                    childImports = childImports.plus(frag.imports);
                    childValidations.push(...frag.validations);
                    if (frag.refs) childRefs.push(frag.refs);
                } else {
                    // No hydrate code — emit STATIC sentinel
                    childParts.push(`${indent.firstLine}STATIC`);
                    childImports = childImports.plus(Import.STATIC);
                }
            }
        }

        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';
        const childrenArr = childParts.length ? `[${childParts.join(',\n')}]` : '[]';
        return new RenderFragment(
            `${indent.firstLine}adoptDynamicElement("${coordinate}", ${attributes.rendered}, ${childrenArr}${refSuffix})`,
            Imports.for(Import.adoptDynamicElement)
                .plus(attributes.imports)
                .plus(childImports)
                .plus(renderedRef.imports),
            [...attributes.validations, ...childValidations, ...renderedRef.validations],
            mergeRefsTrees(...childRefs, renderedRef.refs),
        );
    }

    // Mixed content: adoptText by position (DL#102 — no wrapper span)
    // Emit adoptElement for elements first, then adoptText — so refs (buttons) are adopted
    // before adoptText peeks the parent coordinate (avoids any consumption ordering issues).
    if (hasMixedContentDynamicText && !hasDynamicAttrs) {
        const childParts: string[] = [];
        let childImports = Imports.none();
        const childValidations: string[] = [];
        const childRefs: RefsTree[] = [];
        // First pass: elements (including refs)
        childNodes.forEach((child, index) => {
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                const frag = renderHydrateNode(child, context);
                if (frag.rendered.trim()) {
                    childParts.push(frag.rendered);
                    childImports = childImports.plus(frag.imports);
                    childValidations.push(...frag.validations);
                    if (frag.refs) childRefs.push(frag.refs);
                }
            }
        });
        // Second pass: text nodes with bindings
        childNodes.forEach((child, index) => {
            if (child.nodeType === NodeType.TEXT_NODE) {
                const text = (child as Node & { innerText?: string }).innerText || '';
                if (/\{[^}]+\}/.test(text)) {
                    const rendered = parseTextExpression(textEscape(text), variables);
                    if (rendered.imports.has(Import.dynamicText)) {
                        const accessor = rendered.rendered.replace(/^dt\(/, '').replace(/\)$/, '');
                        childParts.push(
                            `${indent.firstLine}adoptText("${coordinate}", ${accessor}, undefined, ${index})`,
                        );
                        childImports = childImports
                            .plus(Import.adoptText)
                            .plus(rendered.imports.minus(Import.dynamicText));
                        childValidations.push(...rendered.validations);
                    }
                }
            }
        });
        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';
        const childrenArr = childParts.length ? `[${childParts.join(',\n')}]` : '[]';
        return new RenderFragment(
            `${indent.firstLine}adoptElement("${coordinate}", ${attributes.rendered}, ${childrenArr}${refSuffix})`,
            Imports.for(Import.adoptElement)
                .plus(attributes.imports)
                .plus(childImports)
                .plus(renderedRef.imports),
            [...attributes.validations, ...childValidations, ...renderedRef.validations],
            mergeRefsTrees(...childRefs, renderedRef.refs),
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
        let childRefs: RefsTree | undefined;

        if (textFragment) {
            const accessor = textFragment.rendered.replace(/^dt\(/, '').replace(/\)$/, '');
            childrenRendered = `[adoptText("${coordinate}", ${accessor})]`;
            childImports = Imports.for(Import.adoptText).plus(
                textFragment.imports.minus(Import.dynamicText),
            );
            childValidations = textFragment.validations;
        } else {
            // Recurse into child elements (e.g., <input ref="..."> inside a dynamic-attr parent)
            const children = mergeHydrateFragments(
                childNodes.map((child) => renderHydrateNode(child, context)),
                ',\n',
            );
            if (children.rendered.trim()) {
                childrenRendered = `[${children.rendered}]`;
                childImports = children.imports;
                childValidations = children.validations;
                childRefs = children.refs;
            }
        }

        const refSuffix = renderedRef.rendered ? `, ${renderedRef.rendered}` : '';

        return new RenderFragment(
            `${indent.firstLine}adoptElement("${coordinate}", ${attributes.rendered}, ${childrenRendered}${refSuffix})`,
            Imports.for(Import.adoptElement)
                .plus(attributes.imports)
                .plus(childImports)
                .plus(renderedRef.imports),
            [...attributes.validations, ...childValidations, ...renderedRef.validations],
            mergeRefsTrees(...[childRefs, renderedRef.refs].filter(Boolean)),
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

export function renderHydrate(
    types: JayType,
    body: HTMLElement,
    importStatements: JayImportLink[],
    elementType: string,
    preRenderType: string,
    refsType: string,
    headlessImports: JayHeadlessImports[],
    contract?: Contract,
): RenderFragment {
    const variables = new Variables(types);
    const importedRefNameToRef = processImportedHeadless(headlessImports);
    const { importedSymbols } = processImportedComponents(importStatements);
    const instanceHeadlessImports = headlessImports.filter((h) => !h.key);
    const headlessContractNames = new Set(instanceHeadlessImports.map((h) => h.contractName));
    // Pre-process: assign coordinates to all elements (DL#103)
    assignCoordinates(body, { headlessContractNames });

    const context: HydrateContext = {
        variables,
        indent: new Indent('        '),
        dynamicRef: false,
        refNameGenerator: new RefNameGenerator(),
        importedRefNameToRef,
        importedSymbols,
        headlessContractNames,
        headlessImports: instanceHeadlessImports,
        headlessInstanceDefs: [],
        headlessInstanceCounter: { count: 0 },
        insideFastForEach: false,
        insideSlowForEach: false,
        varMappings: {},
        interactivePaths: buildInteractivePaths(contract),
    };

    // Use ensureSingleChildElement to skip the <body> wrapper and get the
    // root content element — matching the server element target which does
    // the same. This ensures coordinate numbering is aligned between both targets.
    const rootElement = ensureSingleChildElement(body);
    if (!rootElement.val) {
        return new RenderFragment('', Imports.none(), rootElement.validations);
    }

    // Always adopt the root element — it provides the single-expression
    // return value for the constructor, composing all children.
    let renderedHydrate = renderHydrateElementContent(
        rootElement.val,
        context,
        buildRenderContext(context),
        null,
        true, // forceAdopt — root element always needs adoption
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

    // Collect headless instance definitions and their imports
    const headlessDefsCode = context.headlessInstanceDefs.map((def) => def.renderFnCode).join('\n');
    let headlessImportsAll = Imports.none();
    for (const def of context.headlessInstanceDefs) {
        headlessImportsAll = headlessImportsAll.plus(def.imports);
    }

    const hydrateFunction = `export function hydrate(rootElement: Element, options?: RenderElementOptions): ${preRenderType} {
${renderedRefsManager}
    const render = (viewState: ${types.name}) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, ${hydrateBody}) as ${elementType};
    return [refManager.getPublicAPI() as ${refsType}, render];
}`;

    const fullOutput = headlessDefsCode
        ? `${headlessDefsCode}\n\n${hydrateFunction}`
        : hydrateFunction;

    return new RenderFragment(
        fullOutput,
        Imports.for(Import.ConstructContext, Import.RenderElementOptions)
            .plus(renderedHydrate.imports)
            .plus(refsManagerImport)
            .plus(headlessImportsAll),
        renderedHydrate.validations,
        renderedHydrate.refs,
    );
}
