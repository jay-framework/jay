import { describe, it, expect } from 'vitest';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol/vendors/figma';
import type { SyncStateV1, SyncBaselineV1 } from '@jay-framework/editor-protocol';
import { flattenVendorDoc, buildPlannerInputs, buildStructuralChanges, baselineToPropertyIndex } from '../../../../lib/vendors/figma/iterative/vendor-doc-flatten';
import { matchNodes } from '../../../../lib/vendors/figma/iterative/match-confidence';
import { createMergePlan } from '../../../../lib/vendors/figma/iterative/merge-planner';
import { applyMergePlan, buildBaseline } from '../../../../lib/vendors/figma/iterative/merge-applier';
import { captureSnapshot, serializeSnapshot, deserializeSnapshot, checkBudget } from '../../../../lib/vendors/figma/iterative/rollback';

// ─── Test Helpers ────────────────────────────────────────────────

function makeSection(children: FigmaVendorDocument[], pluginData?: Record<string, string>): FigmaVendorDocument {
    return {
        id: 'section-1',
        name: 'TestPage',
        type: 'SECTION',
        pluginData: { 'jpage': 'true', 'urlRoute': '/test', ...pluginData },
        children,
    };
}

function makeFrame(id: string, props: Record<string, unknown> = {}): FigmaVendorDocument {
    return {
        id,
        name: `Frame-${id}`,
        type: 'FRAME',
        pluginData: {},
        ...props,
    };
}

function makeText(id: string, text: string, bindings?: string): FigmaVendorDocument {
    const pluginData: Record<string, string> = {};
    if (bindings) pluginData['jay-layer-bindings'] = bindings;
    return {
        id,
        name: `Text-${id}`,
        type: 'TEXT',
        characters: text,
        pluginData,
    };
}

// ─── Integration Test: Full Transaction Path ─────────────────────

