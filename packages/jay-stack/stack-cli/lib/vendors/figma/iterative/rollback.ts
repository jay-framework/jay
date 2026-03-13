import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { SyncStateV1, SyncBaselineV1 } from '@jay-framework/editor-protocol';

// ─── Rollback Snapshot Schema ────────────────────────────────────

export const ROLLBACK_SCHEMA_VERSION = 1;

export interface RollbackSnapshotV1 {
    schemaVersion: 1;
    capturedAt: string;
    pageUrl: string;
    sectionSyncId: string;
    nodeTree: FigmaVendorDocument;
    syncState?: SyncStateV1;
    baseline?: SyncBaselineV1;
}

export interface SnapshotValidation {
    valid: boolean;
    errors: string[];
}

// ─── Capture ─────────────────────────────────────────────────────

/**
 * Creates a rollback snapshot from the current section state.
 * The caller provides the raw node tree (already serialized from Figma)
 * and any existing sync metadata.
 */
export function captureSnapshot(
    nodeTree: FigmaVendorDocument,
    pageUrl: string,
    sectionSyncId: string,
    syncState?: SyncStateV1,
    baseline?: SyncBaselineV1,
): RollbackSnapshotV1 {
    return {
        schemaVersion: ROLLBACK_SCHEMA_VERSION,
        capturedAt: new Date().toISOString(),
        pageUrl,
        sectionSyncId,
        nodeTree: JSON.parse(JSON.stringify(nodeTree)),
        syncState: syncState ? JSON.parse(JSON.stringify(syncState)) : undefined,
        baseline: baseline ? JSON.parse(JSON.stringify(baseline)) : undefined,
    };
}

// ─── Serialize / Deserialize ─────────────────────────────────────

export function serializeSnapshot(snapshot: RollbackSnapshotV1): string {
    return JSON.stringify(snapshot);
}

export function deserializeSnapshot(raw: string): RollbackSnapshotV1 | null {
    try {
        const parsed = JSON.parse(raw);
        const validation = validateSnapshot(parsed);
        if (!validation.valid) return null;
        return parsed as RollbackSnapshotV1;
    } catch {
        return null;
    }
}

// ─── Validation ──────────────────────────────────────────────────

export function validateSnapshot(data: unknown): SnapshotValidation {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['snapshot is not an object'] };
    }

    const obj = data as Record<string, unknown>;

    if (obj.schemaVersion !== ROLLBACK_SCHEMA_VERSION) {
        errors.push(`expected schemaVersion ${ROLLBACK_SCHEMA_VERSION}, got ${obj.schemaVersion}`);
    }

    if (!obj.capturedAt || typeof obj.capturedAt !== 'string') {
        errors.push('missing or invalid capturedAt timestamp');
    }

    if (!obj.pageUrl || typeof obj.pageUrl !== 'string') {
        errors.push('missing or invalid pageUrl');
    }

    if (!obj.sectionSyncId || typeof obj.sectionSyncId !== 'string') {
        errors.push('missing or invalid sectionSyncId');
    }

    if (!obj.nodeTree || typeof obj.nodeTree !== 'object') {
        errors.push('missing or invalid nodeTree');
    } else {
        const tree = obj.nodeTree as Record<string, unknown>;
        if (!tree.id || typeof tree.id !== 'string') {
            errors.push('nodeTree missing required id field');
        }
        if (!tree.name || typeof tree.name !== 'string') {
            errors.push('nodeTree missing required name field');
        }
        if (!tree.type || typeof tree.type !== 'string') {
            errors.push('nodeTree missing required type field');
        }
    }

    if (obj.syncState !== undefined) {
        if (typeof obj.syncState !== 'object' || obj.syncState === null) {
            errors.push('syncState present but not an object');
        } else {
            const ss = obj.syncState as Record<string, unknown>;
            if (ss.schemaVersion !== 1) {
                errors.push('syncState has invalid schemaVersion');
            }
        }
    }

    if (obj.baseline !== undefined) {
        if (typeof obj.baseline !== 'object' || obj.baseline === null) {
            errors.push('baseline present but not an object');
        } else {
            const bl = obj.baseline as Record<string, unknown>;
            if (bl.schemaVersion !== 1) {
                errors.push('baseline has invalid schemaVersion');
            }
            if (!Array.isArray(bl.nodes)) {
                errors.push('baseline.nodes is not an array');
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ─── Size Estimation ─────────────────────────────────────────────

/**
 * Estimates the serialized byte size of a snapshot without full serialization.
 * Uses JSON.stringify length as a proxy (UTF-8 overhead is small for ASCII-heavy data).
 */
export function estimateSnapshotSize(snapshot: RollbackSnapshotV1): number {
    return JSON.stringify(snapshot).length;
}

// ─── Payload Budget ──────────────────────────────────────────────
// Figma pluginData has practical size limits. Without a budget, rollback
// snapshots grow unbounded. These are initial estimates — the enforcement
// mechanism is the key deliverable.

export const ROLLBACK_BUDGET_BYTES = 512 * 1024; // 512 KB per section
export const SYNC_METADATA_BUDGET_BYTES = 64 * 1024; // 64 KB per node

export interface BudgetCheckResult {
    withinBudget: boolean;
    originalSize: number;
    compactedSize?: number;
    compactedSnapshot?: RollbackSnapshotV1;
    warning?: string;
}

/**
 * Compacts a snapshot by stripping non-essential data from nodes.
 * Removes fills, strokes, effects, vector data, and other heavy visual properties
 * while preserving structural and semantic data needed for restore.
 */
function compactNodeTree(tree: FigmaVendorDocument): FigmaVendorDocument {
    const compacted: FigmaVendorDocument = {
        id: tree.id,
        name: tree.name,
        type: tree.type,
    };

    // Keep essential structural properties
    if (tree.x !== undefined) compacted.x = tree.x;
    if (tree.y !== undefined) compacted.y = tree.y;
    if (tree.width !== undefined) compacted.width = tree.width;
    if (tree.height !== undefined) compacted.height = tree.height;
    if (tree.characters !== undefined) compacted.characters = tree.characters;
    if (tree.layoutMode) compacted.layoutMode = tree.layoutMode;
    if (tree.visible !== undefined) compacted.visible = tree.visible;
    if (tree.pluginData) compacted.pluginData = { ...tree.pluginData };

    if (tree.children) {
        compacted.children = tree.children.map(compactNodeTree);
    }

    return compacted;
}

/**
 * Checks whether a snapshot fits within the budget.
 * If it doesn't, attempts compaction. If compaction still exceeds budget,
 * returns a warning indicating rollback is unavailable for this session.
 */
export function checkBudget(
    snapshot: RollbackSnapshotV1,
    budget: number = ROLLBACK_BUDGET_BYTES,
): BudgetCheckResult {
    const originalSize = estimateSnapshotSize(snapshot);

    if (originalSize <= budget) {
        return { withinBudget: true, originalSize };
    }

    // Attempt compaction
    const compactedSnapshot: RollbackSnapshotV1 = {
        ...snapshot,
        nodeTree: compactNodeTree(snapshot.nodeTree),
    };
    const compactedSize = estimateSnapshotSize(compactedSnapshot);

    if (compactedSize <= budget) {
        return {
            withinBudget: true,
            originalSize,
            compactedSize,
            compactedSnapshot,
            warning: `Snapshot compacted from ${originalSize} to ${compactedSize} bytes`,
        };
    }

    return {
        withinBudget: false,
        originalSize,
        compactedSize,
        warning: `Rollback unavailable: snapshot ${compactedSize} bytes exceeds ${budget} byte budget even after compaction`,
    };
}
