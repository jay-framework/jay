/**
 * Shared utilities for jay-html compilation targets.
 * Extracted from jay-html-compiler.ts (Design Log #118) to eliminate
 * cross-target duplication and ensure consistency.
 */
import {
    Imports,
    isArrayType,
    isPromiseType,
    JayUnknown,
    mkRef,
    Ref,
    RefsTree,
    RenderFragment,
} from '@jay-framework/compiler-shared';
import { HTMLElement } from 'node-html-parser';
import { camelCase } from '../case-utils';
import { JayHeadlessImports } from './jay-html-source-file';
import { NodeType } from 'node-html-parser';
import Node from 'node-html-parser/dist/nodes/node';
import { AsyncDirectiveTypes } from './jay-html-helpers';
import { Accessor, parseAccessor, Variables } from '../expressions/expression-compiler';

/**
 * Filter child nodes, removing whitespace-only text nodes.
 * Used when processing element children across all compilation targets.
 *
 * When `onlyIfMultiple` is true (default false), filtering is only applied
 * when there are multiple children. This preserves a single text child
 * as-is (e.g., `<span> </span>` keeps its whitespace content), which is
 * the correct behavior when rendering an element's direct content.
 */
export function filterContentNodes(childNodes: Node[], onlyIfMultiple: boolean = false): Node[] {
    if (onlyIfMultiple && childNodes.length <= 1) return childNodes;
    return childNodes.filter(
        (_) => _.nodeType !== NodeType.TEXT_NODE || (_.innerText || '').trim() !== '',
    );
}

// ============================================================================
// Attribute rendering constants
// ============================================================================