describe('Apply + Rollback Integration', () => {
    it('full transaction: baseline → plan → apply → verify → rollback → verify original', () => {
        // === Setup: existing section with baseline ===
        const existing = makeSection([
            makeFrame('header', { fills: '#red', width: 800 }),
            makeText('title', 'Welcome', JSON.stringify([{ tagPath: ['content', 'title'], attribute: 'content' }])),
            makeFrame('card', {
                children: [
                    makeText('desc', 'Description text'),
                ],
            }),
        ]);

        // Capture snapshot of existing state (before any mutations)
        const preSnapshot = captureSnapshot(existing, '/test', 'sync-1');
        const serializedSnapshot = serializeSnapshot(preSnapshot);

        // === Build baseline from existing state ===
        const baselineV1 = buildBaseline(existing, '/test');
        const baselineIndex = baselineToPropertyIndex(baselineV1.nodes);

        // === Incoming changes (code update on disk) ===
        const incoming = makeSection([
            makeFrame('header', { fills: '#blue', width: 800 }),
            makeText('title', 'Hello World', JSON.stringify([{ tagPath: ['content', 'title'], attribute: 'content' }])),
            makeFrame('card', {
                children: [
                    makeText('desc', 'Updated description'),
                ],
            }),
            makeFrame('footer', { fills: '#gray' }), // new node
        ]);

        // === Match + Plan ===
        const currentFlat = flattenVendorDoc(existing);
        const incomingFlat = flattenVendorDoc(incoming);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        expect(matchResult.matches.length).toBeGreaterThan(0);

        const plannerInputs = buildPlannerInputs(
            matchResult.matches, baselineIndex, existing, incoming,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent, matchResult.unmatchedIncoming,
            existing, incoming, 'high', new Set(),
        );

        const plan = createMergePlan(plannerInputs, structChanges);

        // === Apply ===
        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'sess-1',
            sectionSyncId: 'sync-1',
        });

        // Verify merged doc has changes
        const mergedTitle = result.mergedDoc.children?.find(c => c.id === 'title');
        expect(mergedTitle?.characters).toBe('Hello World');

        // Verify report
        expect(result.report.schemaVersion).toBe(2);
        expect(result.newSyncState.schemaVersion).toBe(1);
        expect(result.newSyncState.sectionSyncId).toBe('sync-1');
        expect(result.newBaseline.nodes.length).toBeGreaterThan(0);

        // === Rollback ===
        const restored = deserializeSnapshot(serializedSnapshot);
        expect(restored).not.toBeNull();
        expect(restored!.nodeTree.id).toBe('section-1');

        // Verify rollback tree matches original
        const restoredTitle = restored!.nodeTree.children?.find(c => c.id === 'title');
        expect(restoredTitle?.characters).toBe('Welcome');

        // Original doc should not have been mutated
        const originalTitle = existing.children?.find(c => c.id === 'title');
        expect(originalTitle?.characters).toBe('Welcome');
    });

    it('mixed operations: style change + structural add + metadata update', () => {
        const existing = makeSection([
            makeFrame('card-1', { fills: '#red', width: 200 }),
            makeText('label-1', 'Item 1'),
        ]);

        const baseline = buildBaseline(existing, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        // Incoming: change style, keep text, add new card
        const incoming = makeSection([
            makeFrame('card-1', { fills: '#green', width: 200 }),
            makeText('label-1', 'Item 1'),
            makeFrame('card-2', { fills: '#blue', width: 200 }), // new
        ]);

        const currentFlat = flattenVendorDoc(existing);
        const incomingFlat = flattenVendorDoc(incoming);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const plannerInputs = buildPlannerInputs(
            matchResult.matches, baselineIndex, existing, incoming,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent, matchResult.unmatchedIncoming,
            existing, incoming, 'high', new Set(),
        );

        const plan = createMergePlan(plannerInputs, structChanges);

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'sess-mixed',
            sectionSyncId: 'sync-1',
        });

        // Style change applied
        const card1 = result.mergedDoc.children?.find(c => c.id === 'card-1');
        expect(card1?.fills).toBe('#green');

        // New card added
        const card2 = result.mergedDoc.children?.find(c => c.id === 'card-2');
        expect(card2).toBeDefined();
        expect(card2?.fills).toBe('#blue');

        // Metadata updated
        expect(result.newSyncState.lastMergeSessionId).toBe('sess-mixed');
        expect(result.newBaseline.nodes.some(n => n.nodeKey === 'card-2')).toBe(true);
    });

    it('success path: apply operations and verify new baseline', () => {
        const existing = makeSection([
            makeText('t1', 'old text', JSON.stringify([{ tagPath: ['content', 'body'], attribute: 'content' }])),
        ]);

        const baseline = buildBaseline(existing, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const incoming = makeSection([
            makeText('t1', 'new text', JSON.stringify([{ tagPath: ['content', 'body'], attribute: 'content' }])),
        ]);

        const currentFlat = flattenVendorDoc(existing);
        const incomingFlat = flattenVendorDoc(incoming);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const plannerInputs = buildPlannerInputs(
            matchResult.matches, baselineIndex, existing, incoming,
        );

        const plan = createMergePlan(plannerInputs, []);

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'sess-success',
            sectionSyncId: 'sync-1',
        });

        // New baseline should reflect applied state
        const t1Base = result.newBaseline.nodes.find(n => n.nodeKey === 't1');
        expect(t1Base?.properties.characters).toBe('new text');

        // Sync state reflects clean merge
        expect(result.newSyncState.unresolvedConflictCount).toBe(0);
    });

    it('failure-triggered rollback: snapshot restores full state', () => {
        const existing = makeSection([
            makeFrame('hero', {
                fills: '#original',
                width: 1200,
                pluginData: { 'data-jay-sid': 'sid-hero' },
            }),
            makeText('h1', 'Original Title'),
        ]);

        // Capture before mutation
        const snapshot = captureSnapshot(existing, '/test', 'sync-1');

        // Simulate a failed apply by just using the snapshot
        const serialized = serializeSnapshot(snapshot);

        // Verify budget fits
        const budget = checkBudget(snapshot);
        expect(budget.withinBudget).toBe(true);

        // Deserialize and verify full state recovery
        const restored = deserializeSnapshot(serialized)!;
        expect(restored.nodeTree).toEqual(existing);

        // Verify structure
        expect(restored.nodeTree.children).toHaveLength(2);
        expect(restored.nodeTree.children![0].id).toBe('hero');
        expect(restored.nodeTree.children![0].pluginData?.['data-jay-sid']).toBe('sid-hero');
        expect(restored.nodeTree.children![1].characters).toBe('Original Title');
    });

    it('rollback equivalence: rolled-back state equals original (structure + metadata)', () => {
        const syncState: SyncStateV1 = {
            schemaVersion: 1,
            pageUrl: '/test',
            sectionSyncId: 'sync-1',
            baselineImportHash: 'hash123',
            baselineImportedAt: '2026-01-01T00:00:00Z',
            unresolvedConflictCount: 0,
        };

        const baselineV1: SyncBaselineV1 = {
            schemaVersion: 1,
            pageUrl: '/test',
            nodes: [
                { nodeKey: 'n1', properties: { fills: '#red' } },
                { nodeKey: 'n2', properties: { characters: 'Hello' } },
            ],
        };

        const existing = makeSection([
            makeFrame('n1', { fills: '#red' }),
            makeText('n2', 'Hello'),
        ]);

        const snapshot = captureSnapshot(existing, '/test', 'sync-1', syncState, baselineV1);
        const serialized = serializeSnapshot(snapshot);
        const restored = deserializeSnapshot(serialized)!;

        // Structure equality
        expect(restored.nodeTree).toEqual(existing);

        // Metadata equality
        expect(restored.syncState).toEqual(syncState);
        expect(restored.baseline).toEqual(baselineV1);
    });
});

describe('Vendor Doc Flatten', () => {
    it('flattens a nested tree into FlatNode array', () => {
        const doc = makeSection([
            makeFrame('f1', {
                children: [
                    makeText('t1', 'nested text'),
                    makeFrame('f2'),
                ],
            }),
        ]);

        const flat = flattenVendorDoc(doc);

        expect(flat).toHaveLength(4);
        expect(flat[0].key).toBe('section-1');
        expect(flat[0].treeDepth).toBe(0);
        expect(flat[1].key).toBe('f1');
        expect(flat[1].treeDepth).toBe(1);
        expect(flat[2].key).toBe('t1');
        expect(flat[2].treeDepth).toBe(2);
        expect(flat[3].key).toBe('f2');
        expect(flat[3].treeDepth).toBe(2);
    });

    it('preserves pluginData in FlatNode', () => {
        const doc = makeSection([
            makeText('t1', 'text', JSON.stringify([{ tagPath: ['content', 'title'] }])),
        ]);

        const flat = flattenVendorDoc(doc);
        const t1 = flat.find(n => n.key === 't1');
        expect(t1?.pluginData?.['jay-layer-bindings']).toBeDefined();
    });
});
