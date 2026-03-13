import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { FlatNode } from './match-confidence';
import type { PropertySnapshot, PlannerInput, StructuralChange } from './merge-planner';
import type { MergeConfidence } from '@jay-framework/editor-protocol';
import type { MatchResult } from './types';

/**
 * Flattens a FigmaVendorDocument tree into FlatNode[] for the match engine.
 * Walks the tree depth-first and records parent index and tree depth.
 */
export function flattenVendorDoc(doc: FigmaVendorDocument): FlatNode[] {
    const nodes: FlatNode[] = [];

    function walk(node: FigmaVendorDocument, parentIndex: number, depth: number) {
        nodes.push({
            key: node.id,
            pluginData: node.pluginData,
            name: node.name,
            type: node.type,
            parentIndex,
            treeDepth: depth,
        });

        if (node.children) {
            const currentIndex = nodes.length - 1;
            for (const child of node.children) {
                walk(child, currentIndex, depth + 1);
            }
        }
    }

    walk(doc, -1, 0);
    return nodes;
}

/**
 * Extracts a property snapshot from a FigmaVendorDocument node.
 * Captures layout, visual, and semantic properties (excludes children and tree structure).
 */
export function extractPropertySnapshot(node: FigmaVendorDocument): PropertySnapshot {
    const snapshot: PropertySnapshot = {};

    for (const [key, value] of Object.entries(node)) {
        if (key === 'children' || key === 'id' || key === 'name' || key === 'type') continue;
        if (key === 'pluginData') {
            for (const [pdKey, pdValue] of Object.entries(value as Record<string, string>)) {
                snapshot[pdKey] = pdValue;
            }
            continue;
        }
        snapshot[key] = value;
    }

    return snapshot;
}

/**
 * Indexes a vendor doc tree by node id for O(1) lookup.
 */
function indexDocById(doc: FigmaVendorDocument): Map<string, FigmaVendorDocument> {
    const index = new Map<string, FigmaVendorDocument>();
    function walk(node: FigmaVendorDocument) {
        index.set(node.id, node);
        if (node.children) {
            for (const child of node.children) walk(child);
        }
    }
    walk(doc);
    return index;
}

/**
 * Builds PlannerInput[] from match results and the three trees (baseline, designer, incoming).
 * Each matched pair produces one PlannerInput with property snapshots from all three states.
 */
export function buildPlannerInputs(
    matches: MatchResult[],
    baselineIndex: Map<string, PropertySnapshot>,
    designerDoc: FigmaVendorDocument,
    incomingDoc: FigmaVendorDocument,
): PlannerInput[] {
    const designerIdx = indexDocById(designerDoc);
    const incomingIdx = indexDocById(incomingDoc);
    const inputs: PlannerInput[] = [];

    for (const match of matches) {
        const designerNode = designerIdx.get(match.currentNodeKey);
        const incomingNode = incomingIdx.get(match.incomingNodeKey);
        if (!designerNode || !incomingNode) continue;

        const baseline = baselineIndex.get(match.currentNodeKey) ?? {};
        const designer = extractPropertySnapshot(designerNode);
        const incoming = extractPropertySnapshot(incomingNode);

        inputs.push({
            nodeKey: match.currentNodeKey,
            nodeName: designerNode.name,
            baseline,
            designer,
            incoming,
            confidence: match.confidence,
        });
    }

    return inputs;
}

/**
 * Builds StructuralChange[] from unmatched nodes.
 * - Unmatched in incoming → add
 * - Unmatched in current (designer) → remove
 */
export function buildStructuralChanges(
    unmatchedCurrent: string[],
    unmatchedIncoming: string[],
    designerDoc: FigmaVendorDocument,
    incomingDoc: FigmaVendorDocument,
    defaultConfidence: MergeConfidence,
    designerOverrides: Set<string>,
): StructuralChange[] {
    const designerIdx = indexDocById(designerDoc);
    const incomingIdx = indexDocById(incomingDoc);
    const changes: StructuralChange[] = [];

    for (const nodeKey of unmatchedIncoming) {
        const node = incomingIdx.get(nodeKey);
        changes.push({
            type: 'add',
            nodeKey,
            nodeName: node?.name ?? nodeKey,
            confidence: defaultConfidence,
            hasDesignerOverride: false,
        });
    }

    for (const nodeKey of unmatchedCurrent) {
        const node = designerIdx.get(nodeKey);
        changes.push({
            type: 'remove',
            nodeKey,
            nodeName: node?.name ?? nodeKey,
            confidence: defaultConfidence,
            hasDesignerOverride: designerOverrides.has(nodeKey),
        });
    }

    return changes;
}

/**
 * Converts a SyncBaselineV1 nodes array into a lookup map for the planner.
 */
export function baselineToPropertyIndex(
    nodes: Array<{ nodeKey: string; properties: Record<string, unknown> }>,
): Map<string, PropertySnapshot> {
    const index = new Map<string, PropertySnapshot>();
    for (const node of nodes) {
        index.set(node.nodeKey, node.properties as PropertySnapshot);
    }
    return index;
}