export function textEscape(s: string): string {
    return s.replace(/'/g, "\\'");
}

export const PROPERTY = 1;
export const BOOLEAN_ATTRIBUTE = 3;
export const propertyMapping: Record<string, { type: number }> = {
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
export const attributesRequiresQuotes = /[- ]/;

// ============================================================================
// Directive attribute detection
// ============================================================================

/**
 * Set of attribute names that are directives (not rendered as HTML attributes).
 * Shared across all compilation targets to prevent drift when new directives are added.
 */
const DIRECTIVE_ATTRIBUTES = new Set([
    'if',
    'foreach',
    'trackby',
    'ref',
    'slowforeach',
    'jayindex',
    'jaytrackby',
    'jay-coordinate-base',
    'jay-scope',
    AsyncDirectiveTypes.loading.directive,
    AsyncDirectiveTypes.resolved.directive,
    AsyncDirectiveTypes.rejected.directive,
]);

/**
 * Check whether an attribute name (already lowercased) is a directive that should
 * be skipped during attribute rendering. Pass extra names for target-specific
 * additions (e.g. 'data-jay-dynamic' in the server target).
 */
export function isDirectiveAttribute(attrCanonical: string, ...extra: string[]): boolean {
    if (DIRECTIVE_ATTRIBUTES.has(attrCanonical)) return true;
    for (const e of extra) {
        if (attrCanonical === e) return true;
    }
    return false;
}

// ============================================================================
// Accessor validation helpers
// ============================================================================

export interface ValidatedArrayAccessor {
    accessor: Accessor;
    childVariables: Variables;
}

/**
 * Parse and validate a forEach accessor expression. Returns the parsed accessor
 * and child variables, or a RenderFragment error if validation fails.
 */
export function validateForEachAccessor(
    forEach: string,
    variables: Variables,
): ValidatedArrayAccessor | RenderFragment {
    const accessor = parseAccessor(forEach, variables);
    if (accessor.resolvedType === JayUnknown)
        return new RenderFragment('', Imports.none(), [
            `forEach directive - failed to resolve forEach type [forEach=${forEach}]`,
        ]);
    if (!isArrayType(accessor.resolvedType))
        return new RenderFragment('', Imports.none(), [
            `forEach directive - resolved forEach type is not an array [forEach=${forEach}]`,
        ]);
    return { accessor, childVariables: variables.childVariableFor(accessor) };
}

/**
 * Parse and validate a slowForEach accessor expression. Returns the parsed accessor
 * and child variables, or a RenderFragment error if validation fails.
 */
export function validateSlowForEachAccessor(
    arrayName: string,
    variables: Variables,
): ValidatedArrayAccessor | RenderFragment {
    const accessor = parseAccessor(arrayName, variables);
    if (accessor.resolvedType === JayUnknown)
        return new RenderFragment('', Imports.none(), [
            `slowForEach directive - failed to resolve array type [slowForEach=${arrayName}]`,
        ]);
    if (!isArrayType(accessor.resolvedType))
        return new RenderFragment('', Imports.none(), [
            `slowForEach directive - resolved type is not an array [slowForEach=${arrayName}]`,
        ]);
    return { accessor, childVariables: variables.childVariableFor(accessor) };
}

/**
 * Parse and validate an async accessor expression. Returns the parsed accessor,
 * or a RenderFragment error if validation fails.
 */
export function validateAsyncAccessor(
    property: string,
    directive: string,
    variables: Variables,
): Accessor | RenderFragment {
    const accessor = parseAccessor(property, variables);
    if (accessor.resolvedType === JayUnknown)
        return new RenderFragment('', Imports.none(), [
            `async directive - failed to resolve type for ${directive}=${property}`,
        ]);
    if (!isPromiseType(accessor.resolvedType))
        return new RenderFragment('', Imports.none(), [
            `async directive - resolved type for ${directive}=${property} is not a promise, found ${accessor.resolvedType.name}`,
        ]);
    return accessor;
}

/** Type guard: check if a validation result is an error (RenderFragment). */
export function isValidationError<T>(result: T | RenderFragment): result is RenderFragment {
    return result instanceof RenderFragment;
}

// ============================================================================
// Headless instance helpers
// ============================================================================

/**
 * Resolve a headless import by contract name, returning an error RenderFragment if not found.
 */
export function resolveHeadlessImport(
    contractName: string,
    headlessImports: JayHeadlessImports[],
): JayHeadlessImports | RenderFragment {
    // Lowercase: contract names are stored lowercase, but contractName may come
    // from rawTagName preserving original case.
    const lowerName = contractName.toLowerCase();
    const headlessImport = headlessImports.find((h) => h.contractName === lowerName);
    if (!headlessImport) {
        return new RenderFragment('', Imports.none(), [
            `No headless import found for contract "${contractName}"`,
        ]);
    }
    return headlessImport;
}

/**
 * Extract coordinate info from a headless instance element.
 * Reads jay-coordinate-base and jay-scope, extracts the scope ID and suffix.
 *
 * In scoped coordinates (DL#126), the instance coordinate is `S<n>/contractName:ref`
 * and the jay-scope attribute holds the child scope ID.
 */
export function extractHeadlessCoordinate(
    element: HTMLElement,
    contractName: string,
):
    | {
          instanceCoord: string;
          coordSegments: string[];
          coordinateSuffix: string;
          childScopeId: string | undefined;
      }
    | RenderFragment {
    const instanceCoord = element.getAttribute(COORD_ATTR);
    if (!instanceCoord) {
        return new RenderFragment('', Imports.none(), [
            `Headless instance <jay:${contractName}> missing jay-coordinate-base — run assignCoordinates first`,
        ]);
    }
    const coordSegments = instanceCoord.split('/');
    // Lowercase: coordinates use lowercase contract names, but contractName
    // may come from rawTagName preserving original case.
    const lowerName = contractName.toLowerCase();
    const coordinateSuffix =
        coordSegments.find((s) => s.startsWith(lowerName + ':')) || `${lowerName}:0`;
    const childScopeId = element.getAttribute('jay-scope') || undefined;
    return { instanceCoord, coordSegments, coordinateSuffix, childScopeId };
}

/**
 * Build a map from camelCase ref names to Ref objects from a contract's RefsTree.
 * Used by element and hydrate targets when compiling headless instance inline templates.
 */
export function buildContractRefMap(refsTree: RefsTree): Map<string, Ref> {
    const result = new Map<string, Ref>();
    const walk = (tree: RefsTree) => {
        for (const ref of tree.refs) {
            const refWithOriginalName = mkRef(
                ref.originalName,
                ref.originalName,
                ref.constName,
                ref.repeated,
                ref.autoRef,
                ref.viewStateType,
                ref.elementType,
            );
            result.set(camelCase(ref.originalName), refWithOriginalName);
        }
        for (const child of Object.values(tree.children)) {
            walk(child);
        }
    };
    walk(refsTree);
    return result;
}

export const COORD_ATTR = 'jay-coordinate-base';

// ============================================================================
// Contract type helpers
// ============================================================================

/**
 * Replace 2-parameter JayContract type with 5-parameter version including phase types.
 * Used by generateElementFile, generateElementBridgeFile, and generateElementHydrateFile.
 */
export function expandContractType(renderedElement: string, baseName: string): string {
    const contractPattern = new RegExp(
        `export type ${baseName}Contract = JayContract<([^,]+), ${baseName}ElementRefs>;`,
        'g',
    );
    return renderedElement.replace(contractPattern, (_, viewStateType) => {
        return `export type ${baseName}Contract = JayContract<
    ${viewStateType},
    ${baseName}ElementRefs,
    ${baseName}SlowViewState,
    ${baseName}FastViewState,
    ${baseName}InteractiveViewState
>;`;
    });
}
