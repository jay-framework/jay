import Node from 'node-html-parser/dist/nodes/node';
import { HTMLElement, NodeType, parse as parseHtml } from 'node-html-parser';
import { Import, ImportName, WithValidations } from '@jay-framework/compiler-shared';

/** Convert kebab-case to camelCase: scroll-carousel → scrollCarousel */
function kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function isConditional(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('if');
}

export function isForEach(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('forEach');
}

/**
 * DL#193 Phase 3: recursively check whether any descendant (or the node itself) is a `forEach`.
 * Used to reject a `forEach` inside a pure (Tier 2) composite — a pure component receives only
 * scalar/enum props (DL#187), so no array can ever drive an internal forEach.
 */
export function hasForEachDescendant(node: Node): boolean {
    if (isForEach(node)) return true;
    return (node.childNodes ?? []).some(hasForEachDescendant);
}

/**
 * DL#193 Phase 3 (§4 validation): exact diagnostic for a `forEach` inside a pure (Tier 2) composite.
 * Shared by the element and hydrate targets so the message is identical across targets.
 */
export function forEachInsidePureComponentError(contractName: string): string {
    return `forEach is not supported inside a pure (Tier 2) component <jay:${contractName}> — a pure component receives only scalar/enum props (DL#187), so no array can drive an internal forEach`;
}

/**
 * DL#193 Phase 3 (§4 validation): scan a parsed body for a pure (Tier 2) structural instance whose
 * inline template contains a `forEach`. Returns the offending instance's tag name (e.g. `card`) or
 * null. Must run BEFORE `assignCoordinates`, which extracts/strips forEach template content — after
 * that pass the inner forEach is no longer visible on the structural body.
 */
export function findForEachInsidePureComposite(
    node: Node,
    importedSymbols: Set<string>,
    headlessContractNames: Set<string>,
    structuralContractNames: Set<string>,
): string | null {
    if (node.nodeType !== NodeType.TEXT_NODE) {
        const el = node as HTMLElement;
        const match = getComponentName(el.rawTagName, importedSymbols, headlessContractNames);
        if (
            match?.kind === 'headless-instance' &&
            structuralContractNames.has(match.name.toLowerCase()) &&
            (el.childNodes ?? []).some(hasForEachDescendant)
        ) {
            return match.name;
        }
    }
    for (const child of node.childNodes ?? []) {
        const found = findForEachInsidePureComposite(
            child,
            importedSymbols,
            headlessContractNames,
            structuralContractNames,
        );
        if (found) return found;
    }
    return null;
}

export function isRecurse(node: Node): boolean {
    return (
        node.nodeType !== NodeType.TEXT_NODE &&
        (node as HTMLElement).rawTagName?.toLowerCase() === 'recurse'
    );
}

/**
 * Check if a recurse element requires withData (has accessor and it's not ".")
 * This is used to determine if the parent needs to be a dynamic element
 */
export function isRecurseWithData(node: Node): boolean {
    if (!isRecurse(node)) return false;
    const accessor = (node as HTMLElement).getAttribute('accessor');
    // Only needs withData if accessor is explicitly set and not "." (forEach default)
    return accessor != null && accessor !== '.';
}

export function isWithData(node: Node): boolean {
    if (node.nodeType === NodeType.TEXT_NODE) return false;
    const element = node as HTMLElement;
    if (!element.rawTagName) return false;
    return element.rawTagName.toLowerCase() === 'with-data';
}

export interface AsyncDirectiveType {
    directive?: string;
    import?: ImportName;
    name?: string;
    isAsync: boolean;
}
export const AsyncDirectiveTypes: Record<string, AsyncDirectiveType> = {
    resolved: {
        directive: 'when-resolved',
        import: Import.resolved,
        name: 'resolved',
        isAsync: true,
    },
    loading: { directive: 'when-loading', import: Import.pending, name: 'pending', isAsync: true },
    rejected: {
        directive: 'when-rejected',
        import: Import.rejected,
        name: 'rejected',
        isAsync: true,
    },
    notAsync: { isAsync: false },
} as const;

