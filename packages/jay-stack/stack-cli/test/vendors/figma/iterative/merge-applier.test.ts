import { describe, it, expect } from 'vitest';
import { applyMergePlan, buildBaseline } from '../../../../lib/vendors/figma/iterative/merge-applier';
import type { ApplyInput } from '../../../../lib/vendors/figma/iterative/merge-applier';
import { createMergePlan } from '../../../../lib/vendors/figma/iterative/merge-planner';
import type { PlannerInput, StructuralChange } from '../../../../lib/vendors/figma/iterative/merge-planner';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol/vendors/figma';

function makeDoc(overrides: Partial<FigmaVendorDocument> = {}): FigmaVendorDocument {
    return {
        id: 'section-1',
        name: 'TestSection',
        type: 'SECTION',
        children: [],
        pluginData: {},
        ...overrides,
    };
}

function makeNode(id: string, props: Record<string, unknown> = {}): FigmaVendorDocument {
    return {
        id,
        name: `Node-${id}`,
        type: 'FRAME',
        pluginData: {},
        ...props,
    };
}

function makeApplyInput(overrides: Partial<ApplyInput> = {}): ApplyInput {
    return {
        existingDoc: makeDoc(),
        incomingDoc: makeDoc(),
        plan: { propertyOperations: [], structuralOperations: [], conflicts: [] },
        pageUrl: '/test',
        sessionId: 'sess-1',
        sectionSyncId: 'sync-1',
        ...overrides,
    };
}

describe('Merge Applier — Property Operations', () => {
    it('applies applyIncoming operations to node properties', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1', { fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }] })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
                designer: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
                incoming: { fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }] },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({ existingDoc: existing, incomingDoc: incoming, plan }));

        const n1 = result.mergedDoc.children?.find((c) => c.id === 'n1');
        expect(n1?.fills).toEqual([{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }]);
        expect(result.appliedOps).toHaveLength(1);
    });

    it('preserves designer values for preserveDesigner operations', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }] })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1', { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
                designer: { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }] },
                incoming: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({ existingDoc: existing, incomingDoc: incoming, plan }));

        const n1 = result.mergedDoc.children?.find((c) => c.id === 'n1');
        expect(n1?.fills).toEqual([{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }]);
        expect(result.skippedOps).toHaveLength(1);
    });

    it('resolves conflicts with applyIncoming resolution', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { characters: 'designer text' })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1', { characters: 'code text' })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { characters: 'original' },
                designer: { characters: 'designer text' },
                incoming: { characters: 'code text' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            conflictResolutions: [{ nodeKey: 'n1', property: 'characters', action: 'applyIncoming' }],
        }));

        const n1 = result.mergedDoc.children?.find((c) => c.id === 'n1');
        expect(n1?.characters).toBe('code text');
        expect(result.unresolvedConflicts).toHaveLength(0);
    });

    it('resolves conflicts with keepMine resolution', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { characters: 'designer text' })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1', { characters: 'code text' })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { characters: 'original' },
                designer: { characters: 'designer text' },
                incoming: { characters: 'code text' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            conflictResolutions: [{ nodeKey: 'n1', property: 'characters', action: 'keepMine' }],
        }));

        const n1 = result.mergedDoc.children?.find((c) => c.id === 'n1');
        expect(n1?.characters).toBe('designer text');
        expect(result.unresolvedConflicts).toHaveLength(0);
    });

    it('resolves conflicts with rebind resolution', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { pluginData: { 'jay-layer-bindings': 'old-binding' } })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1')],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { 'jay-layer-bindings': 'original' },
                designer: { 'jay-layer-bindings': 'old-binding' },
                incoming: { 'jay-layer-bindings': 'new-binding' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            conflictResolutions: [{
                nodeKey: 'n1',
                property: 'jay-layer-bindings',
                action: 'rebind',
                rebindTarget: 'rebound-target',
            }],
        }));

        const n1 = result.mergedDoc.children?.find((c) => c.id === 'n1');
        expect(n1?.pluginData?.['jay-layer-bindings']).toBe('rebound-target');
    });

    it('tracks unresolved conflicts when no resolution provided', () => {
        const existing = makeDoc({ children: [makeNode('n1', { characters: 'designer' })] });
        const incoming = makeDoc({ children: [makeNode('n1', { characters: 'code' })] });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { characters: 'original' },
                designer: { characters: 'designer' },
                incoming: { characters: 'code' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.unresolvedConflicts).toHaveLength(1);
        expect(result.unresolvedConflicts[0].property).toBe('characters');
    });

    it('skips operations for nodes not found in merged tree', () => {
        const existing = makeDoc({ children: [] });
        const incoming = makeDoc({ children: [makeNode('n-missing')] });
        const plan = createMergePlan(
            [{
                nodeKey: 'n-missing',
                nodeName: 'Ghost',
                baseline: { fill: 'a' },
                designer: { fill: 'a' },
                incoming: { fill: 'b' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.skippedOps).toHaveLength(1);
    });
});

describe('Merge Applier — Structural Operations', () => {
    it('adds new nodes from incoming doc', () => {
        const existing = makeDoc({ children: [makeNode('n1')] });
        const incoming = makeDoc({ children: [makeNode('n1'), makeNode('n-new', { characters: 'new' })] });
        const plan = createMergePlan(
            [],
            [{ type: 'add', nodeKey: 'n-new', nodeName: 'NewNode', confidence: 'high', hasDesignerOverride: false }],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        const added = result.mergedDoc.children?.find((c) => c.id === 'n-new');
        expect(added).toBeDefined();
        expect(added?.characters).toBe('new');
        expect(result.appliedStructuralOps).toHaveLength(1);
    });

    it('removes nodes with applyIncoming decision', () => {
        const existing = makeDoc({ children: [makeNode('n1'), makeNode('n2')] });
        const incoming = makeDoc({ children: [makeNode('n1')] });
        const plan = createMergePlan(
            [],
            [{
                type: 'remove', nodeKey: 'n2', nodeName: 'ToRemove',
                confidence: 'high', hasDesignerOverride: false,
            }],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.mergedDoc.children?.find((c) => c.id === 'n2')).toBeUndefined();
        expect(result.appliedStructuralOps).toHaveLength(1);
    });

    it('blocks remove with needsDecision when no resolution', () => {
        const existing = makeDoc({ children: [makeNode('n1')] });
        const incoming = makeDoc({ children: [] });
        const plan = createMergePlan(
            [],
            [{
                type: 'remove', nodeKey: 'n1', nodeName: 'Card',
                confidence: 'high', hasDesignerOverride: true,
            }],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.mergedDoc.children?.find((c) => c.id === 'n1')).toBeDefined();
        expect(result.unresolvedConflicts).toHaveLength(1);
    });

    it('applies structural conflict resolution (applyIncoming → remove)', () => {
        const existing = makeDoc({ children: [makeNode('n1')] });
        const incoming = makeDoc({ children: [] });
        const plan = createMergePlan(
            [],
            [{
                type: 'remove', nodeKey: 'n1', nodeName: 'Card',
                confidence: 'high', hasDesignerOverride: true,
            }],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            conflictResolutions: [{ nodeKey: 'n1', property: '_structure', action: 'applyIncoming' }],
        }));

        expect(result.mergedDoc.children?.find((c) => c.id === 'n1')).toBeUndefined();
        expect(result.appliedStructuralOps).toHaveLength(1);
    });
});

