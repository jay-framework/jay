import Node from 'node-html-parser/dist/nodes/node';
import { HTMLElement, NodeType } from 'node-html-parser';
import { Import, ImportName, WithValidations } from '@jay-framework/compiler-shared';

export function isConditional(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('if');
}

export function isForEach(node: Node): boolean {
    return node.nodeType !== NodeType.TEXT_NODE && (node as HTMLElement).hasAttribute('forEach');
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
    } else
        return new WithValidations(undefined, [
            `Jay HTML Body must have a single child element, yet ${elements.length} found.`,
        ]);
}
