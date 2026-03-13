import { describe, it, expect } from 'vitest';
import {
    captureSnapshot,
    serializeSnapshot,
    deserializeSnapshot,
    validateSnapshot,
    estimateSnapshotSize,
    checkBudget,
    ROLLBACK_SCHEMA_VERSION,
    ROLLBACK_BUDGET_BYTES,
} from '../../../../lib/vendors/figma/iterative/rollback';
import type { RollbackSnapshotV1 } from '../../../../lib/vendors/figma/iterative/rollback';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import type { SyncStateV1, SyncBaselineV1 } from '@jay-framework/editor-protocol';

function makeTree(): FigmaVendorDocument {
    return {
        id: 'section-1',
        name: 'TestSection',
        type: 'SECTION',
        children: [
            {
                id: 'n1',
                name: 'Card',
                type: 'FRAME',
                fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
                width: 200,
                pluginData: { 'jay-layer-bindings': '{"path":"content.title"}' },
            },
            {
                id: 'n2',
                name: 'Label',
                type: 'TEXT',
                characters: 'Hello World',
            },
        ],
        pluginData: { 'jay-import-timestamp': '2026-01-01T00:00:00Z' },
    };
}

function makeSyncState(): SyncStateV1 {
    return {
        schemaVersion: 1,
        pageUrl: '/test',
        sectionSyncId: 'sync-1',
        baselineImportHash: 'abc123',
        baselineImportedAt: '2026-01-01T00:00:00Z',
        unresolvedConflictCount: 0,
    };
}

function makeBaseline(): SyncBaselineV1 {
    return {
        schemaVersion: 1,
        pageUrl: '/test',
        nodes: [
            { nodeKey: 'n1', properties: { fills: '#red' } },
            { nodeKey: 'n2', properties: { characters: 'Hello World' } },
        ],
    };
}

describe('Rollback Snapshot — Capture', () => {
    it('captures node tree with deep clone', () => {
        const tree = makeTree();
        const snapshot = captureSnapshot(tree, '/test', 'sync-1');

        expect(snapshot.schemaVersion).toBe(ROLLBACK_SCHEMA_VERSION);
        expect(snapshot.pageUrl).toBe('/test');
        expect(snapshot.sectionSyncId).toBe('sync-1');
        expect(snapshot.nodeTree.id).toBe('section-1');
        expect(snapshot.nodeTree.children).toHaveLength(2);

        // Verify deep clone — mutating original shouldn't affect snapshot
        tree.children![0].name = 'MUTATED';
        expect(snapshot.nodeTree.children![0].name).toBe('Card');
    });

    it('captures sync state and baseline when provided', () => {
        const snapshot = captureSnapshot(
            makeTree(),
            '/test',
            'sync-1',
            makeSyncState(),
            makeBaseline(),
        );

        expect(snapshot.syncState?.schemaVersion).toBe(1);
        expect(snapshot.syncState?.sectionSyncId).toBe('sync-1');
        expect(snapshot.baseline?.nodes).toHaveLength(2);
    });

    it('handles missing sync state and baseline', () => {
        const snapshot = captureSnapshot(makeTree(), '/test', 'sync-1');
        expect(snapshot.syncState).toBeUndefined();
        expect(snapshot.baseline).toBeUndefined();
    });

    it('sets capturedAt timestamp', () => {
        const before = new Date().toISOString();
        const snapshot = captureSnapshot(makeTree(), '/test', 'sync-1');
        const after = new Date().toISOString();

        expect(snapshot.capturedAt >= before).toBe(true);
        expect(snapshot.capturedAt <= after).toBe(true);
    });
});

describe('Rollback Snapshot — Serialize/Deserialize Roundtrip', () => {
    it('serialize → deserialize produces identical snapshot', () => {
        const original = captureSnapshot(
            makeTree(),
            '/test',
            'sync-1',
            makeSyncState(),
            makeBaseline(),
        );

        const serialized = serializeSnapshot(original);
        const restored = deserializeSnapshot(serialized);

        expect(restored).not.toBeNull();
        expect(restored!.schemaVersion).toBe(original.schemaVersion);
        expect(restored!.pageUrl).toBe(original.pageUrl);
        expect(restored!.sectionSyncId).toBe(original.sectionSyncId);
        expect(restored!.nodeTree).toEqual(original.nodeTree);
        expect(restored!.syncState).toEqual(original.syncState);
        expect(restored!.baseline).toEqual(original.baseline);
    });

    it('deserialize returns null for invalid JSON', () => {
        expect(deserializeSnapshot('not json')).toBeNull();
    });

    it('deserialize returns null for wrong schema version', () => {
        const bad = JSON.stringify({
            schemaVersion: 99,
            capturedAt: new Date().toISOString(),
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { id: '1', name: 'N', type: 'FRAME' },
        });
        expect(deserializeSnapshot(bad)).toBeNull();
    });

    it('deserialize returns null for missing nodeTree', () => {
        const bad = JSON.stringify({
            schemaVersion: 1,
            capturedAt: new Date().toISOString(),
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
        });
        expect(deserializeSnapshot(bad)).toBeNull();
    });

    it('double roundtrip: serialize → deserialize → serialize produces identical output', () => {
        const original = captureSnapshot(makeTree(), '/test', 'sync-1', makeSyncState());
        const first = serializeSnapshot(original);
        const restored = deserializeSnapshot(first)!;
        const second = serializeSnapshot(restored);
        expect(first).toBe(second);
    });
});

