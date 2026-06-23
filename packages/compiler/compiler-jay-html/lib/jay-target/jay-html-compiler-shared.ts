/**
 * Shared utilities for jay-html compilation targets.
 * Extracted from jay-html-compiler.ts (Design Log #118) to eliminate
 * cross-target duplication and ensure consistency.
 */
import {
    Imports,
    isArrayType,
    isHtmlStringType,
    isPromiseType,
    JayUnknown,
    mkRef,
    mkRefsTree,
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
import { decode as decodeEntities } from 'he';

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

export function decodeHtmlEntities(s: string): string {
    return decodeEntities(s);
}

export function findHtmlStringBindings(childNodes: Node[], variables: Variables): string[] {
    const found: string[] = [];
    for (const child of childNodes) {
        if (child.nodeType !== NodeType.TEXT_NODE) continue;
        const text = (child.innerText || '').trim();
        for (const m of text.matchAll(/\{([^}]+)\}/g)) {
            const accessor = parseAccessor(m[1], variables);
            if (isHtmlStringType(accessor.resolvedType)) found.push(m[1]);
        }
    }
    return found;
}

/** Escape a static attribute value for embedding in a JS single-quoted string literal. */
export function escapeForJsString(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
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
    'slow',
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

/**
 * Merge contract-declared refs into the template's RefsTree as autoRef stubs (DL#138).
 * Refs already present in the template are kept as-is. Missing contract refs are added
 * as autoRef entries so the runtime creates managed ref entries for them — identical to
 * how keyed headless components handle unused refs via optimizeRefs().
 */
export function mergeContractStubRefs(templateRefs: RefsTree, contractRefs: RefsTree): RefsTree {
    const templateRefNames = new Set(templateRefs.refs.map((r) => camelCase(r.ref)));
    const stubRefs: Ref[] = [];
    for (const contractRef of contractRefs.refs) {
        if (!templateRefNames.has(camelCase(contractRef.ref))) {
            stubRefs.push(
                mkRef(
                    contractRef.originalName,
                    contractRef.originalName,
                    camelCase(`ref ${contractRef.originalName}`),
                    contractRef.repeated,
                    true,
                    contractRef.viewStateType,
                    contractRef.elementType,
                ),
            );
        }
    }

    const mergedChildren: Record<string, RefsTree> = { ...templateRefs.children };
    for (const [childName, contractChild] of Object.entries(contractRefs.children)) {
        if (mergedChildren[childName]) {
            mergedChildren[childName] = mergeContractStubRefs(
                mergedChildren[childName],
                contractChild,
            );
        } else {
            mergedChildren[childName] = markAllRefsAsStubs(contractChild);
        }
    }

    const childrenChanged =
        Object.keys(mergedChildren).length !== Object.keys(templateRefs.children).length;
    if (stubRefs.length === 0 && !childrenChanged) return templateRefs;
    return mkRefsTree(
        [...templateRefs.refs, ...stubRefs],
        mergedChildren,
        templateRefs.repeated,
        templateRefs.imported?.refsTypeName,
        templateRefs.imported?.repeatedRefsTypeName,
    );
}

function markAllRefsAsStubs(tree: RefsTree): RefsTree {
    const stubbedRefs = tree.refs.map((ref) =>
        mkRef(
            ref.originalName,
            ref.originalName,
            camelCase(`ref ${ref.originalName}`),
            ref.repeated,
            true,
            ref.viewStateType,
            ref.elementType,
        ),
    );
    const stubbedChildren: Record<string, RefsTree> = {};
    for (const [name, child] of Object.entries(tree.children)) {
        stubbedChildren[name] = markAllRefsAsStubs(child);
    }
    return mkRefsTree(
        stubbedRefs,
        stubbedChildren,
        tree.repeated,
        tree.imported?.refsTypeName,
        tree.imported?.repeatedRefsTypeName,
    );
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
