import { createHash } from 'crypto';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type {
    MergeOperation,
    StructuralOperation,
    ConflictItem,
    ConflictAction,
    SyncStateV1,
    SyncBaselineV1,
    BaselineNodeSnapshot,
    ImportReportV2,
} from '@jay-framework/editor-protocol';
import type { MergePlan } from './merge-planner';
import { generateReport } from './sync-report';
import { EXCLUDED_PLUGIN_DATA_KEYS, normalizeFillsForComparison } from './vendor-doc-flatten';

// ─── Public Types ────────────────────────────────────────────────

export interface ConflictResolution {
    nodeKey: string;
    property: string;
    action: ConflictAction;
    rebindTarget?: string;
}

export interface ApplyInput {
    existingDoc: FigmaVendorDocument;
    incomingDoc: FigmaVendorDocument;
    plan: MergePlan;
    conflictResolutions?: ConflictResolution[];
    pageUrl: string;
    sessionId: string;
    sectionSyncId: string;
    /** Match results for building baseline with stable keys.
     *  Maps currentNodeKey (Figma ID) → incomingNodeKey (source-based, stable across re-imports). */
    matches?: Array<{ currentNodeKey: string; incomingNodeKey: string }>;
}

export interface ApplyResult {
    mergedDoc: FigmaVendorDocument;
    appliedOps: MergeOperation[];
    appliedStructuralOps: StructuralOperation[];
    skippedOps: MergeOperation[];
    unresolvedConflicts: ConflictItem[];
    newBaseline: SyncBaselineV1;
    newSyncState: SyncStateV1;
    report: ImportReportV2;
}

// ─── Internal Helpers ────────────────────────────────────────────

function cloneDoc(doc: FigmaVendorDocument): FigmaVendorDocument {
    return JSON.parse(JSON.stringify(doc));
}

