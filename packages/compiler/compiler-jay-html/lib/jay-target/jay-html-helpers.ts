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