describe('Merge Applier — Purity and Determinism', () => {
    it('does not mutate the input existingDoc', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { characters: 'original' })],
        });
        const existingCopy = JSON.parse(JSON.stringify(existing));
        const incoming = makeDoc({
            children: [makeNode('n1', { characters: 'new' })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1', nodeName: 'N1',
                baseline: { characters: 'original' },
                designer: { characters: 'original' },
                incoming: { characters: 'new' },
                confidence: 'high',
            }],
            [],
        );

        applyMergePlan(makeApplyInput({ existingDoc: existing, incomingDoc: incoming, plan }));

        expect(existing).toEqual(existingCopy);
    });

    it('produces deterministic output across 3 runs', () => {
        const existing = makeDoc({
            children: [
                makeNode('n1', { fills: '#red', characters: 'text', width: 100 }),
                makeNode('n2', { fills: '#blue', characters: 'other' }),
            ],
        });
        const incoming = makeDoc({
            children: [
                makeNode('n1', { fills: '#green', characters: 'updated', width: 200 }),
                makeNode('n2', { fills: '#yellow', characters: 'changed' }),
            ],
        });
        const plan = createMergePlan(
            [
                {
                    nodeKey: 'n1', nodeName: 'N1',
                    baseline: { fills: '#red', characters: 'text', width: 100 },
                    designer: { fills: '#red', characters: 'text', width: 100 },
                    incoming: { fills: '#green', characters: 'updated', width: 200 },
                    confidence: 'high',
                },
                {
                    nodeKey: 'n2', nodeName: 'N2',
                    baseline: { fills: '#blue', characters: 'other' },
                    designer: { fills: '#blue', characters: 'other' },
                    incoming: { fills: '#yellow', characters: 'changed' },
                    confidence: 'high',
                },
            ],
            [],
        );

        const input = makeApplyInput({ existingDoc: existing, incomingDoc: incoming, plan });

        const results = [
            applyMergePlan(input),
            applyMergePlan(input),
            applyMergePlan(input),
        ];

        const docs = results.map((r) => JSON.stringify(r.mergedDoc));
        expect(docs[0]).toBe(docs[1]);
        expect(docs[1]).toBe(docs[2]);
    });

    it('produces correct execution order: visual → layout → semantic', () => {
        const existing = makeDoc({
            children: [makeNode('n1', { fills: '#old', width: 100, characters: 'old' })],
        });
        const incoming = makeDoc({
            children: [makeNode('n1', { fills: '#new', width: 200, characters: 'new' })],
        });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1', nodeName: 'N1',
                baseline: { fills: '#old', width: 100, characters: 'old' },
                designer: { fills: '#old', width: 100, characters: 'old' },
                incoming: { fills: '#new', width: 200, characters: 'new' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.appliedOps.length).toBeGreaterThanOrEqual(3);
        const fills = result.appliedOps.findIndex((o) => o.property === 'fills');
        const width = result.appliedOps.findIndex((o) => o.property === 'width');
        const chars = result.appliedOps.findIndex((o) => o.property === 'characters');
        expect(fills).toBeLessThan(width);
        expect(width).toBeLessThan(chars);
    });
});