function indexNodesByKey(doc: FigmaVendorDocument): Map<string, FigmaVendorDocument> {
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

function buildParentAndDepthMaps(doc: FigmaVendorDocument): {
    parentMap: Map<string, string>;
    depthMap: Map<string, number>;
} {
    const parentMap = new Map<string, string>();
    const depthMap = new Map<string, number>();
    function walk(node: FigmaVendorDocument, depth: number) {
        depthMap.set(node.id, depth);
        if (node.children) {
            for (const child of node.children) {
                parentMap.set(child.id, node.id);
                walk(child, depth + 1);
            }
        }
    }
    walk(doc, 0);
    return { parentMap, depthMap };
}

const PLUGIN_DATA_PROPERTIES = new Set([
    'jay-layer-bindings',
    'jay-ref',
    'jay-id',
    'data-jay-sid',
    'data-figma-id',
    'jay-import-report',
    'jay-import-content-hash',
    'jay-import-timestamp',
    'semanticHtml',
    'jay-sync-state-v1',
    'jay-sync-baseline-v1',
    'jay-sync-rollback-v1',
]);

function setNodeProperty(node: FigmaVendorDocument, property: string, value: unknown): void {
    if (PLUGIN_DATA_PROPERTIES.has(property)) {
        if (!node.pluginData) node.pluginData = {};
        node.pluginData[property] = value == null ? '' : String(value);
    } else {
        (node as Record<string, unknown>)[property] = value;
    }
}

function removeNodeFromTree(root: FigmaVendorDocument, nodeKey: string): boolean {
    if (!root.children) return false;

    const idx = root.children.findIndex((c) => c.id === nodeKey);
    if (idx >= 0) {
        root.children.splice(idx, 1);
        return true;
    }

    for (const child of root.children) {
        if (removeNodeFromTree(child, nodeKey)) return true;
    }
    return false;
}

/**
 * Sort property operations into deterministic execution order:
 * visual → layout → semantic, then by nodeKey for locality.
 */
function sortPropertyOps(ops: MergeOperation[]): MergeOperation[] {
    const classOrder: Record<string, number> = { visual: 0, layout: 1, semantic: 2 };
    return [...ops].sort((a, b) => {
        const ca = classOrder[a.propertyClass] ?? 1;
        const cb = classOrder[b.propertyClass] ?? 1;
        if (ca !== cb) return ca - cb;
        return a.nodeKey.localeCompare(b.nodeKey);
    });
}

/**
 * Sort structural operations: add first (safe), reorder second, remove last (destructive).
 * Within adds, sort by tree depth (parents before children) to ensure correct placement.
 * nodeDepths provides depth information from the incoming tree for add ordering.
 */
function sortStructuralOps(
    ops: StructuralOperation[],
    nodeDepths: Map<string, number>,
): StructuralOperation[] {
    const typeOrder: Record<string, number> = { add: 0, reorder: 1, remove: 2 };
    return [...ops].sort((a, b) => {
        const ta = typeOrder[a.type] ?? 1;
        const tb = typeOrder[b.type] ?? 1;
        if (ta !== tb) return ta - tb;
        if (a.type === 'add' && b.type === 'add') {
            const da = nodeDepths.get(a.nodeKey) ?? 0;
            const db = nodeDepths.get(b.nodeKey) ?? 0;
            if (da !== db) return da - db;
        }
        return a.nodeKey.localeCompare(b.nodeKey);
    });
}

function computeDocHash(doc: FigmaVendorDocument): string {
    return createHash('sha256').update(JSON.stringify(doc), 'utf8').digest('hex');
}

/**
 * Build a baseline snapshot from the merged doc for the next merge cycle.
 * Captures all non-structural properties per node.
 *
 * Uses stable keys (incoming/source IDs) instead of Figma node IDs when a
 * stableKeyMap is provided, so the baseline survives node replacement in
 * the plugin's applyMergeResult (which creates new Figma nodes with new IDs).
 */
export function buildBaseline(
    doc: FigmaVendorDocument,
    pageUrl: string,
    stableKeyMap?: Map<string, string>,
): SyncBaselineV1 {
    const nodes: BaselineNodeSnapshot[] = [];

    function walk(node: FigmaVendorDocument) {
        const properties: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
            if (key === 'children' || key === 'id' || key === 'name' || key === 'type') continue;
            if (key === 'pluginData') {
                for (const [pdKey, pdValue] of Object.entries(value as Record<string, string>)) {
                    if (EXCLUDED_PLUGIN_DATA_KEYS.has(pdKey)) continue;
                    properties[pdKey] = pdValue;
                }
                continue;
            }
            if (key === 'fills' && Array.isArray(value)) {
                properties[key] = normalizeFillsForComparison(value);
                continue;
            }
            properties[key] = value;
        }
        const stableKey = stableKeyMap?.get(node.id) ?? node.id;
        nodes.push({ nodeKey: stableKey, properties });

        if (node.children) {
            for (const child of node.children) walk(child);
        }
    }

    walk(doc);
    return { schemaVersion: 1, pageUrl, nodes };
}

// ─── Main Applier ────────────────────────────────────────────────

/**
 * Applies a MergePlan to produce a merged vendor document.
 *
 * Pure function: clones existingDoc before mutation, never modifies inputs.
 * Execution order is deterministic regardless of plan ordering.
 *
 * Returns the merged doc, tracking info for applied/skipped operations,
 * unresolved conflicts, and new baseline + sync state for persistence.
 */