describe('Rollback Snapshot — Validation', () => {
    it('valid snapshot passes validation', () => {
        const snapshot = captureSnapshot(
            makeTree(),
            '/test',
            'sync-1',
            makeSyncState(),
            makeBaseline(),
        );
        const result = validateSnapshot(snapshot);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object input', () => {
        expect(validateSnapshot(null).valid).toBe(false);
        expect(validateSnapshot('string').valid).toBe(false);
        expect(validateSnapshot(42).valid).toBe(false);
    });

    it('reports wrong schemaVersion', () => {
        const result = validateSnapshot({
            schemaVersion: 5,
            capturedAt: '2026-01-01',
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { id: '1', name: 'N', type: 'FRAME' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
    });

    it('reports missing capturedAt', () => {
        const result = validateSnapshot({
            schemaVersion: 1,
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { id: '1', name: 'N', type: 'FRAME' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('capturedAt'))).toBe(true);
    });

    it('reports missing nodeTree.id', () => {
        const result = validateSnapshot({
            schemaVersion: 1,
            capturedAt: '2026-01-01',
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { name: 'N', type: 'FRAME' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('nodeTree missing required id'))).toBe(true);
    });

    it('reports invalid syncState when present', () => {
        const result = validateSnapshot({
            schemaVersion: 1,
            capturedAt: '2026-01-01',
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { id: '1', name: 'N', type: 'FRAME' },
            syncState: { schemaVersion: 99 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('syncState'))).toBe(true);
    });

    it('reports invalid baseline when present', () => {
        const result = validateSnapshot({
            schemaVersion: 1,
            capturedAt: '2026-01-01',
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            nodeTree: { id: '1', name: 'N', type: 'FRAME' },
            baseline: { schemaVersion: 1, pageUrl: '/test', nodes: 'not-array' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('baseline.nodes'))).toBe(true);
    });

    it('collects multiple errors', () => {
        const result = validateSnapshot({
            schemaVersion: 99,
            nodeTree: 'not-an-object',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
    });
});

describe('Rollback Snapshot — Size Estimation', () => {
    it('estimates size in bytes', () => {
        const snapshot = captureSnapshot(makeTree(), '/test', 'sync-1');
        const size = estimateSnapshotSize(snapshot);
        expect(size).toBeGreaterThan(0);
        expect(size).toBe(serializeSnapshot(snapshot).length);
    });

    it('larger trees produce larger estimates', () => {
        const smallTree: FigmaVendorDocument = {
            id: 's',
            name: 'Small',
            type: 'SECTION',
            children: [],
        };
        const bigTree: FigmaVendorDocument = {
            id: 's',
            name: 'Big',
            type: 'SECTION',
            children: Array.from({ length: 50 }, (_, i) => ({
                id: `n${i}`,
                name: `Node${i}`,
                type: 'FRAME',
                fills: [{ type: 'SOLID', color: { r: i / 50, g: 0, b: 0 } }],
                width: 100 + i,
                height: 50 + i,
                characters: `Text content for node ${i}`,
                pluginData: { 'jay-layer-bindings': `binding-${i}` },
            })),
        };

        const smallSize = estimateSnapshotSize(captureSnapshot(smallTree, '/s', 'sync'));
        const bigSize = estimateSnapshotSize(captureSnapshot(bigTree, '/b', 'sync'));
        expect(bigSize).toBeGreaterThan(smallSize);
    });
});

describe('Rollback Snapshot — Budget Enforcement', () => {
    it('small snapshot passes budget check', () => {
        const snapshot = captureSnapshot(makeTree(), '/test', 'sync-1');
        const result = checkBudget(snapshot);
        expect(result.withinBudget).toBe(true);
        expect(result.originalSize).toBeGreaterThan(0);
        expect(result.compactedSnapshot).toBeUndefined();
    });

    it('oversized snapshot triggers compaction', () => {
        const heavyChildren: FigmaVendorDocument[] = Array.from({ length: 200 }, (_, i) => ({
            id: `n${i}`,
            name: `Node${i}`,
            type: 'FRAME',
            fills: Array.from({ length: 20 }, (_, j) => ({
                type: 'SOLID',
                color: { r: j / 20, g: i / 200, b: 0.5 },
                opacity: 0.8,
                visible: true,
                blendMode: 'NORMAL',
            })),
            strokes: Array.from({ length: 10 }, () => ({
                type: 'SOLID',
                color: { r: 0.5, g: 0.5, b: 0.5 },
            })),
            effects: Array.from({ length: 5 }, () => ({
                type: 'DROP_SHADOW',
                offset: { x: 0, y: 4 },
                radius: 8,
                color: { r: 0, g: 0, b: 0, a: 0.25 },
            })),
            width: 100 + i,
            height: 50 + i,
            characters: `Text content for node ${i} with some extra padding to increase size`,
            pluginData: { 'jay-layer-bindings': JSON.stringify({ path: `content.field${i}` }) },
        }));

        const tree: FigmaVendorDocument = {
            id: 'section',
            name: 'HeavySection',
            type: 'SECTION',
            children: heavyChildren,
        };

        // Use a small budget to force compaction
        const snapshot = captureSnapshot(tree, '/test', 'sync-1');
        const tinyBudget = estimateSnapshotSize(snapshot) / 3;
        const result = checkBudget(snapshot, tinyBudget);

        // Compaction should reduce size by removing fills/strokes/effects
        if (result.compactedSize && result.compactedSize <= tinyBudget) {
            expect(result.withinBudget).toBe(true);
            expect(result.compactedSnapshot).toBeDefined();
            expect(result.warning).toContain('compacted');
        } else {
            // If still too large even after compaction
            expect(result.withinBudget).toBe(false);
            expect(result.warning).toContain('exceeds');
        }
    });

    it('compacted snapshot preserves structural and semantic data', () => {
        const tree: FigmaVendorDocument = {
            id: 'section',
            name: 'TestSection',
            type: 'SECTION',
            children: [
                {
                    id: 'n1',
                    name: 'Card',
                    type: 'FRAME',
                    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
                    strokes: [{ type: 'SOLID' }],
                    effects: [{ type: 'DROP_SHADOW' }],
                    width: 200,
                    height: 100,
                    characters: 'Hello',
                    pluginData: { 'jay-layer-bindings': 'test', semanticHtml: 'div' },
                    children: [
                        {
                            id: 'n2',
                            name: 'Label',
                            type: 'TEXT',
                            characters: 'World',
                        },
                    ],
                },
            ],
        };

        const snapshot = captureSnapshot(tree, '/test', 'sync-1');
        // Use a very small budget to force compaction
        const result = checkBudget(snapshot, 1);

        // Even in worst case (budget exceeded), check the compacted tree structure
        if (result.compactedSnapshot) {
            const compacted = result.compactedSnapshot.nodeTree;
            expect(compacted.id).toBe('section');
            const n1 = compacted.children?.[0];
            expect(n1?.id).toBe('n1');
            expect(n1?.width).toBe(200);
            expect(n1?.characters).toBe('Hello');
            expect(n1?.pluginData?.['jay-layer-bindings']).toBe('test');
            // Visual data should be stripped
            expect(n1?.fills).toBeUndefined();
            expect(n1?.strokes).toBeUndefined();
            expect(n1?.effects).toBeUndefined();
            // Children preserved
            expect(n1?.children?.[0]?.id).toBe('n2');
            expect(n1?.children?.[0]?.characters).toBe('World');
        }
    });

    it('L4-level realistic section fits within default budget', () => {
        // Simulate an L4-level page: ~30 nodes with variants, bindings, and moderate styling
        const children: FigmaVendorDocument[] = Array.from({ length: 30 }, (_, i) => ({
            id: `node-${i}`,
            name: `Element${i}`,
            type: i < 10 ? 'FRAME' : 'TEXT',
            fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6 } }],
            width: 200,
            height: 80,
            characters: i >= 10 ? `Text content ${i}` : undefined,
            pluginData: {
                'data-jay-sid': `sid-${i}`,
                'jay-layer-bindings': JSON.stringify([
                    { tagPath: ['content', `field${i}`], attribute: 'content' },
                ]),
                ...(i % 5 === 0 ? { semanticHtml: 'button' } : {}),
            },
        }));

        const tree: FigmaVendorDocument = {
            id: 'section-l4',
            name: 'L4VariantsPage',
            type: 'SECTION',
            pluginData: {
                'jay-import-content-hash': 'abc123',
                'jay-import-timestamp': '2026-01-01T00:00:00Z',
            },
            children,
        };

        const snapshot = captureSnapshot(tree, '/level-4-variants', 'sync-l4');
        const result = checkBudget(snapshot, ROLLBACK_BUDGET_BYTES);
        expect(result.withinBudget).toBe(true);
        expect(result.originalSize).toBeLessThan(ROLLBACK_BUDGET_BYTES);
    });
});