describe('Merge Applier — Output Artifacts', () => {
    it('generates new baseline from merged state', () => {
        const existing = makeDoc({ children: [makeNode('n1', { characters: 'old' })] });
        const incoming = makeDoc({ children: [makeNode('n1', { characters: 'new' })] });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1', nodeName: 'N1',
                baseline: { characters: 'old' },
                designer: { characters: 'old' },
                incoming: { characters: 'new' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.newBaseline.schemaVersion).toBe(1);
        expect(result.newBaseline.pageUrl).toBe('/test');
        const n1Snap = result.newBaseline.nodes.find((n) => n.nodeKey === 'n1');
        expect(n1Snap?.properties.characters).toBe('new');
    });

    it('generates new sync state with correct unresolved count', () => {
        const existing = makeDoc({ children: [makeNode('n1', { characters: 'designer' })] });
        const incoming = makeDoc({ children: [makeNode('n1', { characters: 'code' })] });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1', nodeName: 'N1',
                baseline: { characters: 'original' },
                designer: { characters: 'designer' },
                incoming: { characters: 'code' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.newSyncState.schemaVersion).toBe(1);
        expect(result.newSyncState.sectionSyncId).toBe('sync-1');
        expect(result.newSyncState.unresolvedConflictCount).toBe(1);
        expect(result.newSyncState.lastMergeSessionId).toBe('sess-1');
    });

    it('generates ImportReportV2 with correct schema', () => {
        const existing = makeDoc({ children: [makeNode('n1')] });
        const incoming = makeDoc({ children: [makeNode('n1', { characters: 'new' })] });
        const plan = createMergePlan(
            [{
                nodeKey: 'n1', nodeName: 'N1',
                baseline: { characters: 'old' },
                designer: { characters: 'old' },
                incoming: { characters: 'new' },
                confidence: 'high',
            }],
            [],
        );

        const result = applyMergePlan(makeApplyInput({
            existingDoc: existing, incomingDoc: incoming, plan,
        }));

        expect(result.report.schemaVersion).toBe(2);
        expect(result.report.sessionId).toBe('sess-1');
        expect(result.report.summary.updated).toBeGreaterThanOrEqual(1);
    });
});

describe('buildBaseline', () => {
    it('captures all node properties except children', () => {
        const doc = makeDoc({
            children: [
                makeNode('n1', { fills: '#red', width: 100 }),
                makeNode('n2', { characters: 'text' }),
            ],
        });

        const baseline = buildBaseline(doc, '/test');

        expect(baseline.schemaVersion).toBe(1);
        expect(baseline.pageUrl).toBe('/test');
        expect(baseline.nodes).toHaveLength(3);

        const n1 = baseline.nodes.find((n) => n.nodeKey === 'n1');
        expect(n1?.properties.fills).toBe('#red');
        expect(n1?.properties.width).toBe(100);
        expect(n1?.properties).not.toHaveProperty('children');
    });
});