export function applyMergePlan(input: ApplyInput): ApplyResult {
    const mergedDoc = cloneDoc(input.existingDoc);
    const mergedIndex = indexNodesByKey(mergedDoc);
    const incomingIndex = indexNodesByKey(input.incomingDoc);
    const { parentMap: incomingParentMap, depthMap: incomingDepthMap } = buildParentAndDepthMaps(
        input.incomingDoc,
    );

    const appliedOps: MergeOperation[] = [];
    const skippedOps: MergeOperation[] = [];
    const appliedStructuralOps: StructuralOperation[] = [];
    const unresolvedConflicts: ConflictItem[] = [];

    const resolutionLookup = new Map<string, ConflictResolution>();
    if (input.conflictResolutions) {
        for (const res of input.conflictResolutions) {
            resolutionLookup.set(`${res.nodeKey}::${res.property}`, res);
        }
    }

    // Phase 1: Property updates in deterministic order
    const sortedPropOps = sortPropertyOps(input.plan.propertyOperations);

    for (const op of sortedPropOps) {
        const node = mergedIndex.get(op.nodeKey);
        if (!node) {
            skippedOps.push(op);
            continue;
        }

        switch (op.decision) {
            case 'applyIncoming':
                setNodeProperty(node, op.property, op.incomingValue);
                appliedOps.push(op);
                break;

            case 'preserveDesigner':
            case 'skip':
                skippedOps.push(op);
                break;

            case 'needsDecision': {
                const resolution = resolutionLookup.get(`${op.nodeKey}::${op.property}`);

                if (resolution) {
                    switch (resolution.action) {
                        case 'applyIncoming':
                            setNodeProperty(node, op.property, op.incomingValue);
                            appliedOps.push(op);
                            break;
                        case 'keepMine':
                            skippedOps.push(op);
                            break;
                        case 'rebind':
                            if (resolution.rebindTarget) {
                                setNodeProperty(node, op.property, resolution.rebindTarget);
                            }
                            appliedOps.push(op);
                            break;
                    }
                } else {
                    skippedOps.push(op);
                    const conflict = input.plan.conflicts.find(
                        (c) => c.nodeKey === op.nodeKey && c.property === op.property,
                    );
                    if (conflict) unresolvedConflicts.push(conflict);
                }
                break;
            }
        }
    }

    // Phase 2: Structural changes in deterministic order (add → reorder → remove)
    // Adds sorted by depth so parents are processed before children.
    const sortedStructOps = sortStructuralOps(input.plan.structuralOperations, incomingDepthMap);

    for (const op of sortedStructOps) {
        if (op.decision === 'applyIncoming') {
            if (op.type === 'add') {
                if (mergedIndex.has(op.nodeKey)) {
                    appliedStructuralOps.push(op);
                    continue;
                }
                const incomingNode = incomingIndex.get(op.nodeKey);
                if (incomingNode) {
                    const parentKey = incomingParentMap.get(op.nodeKey);
                    const parentNode = parentKey ? mergedIndex.get(parentKey) : mergedDoc;
                    const target = parentNode ?? mergedDoc;
                    if (!target.children) target.children = [];
                    const cloned = cloneDoc(incomingNode);
                    target.children.push(cloned);
                    indexNodesByKey(cloned).forEach((node, key) => mergedIndex.set(key, node));
                }
            } else if (op.type === 'remove') {
                removeNodeFromTree(mergedDoc, op.nodeKey);
            }
            // Reorder: position metadata is in the incoming tree.
            // The plugin handles actual reorder using child indices.
            appliedStructuralOps.push(op);
        } else if (op.decision === 'needsDecision') {
            const resKey =
                op.type === 'reorder' ? `${op.nodeKey}::_order` : `${op.nodeKey}::_structure`;
            const resolution = resolutionLookup.get(resKey);

            if (resolution) {
                if (resolution.action === 'applyIncoming') {
                    if (op.type === 'remove') removeNodeFromTree(mergedDoc, op.nodeKey);
                    appliedStructuralOps.push(op);
                }
                // keepMine → do nothing, node stays
            } else {
                const conflict = input.plan.conflicts.find(
                    (c) =>
                        c.nodeKey === op.nodeKey &&
                        (c.property === '_structure' || c.property === '_order'),
                );
                if (conflict) unresolvedConflicts.push(conflict);
            }
        }
    }

    // Phase 3: Build new baseline from merged state.
    // Use incoming (source-based) keys so the baseline survives Figma node replacement.
    const stableKeyMap = new Map<string, string>();
    if (input.matches) {
        for (const m of input.matches) {
            stableKeyMap.set(m.currentNodeKey, m.incomingNodeKey);
        }
    }
    const newBaseline = buildBaseline(
        mergedDoc,
        input.pageUrl,
        stableKeyMap.size > 0 ? stableKeyMap : undefined,
    );

    // Phase 4: Compute new sync state
    const now = new Date().toISOString();
    const newSyncState: SyncStateV1 = {
        schemaVersion: 1,
        pageUrl: input.pageUrl,
        sectionSyncId: input.sectionSyncId,
        baselineImportHash: computeDocHash(mergedDoc),
        baselineImportedAt: now,
        lastMergeSessionId: input.sessionId,
        lastMergeAppliedAt: now,
        unresolvedConflictCount: unresolvedConflicts.length,
    };

    // Phase 5: Generate report
    const report = generateReport(input.plan, input.sessionId);

    return {
        mergedDoc,
        appliedOps,
        appliedStructuralOps,
        skippedOps,
        unresolvedConflicts,
        newBaseline,
        newSyncState,
        report,
    };
}
