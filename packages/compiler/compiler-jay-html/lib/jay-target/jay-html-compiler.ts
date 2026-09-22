import {
    GenerateTarget,
    Import,
    Imports,
    ImportsFor,
    isEnumType,
    JayComponentType,
    JayPromiseType,
    JayErrorType,
    JayImportLink,
    JayType,
    JayTypeAlias,
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
import { assignCoordinates } from './assign-coordinates';
import { generateAllPhaseViewStateTypes } from '../contract/phase-type-generator';
import { ContractProp } from '../contract';
import { HTMLElement, NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import {
    Accessor,
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
import { pascalCase } from 'change-case';

import {
    JayHeadlessImports,
    JayHtmlHeadLink,
    JayHtmlNamespace,
    JayHtmlSourceFile,
} from './jay-html-source-file';
import { buildStructuralPassthroughComp } from './structural-coercions';
import { OVERRIDE_INJECTED_MARKER, FOREIGN_SLOT_MARKER } from './jay-html-overrides';
import {
    AsyncDirectiveType,
    AsyncDirectiveTypes,
    checkAsync,
    ensureSingleChildElement,
    forEachInsidePureComponentError,
    hasForEachDescendant,
    isConditional,
    isForEach,
    isRecurse,
    isRecurseWithData,
    isWithData,
    getComponentName,
} from './jay-html-helpers';
import { generateTypes } from './jay-html-compile-types';
import { Indent } from './indent';
import {
    elementNameToJayType,
    filterToComponentRefs,
    hasNamedComponentRefs,
    optimizeRefs,
    ReferenceManagerTarget,
    RefNameGenerator,
    refsToRepeated,
    renderReferenceManager,
    renderRefsType,
} from './jay-html-compile-refs';
import { processImportedComponents, renderImports } from './jay-html-compile-imports';
import { tagToNamespace } from './tag-to-namespace';
import {
    attributesRequiresQuotes,
    BOOLEAN_ATTRIBUTE,
    buildContractRefMap,
    expandContractType,
    filterContentNodes,
    isDirectiveAttribute,
    isValidationError,
    mergeContractStubRefs,
    PROPERTY,
    propertyMapping,
    resolveHeadlessImport,
    textEscape,
    decodeHtmlEntities,
    findHtmlStringBindings,
    validateAsyncAccessor,
    validateForEachAccessor,
} from './jay-html-compiler-shared';
import { renderBridge, renderSandboxRoot } from './jay-html-compiler-bridge';
import { renderHydrate } from './jay-html-compiler-hydrate';

export interface RecursiveRegionInfo {
    refName: string;
    hasRecurse: boolean;
    isInsideGuard: boolean; // true if inside forEach or conditional
}

/**
 * Represents a compiled headless component instance with inline template.
 * The render function and makeJayComponent call are emitted at module level,
 * and the page render function uses childComp to place it.
 */
export interface HeadlessInstanceDefinition {
    /** Symbol name for the component (e.g., "_HeadlessProductCard0") */
    componentSymbol: string;
    /** Render function name (e.g., "_headlessProductCard0Render") */
    renderFnName: string;
    /** The compiled render function body as a string */
    renderFnCode: string;
    /** The plugin component import name (e.g., "productCard"). Undefined for structural components (DL#162). */
    pluginComponentName?: string;
    /** Additional imports needed for the inline template */
    imports: Imports;
    /**
     * DL#193 Phase 3: synthetic refs type declaration(s) for a structural component that forwards its
     * named inner child-component refs. Emitted in the shared page-level refs section (renderedRefs) so
     * ALL targets (element, hydrate, bridge, main-sandbox) that reuse renderedRefs see the type, rather
     * than burying it in the inline template code (which only the element target emits). Empty otherwise.
     */
    syntheticRefsCode?: string;
}

export interface RenderContext {
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
    coordinateCounters: Map<string, number>;
    // DL#194 §C (Tier 3, Fork C): `const <name> = { <slot>: <fragment> }` declarations for slot
    // content that must be materialized once inside the page render's `withRootContext` body, before
    // the returned element expression. Each is referenced twice — by the child's higher-order
    // constructor closure and by `childComp`'s `slots` argument — so it must be a shared const. When
    // non-empty, the page render body is emitted as a block. Shared mutable array (like
    // `headlessInstanceDefs`); propagates to nested scopes via spread.
    slotPreambles: string[];
    // DL#193 Phase 3: file-level set of forwarded-ref helper identifiers (`CounterRef`,
    // `CounterRefs`) already emitted, so multiple structural instances embedding the same inner
    // component declare each helper once (avoids duplicate-identifier errors).
    emittedForwardedRefHelpers: Set<string>;
    // DL#194 (Tier 2 inlining): true while compiling the spliced body of an inlined no-code
    // composite. In that world the composite has no runtime boundary, so the DL#193
    // override-injected re-basing (`(vs,_p1)=>_p1` selector + `__parentContext`) is a no-op — the
    // injected component is already in the enclosing scope. Propagates to nested scopes via spread.
    insideInlinedComposite?: boolean;
}

function renderFunctionDeclaration(preRenderType: string): string {
    return `export declare function render(options?: RenderElementOptions): ${preRenderType}`;
}

function renderTextNode(variables: Variables, text: string, indent: Indent): RenderFragment {
    return parseTextExpression(textEscape(decodeHtmlEntities(text)), variables).map(
        (_) => indent.firstLine + _,
    );
}

function tryRenderHtmlStringChild(
    childNodes: Node[],
    variables: Variables,
    indent: Indent,
): RenderFragment | null {
    const htmlStringBindings = findHtmlStringBindings(childNodes, variables);
    if (htmlStringBindings.length === 0) return null;

    if (childNodes.length !== 1 || childNodes[0].nodeType !== NodeType.TEXT_NODE) {
        return new RenderFragment('', Imports.none(), [
            `html-string binding {${htmlStringBindings[0]}} must be the sole child of its parent element, not mixed with sibling elements`,
        ]);
    }

    const text = (childNodes[0].innerText || '').trim();
    if (text !== `{${htmlStringBindings[0]}}`) {
        return new RenderFragment('', Imports.none(), [
            `html-string binding {${htmlStringBindings[0]}} must be the sole child of its parent element, not mixed with other content`,
        ]);
    }

    const accessor = parseAccessor(htmlStringBindings[0], variables);
    const accessorCode = accessor.render();
    return new RenderFragment(
        `${indent.firstLine}dh(${variables.currentVar} => ${accessorCode.rendered})`,
        Imports.for(Import.dynamicHtml).plus(accessorCode.imports),
        [...accessor.validations, ...accessorCode.validations],
    );
}

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

export function renderAttributes(
    element: HTMLElement,
    { variables }: RenderContext,
): RenderFragment {
    let attributes = element.attributes;
    let renderedAttributes = [];
    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        const attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (isDirectiveAttribute(attrCanonical)) return;
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
            if (attrValue === '') {
                renderedAttributes.push(new RenderFragment(`${attrKey}: ''`, Imports.none()));
            } else {
                let attributeExpression = parseBooleanAttributeExpression(attrValue, variables);
                renderedAttributes.push(attributeExpression.map((_) => `${attrKey}: ${_}`));
            }
        } else {
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
export function renderDynamicAttributes(
    element: HTMLElement,
    { variables }: RenderContext,
): RenderFragment {
    const attributes = element.attributes;
    const renderedAttributes: RenderFragment[] = [];
    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        const attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (isDirectiveAttribute(attrCanonical)) return;
        if (attrCanonical === 'style') {
            const styleFragment = renderStyleAttribute(attributes[attrName], variables);
            if (styleFragment.imports.has(Import.dynamicAttribute)) {
                renderedAttributes.push(styleFragment);
            }
        } else if (attrCanonical === 'class') {
            const classExpression = parseClassExpression(attributes[attrName], variables);
            if (classExpression.imports.has(Import.dynamicAttribute)) {
                renderedAttributes.push(classExpression.map((_) => `class: ${_}`));
            }
        } else if (propertyMapping[attrCanonical]?.type === PROPERTY) {
            const attributeExpression = parsePropertyExpression(attributes[attrName], variables);
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

export function renderElementRef(
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

/**
 * Coerce a static (non-`{expr}`) component-prop attribute value to its declared contract dataType
 * (DL#187). A static attribute is plain text, so the expression grammar always yields a quoted
 * string (or a bare number for all-digit text) — which is wrong for enum/number/boolean props.
 * Returns the coerced TypeScript source, or `undefined` to leave the parsed value as-is (string
 * props, unknown types, or a value that isn't a valid member/literal of the declared type — the
 * latter is left for value-level validation, a separate concern).
 */
function coerceStaticComponentProp(value: string, expectedType?: JayType): string | undefined {
    if (!expectedType) return undefined;
    if (isEnumType(expectedType)) {
        return expectedType.values.includes(value)
            ? `${expectedType.alias ?? expectedType.name}.${value}`
            : undefined;
    }
    if (expectedType.name === 'number') {
        return /^-?\d+(\.\d+)?$/.test(value) ? value : undefined;
    }
    if (expectedType.name === 'boolean') {
        if (value === 'true') return 'true';
        if (value === 'false') return 'false';
        return undefined;
    }
    return undefined;
}

export function renderChildCompProps(
    element: HTMLElement,
    { variables }: RenderContext,
    contractProps?: ContractProp[],
): RenderFragment {
    let attributes = element.attributes;
    let props = [];
    let isPropsDirectAssignment: boolean = false;
    let imports = Imports.none();
    // Build a lookup map for contract prop types (if available)
    const propTypeMap = contractProps
        ? new Map(contractProps.map((p) => [p.name, p.dataType]))
        : undefined;
    Object.keys(attributes).forEach((attrName) => {
        let attrCanonical = attrName.toLowerCase();
        let attrKey = attrName.match(attributesRequiresQuotes) ? `"${attrName}"` : attrName;
        if (
            attrCanonical === 'if' ||
            attrCanonical === 'foreach' ||
            attrCanonical === 'trackby' ||
            attrCanonical === 'jay-coordinate-base' ||
            attrCanonical === 'jay-scope' ||
            // DL#193 Phase 3 refinement: provenance marker on override-injected component tags —
            // read for ref re-basing, never a prop.
            attrCanonical === OVERRIDE_INJECTED_MARKER
        )
            return;
        if (attrCanonical === 'props') {
            isPropsDirectAssignment = true;
        }
        if (attrCanonical === 'ref') {
            return;
        } else {
            const rawValue = attributes[attrName];
            const isStatic = !rawValue.includes('{');
            let prop = parseComponentPropExpression(rawValue, variables);
            // Use contract prop name when available (case-insensitive match) so that
            // HTML-parser lowercased attributes (e.g. productid) map to contract names (e.g. productId)
            const outputKey =
                contractProps?.find((p) => p.name.toLowerCase() === attrCanonical)?.name ?? attrKey;
            const expectedType = propTypeMap?.get(attrName) ?? propTypeMap?.get(outputKey);
            // Static-value coercion (DL#187): a static attribute is plain text, so the grammar
            // produces a quoted string (or bare number) regardless of the prop's declared type.
            // Coerce it to the declared dataType — enum member, number, or boolean literal — so
            // the value lands as the right TypeScript type (e.g. `Status.success`, not `'success'`;
            // `true`, not `'true'`). Dynamic `{expr}` bindings already carry their source's type and
            // are left untouched.
            const coerced = isStatic
                ? coerceStaticComponentProp(rawValue.trim(), expectedType)
                : undefined;
            if (coerced !== undefined) {
                prop = prop.map(() => coerced);
            } else if (
                expectedType &&
                expectedType.name === 'string' &&
                /^\d+$/.test(prop.rendered)
            ) {
                // declared string but the number heuristic already produced a bare literal — re-quote
                prop = prop.map((_) => `'${_}'`);
            }
            props.push(prop.map((_) => `${outputKey}: ${_}`));
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

/**
 * DL#194 (Tier 2 inlining): seed the alias map that redirects each of a no-code composite's
 * contract-ViewState fields to the usage-site expression bound to it. Mirrors the attribute walk of
 * {@link renderChildCompProps}, but produces `Record<contractFieldName, Accessor>` (consumed by
 * {@link Variables.forInlinedComponent}) instead of a props object. Two alias shapes:
 *  - dynamic `{expr}` prop → the single accessor it parses to, rooted in the parent scope so it
 *    renders against the surrounding `vs` (DL#187 restricts structural props to scalar/enum, so a
 *    structural prop is always a single accessor);
 *  - static prop → a literal {@link Accessor} carrying the coerced value (enum member / number /
 *    boolean / quoted string, per {@link coerceStaticComponentProp}) and the declared type, so
 *    card-internal type-directed grammar (e.g. an enum comparison) still resolves.
 * `if`/`foreach`/`ref`/coordinate/scope/override-marker attributes are not props — skipped.
 */
export function buildInlineAliases(
    element: HTMLElement,
    parentVariables: Variables,
    contractProps?: ContractProp[],
): { aliases: Record<string, Accessor>; validations: string[] } {
    const attributes = element.attributes;
    const aliases: Record<string, Accessor> = {};
    const validations: string[] = [];
    const propTypeMap = contractProps
        ? new Map(contractProps.map((p) => [p.name, p.dataType]))
        : undefined;
    Object.keys(attributes).forEach((attrName) => {
        const attrCanonical = attrName.toLowerCase();
        if (
            attrCanonical === 'if' ||
            attrCanonical === 'foreach' ||
            attrCanonical === 'trackby' ||
            attrCanonical === 'jay-coordinate-base' ||
            attrCanonical === 'jay-scope' ||
            attrCanonical === 'ref' ||
            attrCanonical === 'props' ||
            // Component provenance marker (DL#123) — stamped by the parser, never a prop.
            attrCanonical === 'jc' ||
            attrCanonical === OVERRIDE_INJECTED_MARKER
        )
            return;
        const rawValue = attributes[attrName];
        const outputKey =
            contractProps?.find((p) => p.name.toLowerCase() === attrCanonical)?.name ?? attrName;
        const expectedType = propTypeMap?.get(attrName) ?? propTypeMap?.get(outputKey);
        const isStatic = !rawValue.includes('{');
        if (isStatic) {
            const coerced = coerceStaticComponentProp(rawValue.trim(), expectedType);
            // A non-coerced static value is a plain string: reuse the grammar's quoted-string output.
            // For a static enum member, widen to the base enum type: inlining substitutes the value
            // directly into the composite's `alias === Status.warning` comparisons, and a narrowed
            // `Status.success` literal would make tsc flag every other branch as a no-overlap error.
            const literalRender =
                coerced !== undefined && expectedType && isEnumType(expectedType)
                    ? `(${coerced} as ${expectedType.alias ?? expectedType.name})`
                    : (coerced ?? parseComponentPropExpression(rawValue, parentVariables).rendered);
            aliases[outputKey] = new Accessor(
                '',
                [],
                [],
                expectedType ?? JayUnknown,
                0,
                literalRender,
            );
        } else {
            // Dynamic `{expr}` — strip the braces and resolve the single accessor against the
            // parent scope so it renders rooted in the surrounding `vs`.
            const stripped = rawValue.trim().replace(/^\{/, '').replace(/\}$/, '');
            aliases[outputKey] = parseAccessor(stripped, parentVariables);
        }
    });
    return { aliases, validations };
}

export function renderChildCompRef(
    element: HTMLElement,
    {
        dynamicRef,
        variables,
        refNameGenerator,
        importedRefNameToRef,
        insideInlinedComposite,
    }: RenderContext,
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
    // DL#193 Phase 3 refinement: an override-injected child component's forwarded ref carries the
    // OUTER (override authoring) scope, not the composite's own ViewState — the override author knows
    // the outer scope, not the component's internals (§C). The composite's inline body is compiled
    // in `childContext`, whose `variables.parent` is the outer page/forEach scope. A plain inner ref
    // (no marker) keeps the composite's own `currentType`.
    // DL#194: inside an inlined Tier 2 composite the injected ref already carries the enclosing
    // scope (the composite has no boundary), so the DL#193 outer-scope re-basing does not apply.
    const isOverrideInjected =
        OVERRIDE_INJECTED_MARKER in element.attributes && !insideInlinedComposite;
    const refViewStateType =
        isOverrideInjected && variables.parent
            ? variables.parent.currentType
            : variables.currentType;
    let refs = mkRefsTree(
        [
            mkRef(
                refName,
                originalName,
                constName,
                dynamicRef,
                !element.attributes.ref,
                refViewStateType,
                new JayComponentType(componentName, []),
            ),
        ],
        {},
    );
    return new RenderFragment(`${constName}()`, Imports.for(), [], refs);
}

const isOverrideNode = (n: Node) =>
    n.nodeType === NodeType.ELEMENT_NODE &&
    ((n as HTMLElement).rawTagName ?? '').toLowerCase() === 'override';

export function renderNode(node: Node, context: RenderContext): RenderFragment {
    let { variables, importedSandboxedSymbols, indent, importerMode } = context;

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
            // DL#193: carry the deepest `$parent` climb up so scope-switch rules can force it.
            Math.max(attributes.parentDepth, children.parentDepth, ref.parentDepth),
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
            // DL#193: carry the deepest `$parent` climb up so scope-switch rules can force it.
            Math.max(attributes.parentDepth, children.parentDepth, ref.parentDepth),
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
                // Keyed headless components merge into the page — they cannot be used as inline <jay:> elements
                const keyedImport = newContext.headlessImports.find(
                    (h) => h.key && h.contractName === componentMatch!.name.toLowerCase(),
                );
                if (keyedImport) {
                    return new RenderFragment('', Imports.none(), [
                        `<jay:${componentMatch.name}> cannot be used as an inline element because it was imported with key="${keyedImport.key}". ` +
                            `Keyed headless components merge their ViewState into the page — use {${keyedImport.key}.fieldName} bindings instead, ` +
                            `or remove the key to use it as an inline instance.`,
                    ]);
                }
                return renderHeadlessInstance(htmlElement, newContext, componentMatch.name);
            }

            // Check if the tag name matches a keyed headless import's key (agent mistake: using key as tag)
            const keyedByName = newContext.headlessImports.find(
                (h) => h.key && h.key === componentMatch!.name,
            );
            if (keyedByName) {
                return new RenderFragment('', Imports.none(), [
                    `<jay:${componentMatch.name}> cannot be used as an inline element because it was imported with key="${keyedByName.key}". ` +
                        `Keyed headless components merge their ViewState into the page — use {${keyedByName.key}.fieldName} bindings instead. ` +
                        `For inline usage, remove the key and use <jay:${keyedByName.contractName}>.`,
                ]);
            }

            if (componentMatch.kind === 'unknown') {
                return new RenderFragment('', Imports.none(), [
                    `<jay:${componentMatch.name}> does not match any imported headless contract or headful component.`,
                ]);
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

        let childNodes = filterContentNodes(node.childNodes, true);

        const htmlStringChild = tryRenderHtmlStringChild(
            childNodes,
            contextForChildren.variables,
            contextForChildren.indent.child().noFirstLineBreak(),
        );
        if (htmlStringChild) {
            let attributes = renderAttributes(htmlElement, contextForChildren);
            let renderedRef = renderElementRef(htmlElement, contextForChildren);
            return e(
                htmlElement.rawTagName,
                attributes,
                htmlStringChild,
                renderedRef,
                newContext.indent,
            );
        }

        let childIndent = contextForChildren.indent.child();
        if (childNodes.length === 1 && childNodes[0].nodeType === NodeType.TEXT_NODE)
            childIndent = childIndent.noFirstLineBreak();

        let needDynamicElement = childNodes
            .map(
                (_) =>
                    isConditional(_) ||
                    isForEach(_) ||
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
                result.parentDepth,
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
            // DL#193: `if` is not a data-scope switch — it re-runs its body on every parent
            // update at runtime, so the residual `$parent` depth passes through unchanged.
            Math.max(renderedCondition.parentDepth, childElement.parentDepth),
        );
    }

    function renderForEach(
        renderedForEach: RenderFragment,
        collectionVariables: Variables,
        trackBy: string,
        childElement: RenderFragment,
        slotPreambles: string[] = [],
    ) {
        // DL#193 Capability A: if the item body binds `{$parent.…}` (parentDepth > 0), this
        // forEach is the scope it climbs *out of* — emit `dependsOnParent: true` so the runtime
        // weakens its keyed gates and re-runs item leaves when the parent changes. The residual
        // depth for enclosing scopes drops by one (this forEach consumed one climb); the
        // collection getter runs in the enclosing scope, so its own depth passes through.
        const dependsOnParent = childElement.parentDepth > 0;
        const residualParentDepth = Math.max(
            renderedForEach.parentDepth,
            Math.max(0, childElement.parentDepth - 1),
        );
        // DL#194 §C (Tier 3, Fork C) under a parent forEach: flush any per-item slot content consts into
        // the item callback body so each repeated item builds its OWN slot fragment (own element + ref) —
        // not a single hoisted const shared across items (which would wire only the first item's ref).
        const slotPreamblesStr =
            slotPreambles.length > 0 ? `${slotPreambles.join('\n')}\n${indent.curr}` : '';
        return new RenderFragment(
            `${indent.firstLine}forEach(${renderedForEach.rendered}, (${collectionVariables.currentVar}: ${collectionVariables.currentType.name}) => {
${indent.curr}${slotPreamblesStr}return ${childElement.rendered}}, '${trackBy}'${dependsOnParent ? ', true' : ''})`,
            childElement.imports.plus(Import.forEach),
            [...renderedForEach.validations, ...childElement.validations],
            childElement.refs,
            [...renderedForEach.recursiveRegions, ...childElement.recursiveRegions],
            residualParentDepth,
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
            // DL#193: `when`/async is a data-scope switch; it re-runs its body on every parent
            // update at runtime (no flag needed), and the residual `$parent` depth drops by one.
            Math.max(getPromiseFragment.parentDepth, Math.max(0, childElement.parentDepth - 1)),
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
        // DL#193 Phase 3 refinement: an override-injected child component with a forwarded ref must
        // deliver the OUTER (override authoring) scope on that ref — for onChange AND find/map alike
        // (§C). Emit a ref-viewState selector `(vs, _p1) => _p1` that reads the first parent from the
        // live parentDataChain, and raise this fragment's parentDepth so the enclosing composite
        // instance emits `__parentContext` (its synthetic parent = the outer scope) at its mount site.
        const isOverrideInjected =
            OVERRIDE_INJECTED_MARKER in htmlElement.attributes &&
            renderedRef.rendered !== '' &&
            // DL#194: inside an inlined Tier 2 composite there is no boundary to re-base across —
            // the injected component already resolves in the enclosing scope.
            !newContext.insideInlinedComposite;
        const refSelectorArg = isOverrideInjected
            ? `, (${newContext.variables.currentVar}, _p1) => _p1`
            : '';
        const nestedParentDepth = isOverrideInjected ? 1 : 0;
        if (importedSandboxedSymbols.has(componentName) || importerMode === RuntimeMode.MainSandbox)
            return new RenderFragment(
                `${newContext.indent.firstLine}secureChildComp(${componentName}, ${getProps}${renderedRef.rendered}${refSelectorArg})`,
                Imports.for(Import.secureChildComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
                [],
                nestedParentDepth,
            );
        else
            return new RenderFragment(
                `${newContext.indent.firstLine}childComp(${componentName}, ${getProps}${renderedRef.rendered}${refSelectorArg})`,
                Imports.for(Import.childComp)
                    .plus(propsGetterAndRefs.imports)
                    .plus(renderedRef.imports),
                propsGetterAndRefs.validations,
                renderedRef.refs,
                [],
                nestedParentDepth,
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
    /**
     * DL#194 Phase B — Tier 2 (no-code composite) inlining.
     *
     * A structural `<jay:X>` has jay-html + contract but no `.ts`, so there is nothing to run: its
     * template is spliced into the usage site (the parser already merged the component body into the
     * tag's innerHTML). We compile that body against an *alias overlay* of the parent scope
     * ({@link Variables.forInlinedComponent}) so each contract field renders as the usage-site
     * expression bound to it, and return the body fragment directly — no `childComp`, no synthetic
     * render fn, no `makeHeadlessInstanceComponent`, no `__parentContext` forwarding. Inner refs
     * (real child components / named elements in the body) bubble into the PAGE ref manager, nested
     * under the usage-site ref name so they read as `refs.<usageName>.<inner>` and carry the parent
     * ViewState as their parent type (external by construction).
     */
    function renderInlinedStructuralInstance(
        htmlElement: HTMLElement,
        newContext: RenderContext,
        contractName: string,
        headlessImport: JayHeadlessImports,
    ): RenderFragment {
        const childNodes = filterContentNodes(htmlElement.childNodes);
        if (childNodes.length === 0) {
            return new RenderFragment(
                '',
                Imports.none(),
                [
                    `Headless component instance <jay:${contractName}> must have inline template content`,
                ],
                mkRefsTree([], {}),
            );
        }
        // DL#194 v1: a card-internal forEach over an aliased array needs depth-correct nested scopes;
        // deferred to a follow-up. Keep the clear diagnostic (DL#193 §4) rather than mis-compiling.
        if (childNodes.some(hasForEachDescendant)) {
            return new RenderFragment(
                '',
                Imports.none(),
                [forEachInsidePureComponentError(contractName)],
                mkRefsTree([], {}),
            );
        }

        // Seed the alias overlay from the usage-site prop attributes, then build the inlined scope:
        // the parent scope's type/var/depth plus that overlay (see Variables.forInlinedComponent).
        const { aliases, validations: aliasValidations } = buildInlineAliases(
            htmlElement,
            newContext.variables,
            headlessImport.contract?.props,
        );
        const componentVariables = Variables.forInlinedComponent(newContext.variables, aliases);

        // Compile the body. Exclude the component's own code-link name from importedSymbols so HTML
        // tags aren't mistaken for the component import; drive nested refs off the contract ref map.
        const instanceRefMap = buildContractRefMap(headlessImport.refs);
        const pluginComponentName = headlessImport.codeLink.names[0].name;
        const childImportedSymbols = new Set(newContext.importedSymbols);
        childImportedSymbols.delete(pluginComponentName);
        const childContext: RenderContext = {
            ...newContext,
            variables: componentVariables,
            importedSymbols: childImportedSymbols,
            importedRefNameToRef: instanceRefMap,
            headlessContractNames: newContext.headlessContractNames,
            insideInlinedComposite: true,
        };

        const renderedChildren = childNodes
            .map((_) => renderNode(_, childContext))
            .reduce(
                (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                RenderFragment.empty(),
            );

        // Multiple root children need a wrapping element so the spliced expression is a single node.
        let inlineBody: RenderFragment;
        if (childNodes.length > 1) {
            inlineBody = new RenderFragment(
                `de('div', {}, [\n${renderedChildren.rendered}\n])`,
                renderedChildren.imports.plus(Import.dynamicElement),
                renderedChildren.validations,
                renderedChildren.refs,
                renderedChildren.recursiveRegions,
            );
        } else {
            inlineBody = renderedChildren;
        }

        // Nest the body's refs under the usage-site ref name (`refs.signupCard.cta`) when present;
        // otherwise they bubble up flat. The existing ref-manager machinery renders the nested group.
        const usageRefName = htmlElement.attributes.ref;
        const nested = usageRefName ? nestRefs([camelCase(usageRefName)], inlineBody) : inlineBody;

        return new RenderFragment(
            `${newContext.indent.firstLine}${nested.rendered}`,
            nested.imports,
            [...aliasValidations, ...nested.validations],
            nested.refs,
            nested.recursiveRegions,
        );
    }

    function renderHeadlessInstance(
        htmlElement: HTMLElement,
        newContext: RenderContext,
        contractName: string,
    ): RenderFragment {
        // Find the matching headless import
        const headlessResult = resolveHeadlessImport(contractName, newContext.headlessImports);
        if (isValidationError(headlessResult)) return headlessResult;
        const headlessImport = headlessResult;

        // DL#194 Phase B: a Tier 2 (no-code) composite has no runtime boundary — splice its template
        // into the usage site instead of wrapping it in a `childComp`. Contract fields are projected
        // onto usage-site expressions via an alias overlay; inner refs surface in the PAGE ref manager.
        if (headlessImport.structural)
            return renderInlinedStructuralInstance(
                htmlElement,
                newContext,
                contractName,
                headlessImport,
            );

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

        // Compile inline template children against the component's ViewState.
        // DL#193 Phase 2a: link the enclosing (page) scope as the component scope's parent so
        // page-authored `<override>` content — marked `@jay:parent` and resolved via `withParentShift`
        // — climbs to it as an ordinary `$parent` (`_p1`) access. At the mount site the whole
        // enclosing view state is forwarded as `__parentContext`, so `_p1.<anyField>` resolves.
        const componentVariables = new Variables(headlessImport.rootType, newContext.variables);
        const childIndent = newContext.indent.child(false);

        const allChildNodes = filterContentNodes(htmlElement.childNodes);
        // DL#194 §C (Tier 3, Fork C): a Tier 3 composite keeps its default template SEPARATE from
        // the `<override slot>` content. The parser injects the default body (slot anchors marked
        // `jay-foreign-slot` when filled) and appends the `<override>` elements verbatim. Split them:
        // template nodes compile in CHILD scope (the inline render fn); override content compiles in
        // PARENT scope (the page render) into slot fragments the parent owns.
        const overrideNodes = allChildNodes.filter(isOverrideNode) as HTMLElement[];
        const childNodes = allChildNodes.filter((n) => !isOverrideNode(n));
        const hasSlots = overrideNodes.length > 0;

        // DL#193 Phase 3 (§4 validation): a pure (Tier 2) structural component receives only
        // scalar/enum props (DL#187), so no array can ever drive an internal forEach. Reject it
        // with a clear diagnostic rather than the generic "resolved forEach type is not an array".
        if (headlessImport.structural && childNodes.some(hasForEachDescendant)) {
            return new RenderFragment(
                '',
                Imports.none(),
                [forEachInsidePureComponentError(contractName)],
                mkRefsTree([], {}),
            );
        }

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
            // Build ref map from contract refs for inline template compilation
            const instanceRefMap = buildContractRefMap(headlessImport.refs);

            // Compile each child against the component's ViewState
            // Exclude the component's own code link name from importedSymbols to prevent
            // HTML tags like <header> from being mistaken for the component import "header".
            const childImportedSymbols = new Set(newContext.importedSymbols);
            childImportedSymbols.delete(pluginComponentName);
            const childContext: RenderContext = {
                ...newContext,
                variables: componentVariables,
                importedSymbols: childImportedSymbols,
                indent: childIndent,
                importedRefNameToRef: instanceRefMap,
                recursiveRegions: [],
                isInsideGuard: false,
                insideFastForEach: false,
                // Each inline template compiles into its OWN `_headless…Render` function, so its ref
                // const names (`refCardAction`) are function-local. Give it a fresh generator so two
                // instances of the same contract don't dedup across the boundary (`refCardAction` in
                // both, not `refCardAction` / `refCardAction2`).
                refNameGenerator: new RefNameGenerator(),
                // DL#193 Phase 3: an instance's OWN template refs are always single — the instance is
                // one unit. When the instance is repeated at the usage site (inside a forEach), that
                // collection-ness is captured by the page-level ref manager collecting the instances,
                // not by the instance's inner refs. Reset `dynamicRef` so forwarded inner refs (e.g.
                // `<jay:Counter ref="cta">`) stay single here; contract-declared refs already use the
                // stub's `repeated` flag via importedRefNameToRef, so they are unaffected.
                dynamicRef: false,
                // Pass headless contract names through so nested headless instances
                // inside headfull FS component templates can be detected (DL#123)
                headlessContractNames: newContext.headlessContractNames,
            };

            const renderedChildren = childNodes
                .map((_) => renderNode(_, childContext))
                .reduce(
                    (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                    RenderFragment.empty(),
                );

            // When the inline template has multiple children, wrap them in a div
            // so the arrow function returns a single element expression
            if (childNodes.length > 1) {
                inlineBody = new RenderFragment(
                    `${childIndent.firstLine}de('div', {}, [\n${renderedChildren.rendered}\n])`,
                    renderedChildren.imports.plus(Import.dynamicElement),
                    renderedChildren.validations,
                    renderedChildren.refs,
                    renderedChildren.recursiveRegions,
                    // DL#193 Phase 2a: preserve the deepest `$parent` climb so the usage site still
                    // emits `__parentContext` when override content spans multiple root children.
                    renderedChildren.parentDepth,
                );
            } else {
                inlineBody = renderedChildren;
            }
        }

        // DL#194 §C (Tier 3, Fork C): compile each `<override slot="X">` fragment. Unlike DL#193, the
        // content is authored AND resolved in the PARENT (page) scope — it is built in the page render
        // and mounted into the child DOM at the anchor (`foreignChild`). Its refs are parent-owned,
        // surfaced keyed by slot name under the instance (`refs.<instance>.<slot>.<ref>`).
        const pageVSType = newContext.variables.currentType.name;
        const refOriginalName =
            htmlElement.attributes.ref || newContext.refNameGenerator.newAutoRefNameGenerator();
        const refRefName = camelCase(refOriginalName);
        const slotsTypeName = `_Headless${pascal}${idx}Slots`;
        const slotsConstName = `${refRefName}Slots`;
        const slotObjectMembers: string[] = [];
        const slotTypeMembers: string[] = [];
        const slotRefsChildren: Record<string, RefsTree> = {};
        let slotImports = Imports.none();
        const slotValidations: string[] = [];
        if (hasSlots) {
            const slotContext: RenderContext = {
                ...newContext,
                indent: newContext.indent.child(false),
                recursiveRegions: [],
                isInsideGuard: false,
            };
            for (const overrideNode of overrideNodes) {
                const slotName = camelCase(overrideNode.getAttribute('slot')!);
                const overrideChildren = filterContentNodes(overrideNode.childNodes);
                const renderedSlot = overrideChildren
                    .map((_) => renderNode(_, slotContext))
                    .reduce(
                        (prev, current) => RenderFragment.merge(prev, current, ',\n'),
                        RenderFragment.empty(),
                    );
                let slotBody: RenderFragment;
                if (overrideChildren.length > 1) {
                    slotBody = new RenderFragment(
                        `de('div', {}, [\n${renderedSlot.rendered}\n])`,
                        renderedSlot.imports.plus(Import.dynamicElement),
                        renderedSlot.validations,
                        renderedSlot.refs,
                        renderedSlot.recursiveRegions,
                    );
                } else {
                    slotBody = renderedSlot;
                }
                slotObjectMembers.push(`${slotName}: ${slotBody.rendered.trim()}`);
                slotTypeMembers.push(`    ${slotName}: BaseJayElement<${pageVSType}>;`);
                slotRefsChildren[slotName] = slotBody.refs;
                slotImports = slotImports.plus(slotBody.imports);
                slotValidations.push(...slotBody.validations);
            }
        }

        // Merge contract ref stubs into inline template refs (DL#138)
        const mergedRefs = mergeContractStubRefs(inlineBody.refs, headlessImport.refs);
        const { renderedRefsManager, refsManagerImport } = renderReferenceManager(
            mergedRefs,
            ReferenceManagerTarget.element,
        );

        // DL#193 Phase 3: a structural (Tier 2) component forwards its named inner child-component
        // refs (e.g. `<jay:Counter ref="cta">`). When present, emit a synthetic refs type from the
        // merged refs so the forwarded refs (`cta: CounterRef<CardViewState>`) surface on BOTH the
        // inline render fn's public API and the usage-site instance ref — the contract-only
        // `${pascal}Refs` type does not declare them. The passthrough spreads `_refs` at runtime
        // (see buildStructuralPassthroughComp), so the runtime object already carries them.
        //
        // The inline render fn always uses the SINGLE type — an instance's own template refs are
        // single (childContext resets `dynamicRef`). When the instance is REPEATED at the usage site
        // (inside a forEach), the page-side instance ref needs the COLLECTION shape (each forwarded
        // `cta` becomes `CounterRefs`), captured here as `_Headless${pascal}${idx}RepeatedRefs`. The
        // collection-ness comes from the page-level ref manager collecting the instances.
        const syntheticSingleRefsTypeName = `_Headless${pascal}${idx}Refs`;
        const syntheticRepeatedRefsTypeName = `_Headless${pascal}${idx}RepeatedRefs`;
        // Q2 = (a) implicit: forward only NAMED child-component refs. Element refs and auto (unnamed)
        // refs stay private, so the synthetic type is built from the component-refs-only subtree.
        const forwardedRefs = filterToComponentRefs(mergedRefs);
        const hasForwardedRefs = headlessImport.structural && hasNamedComponentRefs(mergedRefs);
        const forwardedRepeated = hasForwardedRefs && newContext.dynamicRef;
        let syntheticRefsCode = '';
        let syntheticRefsImports = Imports.none();
        if (hasForwardedRefs) {
            // Shared helper identifiers already emitted earlier in the file — the repeated interface
            // (emitted first) declares `CounterRef`/`CounterRefs`; the companion single interface and
            // any later structural instance embedding the same inner component then skip them.
            const emittedHelpers = newContext.emittedForwardedRefHelpers;
            if (forwardedRepeated) {
                const repeated = renderRefsType(
                    refsToRepeated(forwardedRefs),
                    syntheticRepeatedRefsTypeName,
                    GenerateTarget.jay,
                    true,
                    emittedHelpers,
                );
                const single = renderRefsType(
                    forwardedRefs,
                    syntheticSingleRefsTypeName,
                    GenerateTarget.jay,
                    true,
                    emittedHelpers,
                );
                syntheticRefsCode = `${repeated.renderedRefs}\n${single.renderedRefs}\n`;
                syntheticRefsImports = repeated.imports.plus(single.imports);
            } else {
                const single = renderRefsType(
                    forwardedRefs,
                    syntheticSingleRefsTypeName,
                    GenerateTarget.jay,
                    true,
                    emittedHelpers,
                );
                syntheticRefsCode = `${single.renderedRefs}\n`;
                syntheticRefsImports = single.imports;
            }
        }
        // DL#194 §C (Tier 3, Fork C): a slotted instance surfaces its parent-owned slot refs on the
        // usage-site instance ref, keyed by slot name (`refs.<instance>.<slot>.<ref>`). Emit a
        // synthetic instance-ref interface that EXTENDS the contract Refs (the child's own refs) with
        // the slot refs subtree, plus the `_Headless…Slots` shape the render fn / childComp consume.
        if (hasSlots) {
            const slotRefsTree = mkRefsTree([], slotRefsChildren);
            const rendered = renderRefsType(
                slotRefsTree,
                syntheticSingleRefsTypeName,
                GenerateTarget.jay,
                true,
                newContext.emittedForwardedRefHelpers,
            );
            const slotRefsInterface = rendered.renderedRefs.replace(
                `export interface ${syntheticSingleRefsTypeName} {`,
                `interface ${syntheticSingleRefsTypeName} extends ${refsTypeName} {`,
            );
            // The index signature makes the slots interface assignable to the runtime's
            // `slots?: Record<string, BaseJayElement<ParentVS>>` param (childComp/childCompHydrate)
            // while keeping the named per-slot members for author-facing type checks.
            const slotsTypeCode = `interface ${slotsTypeName} {\n    [slot: string]: BaseJayElement<${pageVSType}>;\n${slotTypeMembers.join('\n')}\n}`;
            syntheticRefsCode = `${slotRefsInterface}\n${slotsTypeCode}\n`;
            syntheticRefsImports = rendered.imports.plus(Import.baseJayElement);
            // The synthetic interface extends the contract Refs type — ensure it is imported.
            for (const link of headlessImport.contractLinks) {
                if (!link.names.some((n) => n.name === refsTypeName))
                    link.names.push({ name: refsTypeName, type: JayUnknown });
            }
            newContext.usedComponentImports.add(refsTypeName);
        }

        // The inline render fn's public API is always the single shape. Slotted instances keep the
        // CONTRACT Refs on the render fn (slot refs are parent-owned, not part of the child API).
        const effectiveRefsTypeName =
            hasForwardedRefs && !hasSlots ? syntheticSingleRefsTypeName : refsTypeName;

        // Build coordinate key: use explicit ref if present, otherwise auto-generate with AR prefix.
        // Must match assignCoordinates' naming (AR0, AR1, ...) so the element target's
        // __headlessInstances keys align with the dev server's discovery pipeline.
        const explicitRef = htmlElement.attributes.ref;
        let coordinateRef: string;
        if (explicitRef) {
            coordinateRef = explicitRef;
        } else {
            const counterKey = contractName;
            const localIndex = newContext.coordinateCounters.get(counterKey) ?? 0;
            newContext.coordinateCounters.set(counterKey, localIndex + 1);
            coordinateRef = `AR${localIndex}`;
        }

        // For static instances: string key from jay-coordinate-base (DL#126).
        // For forEach instances: factory function using dataIds.
        const isInsideForEach = newContext.insideFastForEach;
        const coordinateSuffix = `${contractName}:${coordinateRef}`;
        const instanceCoordBase = htmlElement.getAttribute('jay-coordinate-base');
        const coordinateKey = isInsideForEach
            ? undefined // will use factory
            : instanceCoordBase || coordinateSuffix;

        // DL#194 §C (Tier 3, Fork C): a slotted render fn takes the parent-built `slots` and mounts
        // them at the `foreignChild` anchors. The instance is created via a higher-order constructor
        // that closes over `slots`, so `childComp` can drive the slot fragments' updates separately.
        const makeFnName = `_makeHeadless${pascal}${idx}`;
        const renderFnSignature = hasSlots
            ? `options: RenderElementOptions | undefined, slots: ${slotsTypeName}`
            : `options?: RenderElementOptions`;
        const componentInner = headlessImport.structural
            ? buildStructuralPassthroughComp(headlessImport.contract?.tags ?? [])
            : pluginComponentName;
        const coordinateArg = isInsideForEach
            ? `(dataIds) => [...dataIds, '${coordinateSuffix}'].toString()`
            : `'${coordinateKey}'`;
        const componentDefCode = hasSlots
            ? `const ${makeFnName} = (slots: ${slotsTypeName}) =>
    makeHeadlessInstanceComponent(
        (options?: RenderElementOptions) => ${renderFnName}(options, slots),
        ${componentInner},
        ${coordinateArg},
    );`
            : `const ${componentSymbol} = makeHeadlessInstanceComponent(
    ${renderFnName},
    ${componentInner},
    ${coordinateArg},
);`;

        // Generate type aliases and render function code
        const renderFnCode = `
// Inline template for headless component: ${contractName} #${idx}
type ${elementType} = JayElement<${interactiveViewStateType}, ${effectiveRefsTypeName}>;
type ${renderType} = RenderElement<${interactiveViewStateType}, ${effectiveRefsTypeName}, ${elementType}>;
type ${preRenderType} = [${effectiveRefsTypeName}, ${renderType}];

function ${renderFnName}(${renderFnSignature}): ${preRenderType} {
    ${renderedRefsManager}
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
${inlineBody.rendered}
        ) as ${elementType};
    return [refManager.getPublicAPI() as ${effectiveRefsTypeName}, render];
}

${componentDefCode}`;

        // Accumulate the definition. The synthetic refs type (if any) is emitted in the shared
        // page-level refs section (see renderFunctionImplementation), not in the inline template code,
        // so every target that reuses renderedRefs — element, hydrate, bridge, main-sandbox — sees it.
        newContext.headlessInstanceDefs.push({
            componentSymbol,
            renderFnName,
            renderFnCode,
            pluginComponentName: headlessImport.structural ? undefined : pluginComponentName,
            imports: inlineBody.imports.plus(refsManagerImport).plus(syntheticRefsImports),
            syntheticRefsCode,
        });

        // Generate props getter (from parent ViewState to component props)
        let propsGetterAndRefs = renderChildCompProps(
            htmlElement,
            newContext,
            headlessImport.contract?.props,
        );
        // DL#193 Phase 2a: when the override content binds outer-scope fields (parentDepth > 0),
        // forward the whole enclosing view state as the reserved `__parentContext` prop. It rides
        // the normal props/update channel (updating whenever the outer scope changes, since view
        // states are immutable), and the runtime (makeJayComponent) turns it into a synthetic parent
        // ConstructContext so `_p1.<field>` resolves. No field derivation is needed — the parent view
        // state is passed by reference, so it is cheap and never enters the child's rendered ViewState.
        const outerVar = newContext.variables.currentVar;
        let getPropsBody = propsGetterAndRefs.rendered;
        if (inlineBody.parentDepth > 0) {
            const parentContextEntry = `__parentContext: ${outerVar}`;
            // propsGetterAndRefs renders as an object literal `({ … })` (or `({})`); splice the
            // reserved entry into it. The `props="…"` direct-assignment form spreads instead.
            if (getPropsBody.startsWith('({') && getPropsBody.endsWith('})')) {
                const inner = getPropsBody.slice(2, -2).trim();
                getPropsBody = inner
                    ? `({ ${inner}, ${parentContextEntry} })`
                    : `({ ${parentContextEntry} })`;
            } else {
                getPropsBody = `({ ...${getPropsBody}, ${parentContextEntry} })`;
            }
        }
        let getProps = `(${outerVar}: ${newContext.variables.currentType.name}) => ${getPropsBody}`;

        // Generate ref for the headless instance using contract types directly (refOriginalName /
        // refRefName were computed above so the slot const name could reuse them).
        const refConstName = newContext.refNameGenerator.newConstantName(
            refRefName,
            newContext.variables,
        );
        const isRepeated = newContext.dynamicRef;
        // DL#193 Phase 3 / DL#194 §C: when a structural component forwards inner refs OR a Tier 3
        // instance carries slot refs, the usage-site instance ref is the synthetic type emitted inline
        // in this file (not the contract-only `${pascal}Refs`). The synthetic type is defined locally —
        // no import needed. Slots always yield a single instance ref (a slot never repeats the child).
        const contractRefType =
            hasForwardedRefs || hasSlots
                ? isRepeated && !hasSlots
                    ? syntheticRepeatedRefsTypeName
                    : syntheticSingleRefsTypeName
                : isRepeated
                  ? `${pascal}RepeatedRefs`
                  : `${pascal}Refs`;
        // Ensure contract ref type is imported (synthetic type is local — skip)
        if (!hasForwardedRefs && !hasSlots) {
            for (const link of headlessImport.contractLinks) {
                if (!link.names.some((n) => n.name === contractRefType)) {
                    link.names.push({ name: contractRefType, type: JayUnknown });
                }
            }
            newContext.usedComponentImports.add(contractRefType);
        }
        const instanceRef = mkRef(
            refRefName,
            refOriginalName,
            refConstName,
            isRepeated,
            !htmlElement.attributes.ref,
            newContext.variables.currentType,
            new JayTypeAlias(contractRefType),
        );
        // DL#194 §C: the instance ref carries the parent-owned slot refs as nested managers, keyed
        // by the instance ref name then slot name (`refs.<instance>.<slot>.<ref>`). The instance name
        // is BOTH a component ref (leaf) and a child-manager key — the runtime merges them via
        // `setSlotRefManager` / `DELEGATE_SLOT_REF_TRAP`.
        const instanceRefsTree = hasSlots
            ? mkRefsTree([instanceRef], { [refRefName]: mkRefsTree([], slotRefsChildren) })
            : mkRefsTree([instanceRef], {});
        let renderedRef = new RenderFragment(
            `${refConstName}()`,
            Imports.for(),
            [],
            instanceRefsTree,
        );
        if (renderedRef.rendered !== '') renderedRef = renderedRef.map((_) => ', ' + _);

        // DL#194 §C (Tier 3, Fork C): materialize the slot content fragments once as a shared const
        // inside the page render's root context (see renderFunctionImplementation), then pass it both
        // to the higher-order constructor (so the render fn can mount it) and to `childComp` (so the
        // parent drives its updates).
        let componentCreatorExpr = componentSymbol;
        let slotsArg = '';
        if (hasSlots) {
            newContext.slotPreambles.push(
                `        const ${slotsConstName}: ${slotsTypeName} = { ${slotObjectMembers.join(', ')} };`,
            );
            componentCreatorExpr = `${makeFnName}(${slotsConstName})`;
            slotsArg = `, undefined, ${slotsConstName}`;
        }

        // Return childComp call for the page render function
        return new RenderFragment(
            `${newContext.indent.firstLine}childComp(${componentCreatorExpr}, ${getProps}${renderedRef.rendered}${slotsArg})`,
            Imports.for(Import.childComp)
                .plus(propsGetterAndRefs.imports)
                .plus(renderedRef.imports)
                .plus(Import.ConstructContext)
                .plus(Import.makeHeadlessInstanceComponent)
                .plus(slotImports),
            [
                ...propsGetterAndRefs.validations,
                ...inlineBody.validations,
                ...renderedRef.validations,
                ...slotValidations,
            ],
            renderedRef.refs,
        );
    }

    if (node.nodeType === NodeType.ELEMENT_NODE && (node as HTMLElement).tagName === 'STYLE') {
        const css = textEscape((node as HTMLElement).text);
        return new RenderFragment(
            `${indent.firstLine}e('style', {}, ['${css}'])`,
            Imports.for(Import.element),
        );
    }

    switch (node.nodeType) {
        case NodeType.TEXT_NODE:
            let text = node.innerText;
            return renderTextNode(variables, text, indent); //.map(_ => ident + _);
        case NodeType.ELEMENT_NODE:
            let htmlElement = node as HTMLElement;
            // if (isForEach(htmlElement)) dynamicRef = true;

            // DL#194 §C (Tier 3, Fork C): a FILLED slot anchor marked by the parser renders as a
            // `foreignChild(slots.X)` placeholder inside the child render fn — the parent builds and
            // owns the slot fragment; the child only mounts it at the anchor (no-op update).
            const foreignSlotName = htmlElement.getAttribute(FOREIGN_SLOT_MARKER);
            if (foreignSlotName) {
                return new RenderFragment(
                    `${indent.firstLine}foreignChild(slots.${camelCase(foreignSlotName)})`,
                    Imports.for(Import.foreignChild),
                );
            }

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
                const childNodes = filterContentNodes(htmlElement.childNodes);

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
                    // DL#193: `with-data` is a data-scope switch; it re-runs its body on every
                    // parent update at runtime (no flag needed), and the residual `$parent`
                    // depth drops by one.
                    Math.max(0, nestedChildElement.parentDepth - 1),
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
            } else if (isConditional(htmlElement) && isForEach(htmlElement)) {
                return new RenderFragment('', Imports.none(), [
                    `"if" and "forEach" cannot be on the same element. Wrap the forEach in a separate element: <div if="..."><div forEach="...">...</div></div>`,
                ]);
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
                const forEach = htmlElement.getAttribute('forEach');
                const trackBy = htmlElement.getAttribute('trackBy');

                const validated = validateForEachAccessor(forEach, variables);
                if (isValidationError(validated)) return validated;
                const { accessor: forEachAccessor, childVariables: forEachVariables } = validated;
                const forEachAccessPath = forEachAccessor.terms;

                const paramName = forEachAccessor.rootVar;
                const paramType = variables.currentType.name;
                const forEachFragment = forEachAccessor
                    .render()
                    .map((_) => `(${paramName}: ${paramType}) => ${_}`);

                // Track the forEach iteration type as a used component import
                context.usedComponentImports.add(forEachVariables.currentType.name);

                let newContext = {
                    ...context,
                    variables: forEachVariables,
                    indent: indent.child().noFirstLineBreak().withLastLineBreak(),
                    dynamicRef: true,
                    isInsideGuard: true, // Mark that we're inside a guard
                    insideFastForEach: true,
                    // DL#194 §C: per-item sink for Tier 3 slot content consts — flushed into the forEach
                    // item callback (not the hoisted root) so each repeated item builds its own slot.
                    slotPreambles: [],
                };

                let childElement = renderHtmlElement(htmlElement, newContext);
                return nestRefs(
                    forEachAccessPath,
                    renderForEach(
                        forEachFragment,
                        forEachVariables,
                        trackBy,
                        childElement,
                        newContext.slotPreambles,
                    ),
                );
            } else if (checkAsync(htmlElement).isAsync) {
                const asyncDirective = checkAsync(htmlElement);
                const asyncProperty = htmlElement.getAttribute(asyncDirective.directive);
                const asyncResult = validateAsyncAccessor(
                    asyncProperty,
                    asyncDirective.directive,
                    variables,
                );
                if (isValidationError(asyncResult)) return asyncResult;
                const asyncAccessor = asyncResult;
                const asyncAccessPath = asyncAccessor.terms;

                const getPromiseFragment: RenderFragment = asyncAccessor
                    .render()
                    .map((_) => `vs => ${_}`);

                if (asyncDirective === AsyncDirectiveTypes.resolved) {
                    const promiseResolvedType = (asyncAccessor.resolvedType as JayPromiseType)
                        .itemType;
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

export function processImportedHeadless(headlessImports: JayHeadlessImports[]): Map<string, Ref> {
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
    // DL#193 Phase 3: file-level forwarded-ref helper dedup set. Defaults to a fresh set (element,
    // bridge, main-sandbox targets each own their file). The hydrate target passes a set shared with
    // renderHydrate so the create-variant instance does not re-declare `CounterRef`/`CounterRefs`.
    emittedForwardedRefHelpers: Set<string> = new Set(),
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
    // Build set of headless contract names for detecting <jay:contract-name> instances.
    // Tier 2 pure headfull components (DL#187, `structural`) are real instances too — the
    // compiler inlines an identity passthrough definition for them (see line ~917), so they
    // must be recognized here to receive coordinates and be treated as component instances.
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));

    // Pre-process: assign scoped coordinates (DL#126) so headless instance keys
    // match the server/hydrate targets. Must run before element rendering.
    assignCoordinates(rootBodyElement, { headlessContractNames });

    const rootElement = ensureSingleChildElement(rootBodyElement);
    let renderedRoot: RenderFragment;
    const usedComponentImports = new Set<string>(); // Track used component types
    const headlessInstanceDefs: HeadlessInstanceDefinition[] = [];
    const headlessInstanceCounter = { count: 0 };
    const slotPreambles: string[] = []; // DL#194 §C: page-render slot content declarations
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
            coordinateCounters: new Map(), // Scope-level counter for unique coordinates
            emittedForwardedRefHelpers, // DL#193 Phase 3: file-level helper dedup (shared for hydrate)
            slotPreambles, // DL#194 §C: Tier 3 slot content declarations for the page render body
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

    const { imports: refImports, renderedRefs: renderedPageRefs } = renderRefsType(
        renderedRoot.refs,
        refsType,
    );
    imports = imports.plus(refImports);

    // DL#193 Phase 3: append synthetic refs type declarations for structural components that forward
    // their named inner child-component refs. Emitting them in the shared refs section (rather than the
    // element target's inline template) makes them visible to every target that reuses renderedRefs —
    // notably the hydrate and worker-sandbox bridge, which do not emit the element inline templates.
    const syntheticRefsDecls = headlessInstanceDefs
        .map((def) => def.syntheticRefsCode)
        .filter((code): code is string => !!code)
        .join('');
    const renderedRefs = syntheticRefsDecls
        ? `${renderedPageRefs}\n\n${syntheticRefsDecls.trimEnd()}`
        : renderedPageRefs;

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

    const { renderedRefsManager } = renderReferenceManager(
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

    // DL#194 §C (Tier 3, Fork C): materialize slot content fragments once inside the root context,
    // before the returned element — each is shared by the child constructor closure and `childComp`'s
    // `slots` argument. When present, the callback becomes a block with `const` declarations + `return`.
    const rootCallback =
        slotPreambles.length > 0
            ? `() => {
${slotPreambles.join('\n')}
        return ${renderedRoot.rendered.trim()};
    }`
            : `() => ${renderedRoot.rendered.trim()}`;

    const body = `${headlessDefsCode}export function render(options?: RenderElementOptions): ${preRenderType} {
${renderedRefsManager}
${headLinksInjection}${recursiveFunctionsSection}    const render = (viewState: ${viewStateType}) => ConstructContext.withRootContext(
        viewState, refManager,
        ${rootCallback}
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

    // If inline data (no contract), default to fast+interactive phase (DL#108).
    // All data is available at SSR and reactive on the client.
    if (jayFile.hasInlineData) {
        return [
            `export type ${baseName}SlowViewState = {};`,
            `export type ${baseName}FastViewState = ${actualViewStateTypeName};`,
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
            renderedElement = expandContractType(renderedElement, baseName);
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
        renderedElement = expandContractType(renderedElement, jayFile.baseElementName);
    }

    // Build the set of used component type names from headless imports
    // Start with types tracked during rendering (forEach iteration types)
    const usedHeadlessTypeNames = new Set(usedComponentImports);

    // Add types that are used in the generated type definitions
    // These come from headless imports and are used in ViewState/Refs interfaces
    const headlessModules = new Set<string>();
    for (const headless of jayFile.headlessImports) {
        // DL#194: a Tier 2 (structural) composite is inlined — its ViewState/Refs types never appear
        // in the output, so don't force-keep them. Enum types from its contract may still be
        // referenced by inlined bindings (the grammar doesn't self-import enums), so keep those.
        if (!headless.structural) {
            // The main ViewState and Refs types are always used when a real headless import exists
            usedHeadlessTypeNames.add(headless.rootType.name);
        }
        for (const link of headless.contractLinks) {
            headlessModules.add(link.module);
            for (const name of link.names) {
                if (isEnumType(name.type)) {
                    usedHeadlessTypeNames.add(name.name);
                } else if (!headless.structural && name.name.endsWith('Refs')) {
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
        renderedElement = expandContractType(renderedElement, jayFile.baseElementName);
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

export function generateElementHydrateFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
): WithValidations<string> {
    const types = generateTypes(jayFile.types);

    // Pre-assign coordinates and refs before element compilation so the element
    // compiler reads the same refs that the hydrate and server-element compilers use.
    // Tier 2 pure headfull components (DL#187, `structural`) are instances here too, so
    // their coordinates must match the element file — include them (only skip keyed ones).
    const headlessImports = jayFile.headlessImports?.filter((h) => !h.key) ?? [];
    const headlessContractNames = new Set(headlessImports.map((h) => h.contractName));
    assignCoordinates(jayFile.body, { headlessContractNames });

    // DL#193 Phase 3: the element pass and the hydrate pass share ONE forwarded-ref helper dedup set,
    // so the hydrate-only create-variant instance (compiled via the element target) skips
    // `CounterRef`/`CounterRefs` already declared by the element pass and only its extra interfaces remain.
    const emittedForwardedRefHelpers = new Set<string>();
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
        emittedForwardedRefHelpers,
    );
    const phaseTypes = generatePhaseSpecificTypes(jayFile);
    const { fragment: renderedHydrate, syntheticRefsDecls: hydrateSyntheticRefsDecls } =
        renderHydrate(
            jayFile.types,
            jayFile.body,
            jayFile.imports,
            elementType,
            preRenderType,
            refsType,
            jayFile.headlessImports,
            jayFile.contract,
            emittedForwardedRefHelpers,
        );
    // Declare the hydrate-only synthetic ref types (create-variant instances) alongside the shared
    // refs section so they precede their use in the hydrate function body.
    const allRenderedRefs = hydrateSyntheticRefsDecls
        ? `${renderedRefs}\n\n${hydrateSyntheticRefsDecls}`
        : renderedRefs;

    // If we have contract or inline data, replace the 2-parameter JayContract with 5-parameter version
    let finalRenderedElement = renderedElement;
    if (jayFile.contract || jayFile.hasInlineData) {
        finalRenderedElement = expandContractType(finalRenderedElement, jayFile.baseElementName);
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

    // DL#194 Phase B: a Tier 2 (structural) composite is inlined, so its contract ViewState/Refs types
    // no longer appear in the hydrate output — drop them to avoid dead imports (mirrors the element
    // target's `usedHeadlessTypeNames` filter). Enum types stay (inlined bindings still reference them),
    // and any name a non-structural headless still needs is preserved.
    const structuralHeadless = (jayFile.headlessImports ?? []).filter((h) => h.structural);
    let filteredHydrateImports = jayFile.imports;
    if (structuralHeadless.length > 0) {
        const structuralModules = new Set(
            structuralHeadless.flatMap((h) => h.contractLinks.map((l) => l.module)),
        );
        const dropNames = new Set<string>();
        for (const headless of structuralHeadless) {
            dropNames.add(headless.rootType.name);
            for (const link of headless.contractLinks)
                for (const name of link.names)
                    if (!isEnumType(name.type) && name.name.endsWith('Refs'))
                        dropNames.add(name.name);
        }
        // Never drop a name a non-structural headless import still relies on.
        for (const headless of (jayFile.headlessImports ?? []).filter((h) => !h.structural)) {
            dropNames.delete(headless.rootType.name);
            for (const link of headless.contractLinks)
                for (const name of link.names) dropNames.delete(name.name);
        }
        filteredHydrateImports = jayFile.imports
            .map((importLink) => {
                if (!structuralModules.has(importLink.module)) return importLink;
                const names = importLink.names.filter((n) => !dropNames.has(n.as || n.name));
                return names.length === 0 ? null : { ...importLink, names };
            })
            .filter((imp): imp is JayImportLink => imp !== null);
    }

    const renderedFile = [
        renderImports(
            hydrateImports,
            ImportsFor.implementation,
            filteredHydrateImports,
            importerMode,
        ),
        types,
        allRenderedRefs,
        phaseTypes,
        finalRenderedElement,
        renderedHydrate.rendered,
    ]
        .filter((_) => _ !== null && _ !== '')
        .join('\n\n');
    return new WithValidations(renderedFile, renderedHydrate.validations);
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