export function checkAsync(node: Node): AsyncDirectiveType {
    if (node.nodeType !== NodeType.TEXT_NODE) {
        if ((node as HTMLElement).hasAttribute(AsyncDirectiveTypes.resolved.directive))
            return AsyncDirectiveTypes.resolved;
        else if ((node as HTMLElement).hasAttribute(AsyncDirectiveTypes.loading.directive))
            return AsyncDirectiveTypes.loading;
        else if ((node as HTMLElement).hasAttribute(AsyncDirectiveTypes.rejected.directive))
            return AsyncDirectiveTypes.rejected;
    }
    return AsyncDirectiveTypes.notAsync;
}

export function ensureSingleChildElement(node: Node): WithValidations<HTMLElement> {
    const elements = node.childNodes.filter((child) => child.nodeType === NodeType.ELEMENT_NODE);
    if (elements.length === 1) {
        return new WithValidations(elements[0] as HTMLElement);
    }
    if (elements.length === 0) {
        return new WithValidations(undefined, [
            `Jay HTML Body must have at least one child element.`,
        ]);
    }
    const wrapper = parseHtml('<div style="display: contents"></div>').firstChild as HTMLElement;
    const parentEl = node as HTMLElement;
    for (const child of [...parentEl.childNodes]) {
        child.remove();
        wrapper.appendChild(child);
    }
    parentEl.appendChild(wrapper);
    return new WithValidations(wrapper);
}

// ============================================================
// Jay Component Prefix Helpers
// ============================================================

/**
 * The prefix for Jay component elements.
 * Components can be written as <jay:ComponentName> or <ComponentName> (deprecated).
 */
export const JAY_COMPONENT_PREFIX = 'jay:';

/**
 * Check if an element tag has the jay: prefix.
 */
export function hasJayPrefix(tagName: string): boolean {
    return tagName.startsWith(JAY_COMPONENT_PREFIX);
}

/**
 * Extract the component name from a tag, stripping the jay: prefix if present.
 * Returns the original tag name if no prefix.
 */
export function extractComponentName(tagName: string): string {
    if (hasJayPrefix(tagName)) {
        return tagName.slice(JAY_COMPONENT_PREFIX.length);
    }
    return tagName;
}

export type ComponentKind = 'headful' | 'headless-instance' | 'unknown';

export interface ComponentMatch {
    name: string;
    kind: ComponentKind;
}

/**
 * Check if an element is a component reference.
 * A component is identified by:
 * 1. Having jay: prefix (new syntax): <jay:Counter> or <jay:product-card>
 * 2. Being in the importedSymbols set (legacy syntax): <Counter>
 *
 * For jay: prefixed elements:
 * - If the name matches a headless import contract name → headless instance (checked first)
 * - If the name matches an imported symbol → headful component
 * - Otherwise → unknown (will be an error)
 *
 * Returns the component match info if it's a component, null otherwise.
 */
export function getComponentName(
    tagName: string,
    importedSymbols: Set<string>,
    headlessContractNames?: Set<string>,
): ComponentMatch | null {
    // Check for jay: prefix first (new syntax)
    if (hasJayPrefix(tagName)) {
        const componentName = extractComponentName(tagName);
        // Check headless instance FIRST — a headless import's contract name
        // takes precedence over a headful import with the same name, since
        // the headless code link also appears in importedSymbols.
        // Lowercase: contract names are stored lowercase, rawTagName preserves original case.
        if (headlessContractNames?.has(componentName.toLowerCase())) {
            return { name: componentName, kind: 'headless-instance' };
        }
        // Check headful (imported symbols) — try both kebab-case and camelCase
        // since jay-html uses kebab (<jay:scroll-carousel>) but imports are camelCase (scrollCarousel)
        const camelName = kebabToCamel(componentName);
        if (importedSymbols.has(componentName)) {
            return { name: componentName, kind: 'headful' };
        }
        if (camelName !== componentName && importedSymbols.has(camelName)) {
            return { name: camelName, kind: 'headful' };
        }
        // Jay-prefixed but not matched - this will be an error
        // For now, still return the name so the compiler can report the error
        return { name: componentName, kind: 'unknown' };
    }

    // Legacy syntax: plain element name matching an import
    if (importedSymbols.has(tagName)) {
        return { name: tagName, kind: 'headful' };
    }

    return null;
}
