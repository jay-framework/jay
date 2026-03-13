import { describe, it, expect } from 'vitest';
import {
    planPropertyMerges,
    planStructuralChanges,
    createMergePlan,
} from '../../../../lib/vendors/figma/iterative/merge-planner';
import type {
    PlannerInput,
    StructuralChange,
} from '../../../../lib/vendors/figma/iterative/merge-planner';
import {
    classifyProperty,
    getPropertyPolicy,
} from '../../../../lib/vendors/figma/iterative/policy';
import { generateReport } from '../../../../lib/vendors/figma/iterative/sync-report';

describe('Property Policy Matrix', () => {
    it('classifies visual properties correctly', () => {
        expect(classifyProperty('fill')).toBe('visual');
        expect(classifyProperty('opacity')).toBe('visual');
        expect(classifyProperty('backgroundColor')).toBe('visual');
    });

    it('classifies layout properties correctly', () => {
        expect(classifyProperty('width')).toBe('layout');
        expect(classifyProperty('padding')).toBe('layout');
        expect(classifyProperty('layoutMode')).toBe('layout');
    });

    it('classifies semantic properties correctly', () => {
        expect(classifyProperty('characters')).toBe('semantic');
        expect(classifyProperty('jay-layer-bindings')).toBe('semantic');
        expect(classifyProperty('ref')).toBe('semantic');
    });

    it('visual default policy: preserve designer', () => {
        const policy = getPropertyPolicy('fill');
        expect(policy.defaultBehavior).toBe('preserveDesigner');
    });

    it('semantic default policy: apply incoming', () => {
        const policy = getPropertyPolicy('characters');
        expect(policy.defaultBehavior).toBe('applyIncoming');
    });

    it('layout default policy: apply incoming', () => {
        const policy = getPropertyPolicy('width');
        expect(policy.defaultBehavior).toBe('applyIncoming');
    });
});

describe('3-Way Merge Planner — B/D/N Permutations', () => {
    function makeInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
        return {
            nodeKey: 'node-1',
            nodeName: 'TestNode',
            baseline: {},
            designer: {},
            incoming: {},
            confidence: 'high',
            ...overrides,
        };
    }

    it('B==D, B!=N → applyIncoming (code changed, designer did not)', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#ff0000' },
            incoming: { fill: '#00ff00' },
        });
        const { operations } = planPropertyMerges(input);
        const fillOp = operations.find((o) => o.property === 'fill');
        expect(fillOp?.decision).toBe('applyIncoming');
    });

    it('B!=D, B==N → preserveDesigner (designer changed, code did not)', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#0000ff' },
            incoming: { fill: '#ff0000' },
        });
        const { operations } = planPropertyMerges(input);
        const fillOp = operations.find((o) => o.property === 'fill');
        expect(fillOp?.decision).toBe('preserveDesigner');
    });

    it('B!=D, B!=N, D!=N → needsDecision (both changed differently)', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#0000ff' },
            incoming: { fill: '#00ff00' },
        });
        const { operations, conflicts } = planPropertyMerges(input);
        const fillOp = operations.find((o) => o.property === 'fill');
        expect(fillOp?.decision).toBe('needsDecision');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].severity).toBe('action_required');
    });

    it('B==D, B==N → skip (nothing changed)', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#ff0000' },
            incoming: { fill: '#ff0000' },
        });
        const { operations } = planPropertyMerges(input);
        const fillOp = operations.find((o) => o.property === 'fill');
        expect(fillOp?.decision).toBe('skip');
    });

    it('B!=D, B!=N, D==N → skip (both changed to same value)', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#00ff00' },
            incoming: { fill: '#00ff00' },
        });
        const { operations } = planPropertyMerges(input);
        const fillOp = operations.find((o) => o.property === 'fill');
        expect(fillOp?.decision).toBe('skip');
    });

    it('planner is pure — does not mutate input', () => {
        const input = makeInput({
            baseline: { fill: '#ff0000' },
            designer: { fill: '#0000ff' },
            incoming: { fill: '#00ff00' },
        });
        const baselineCopy = JSON.parse(JSON.stringify(input.baseline));
        const designerCopy = JSON.parse(JSON.stringify(input.designer));
        const incomingCopy = JSON.parse(JSON.stringify(input.incoming));

        planPropertyMerges(input);

        expect(input.baseline).toEqual(baselineCopy);
        expect(input.designer).toEqual(designerCopy);
        expect(input.incoming).toEqual(incomingCopy);
    });

    it('conflict on semantic property includes rebind action', () => {
        const input = makeInput({
            baseline: { characters: 'Hello' },
            designer: { characters: 'Hi' },
            incoming: { characters: 'Hey' },
        });
        const { conflicts } = planPropertyMerges(input);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].suggestedActions).toContain('rebind');
    });
});

describe('Structural Operations — Confidence Gating', () => {
    it('remove with designer override → action_required', () => {
        const changes: StructuralChange[] = [
            {
                type: 'remove',
                nodeKey: 'n1',
                nodeName: 'Card',
                confidence: 'high',
                hasDesignerOverride: true,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('needsDecision');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].severity).toBe('action_required');
    });

    it('remove without override, high confidence → auto-remove', () => {
        const changes: StructuralChange[] = [
            {
                type: 'remove',
                nodeKey: 'n1',
                nodeName: 'Card',
                confidence: 'high',
                hasDesignerOverride: false,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('applyIncoming');
        expect(conflicts).toHaveLength(0);
    });

    it('remove without override, low confidence → action_required (LOCKED POLICY)', () => {
        const changes: StructuralChange[] = [
            {
                type: 'remove',
                nodeKey: 'n1',
                nodeName: 'Card',
                confidence: 'low',
                hasDesignerOverride: false,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('needsDecision');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].severity).toBe('action_required');
    });

    it('add → always auto-apply', () => {
        const changes: StructuralChange[] = [
            {
                type: 'add',
                nodeKey: 'n-new',
                nodeName: 'NewCard',
                confidence: 'medium',
                hasDesignerOverride: false,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('applyIncoming');
        expect(conflicts).toHaveLength(0);
    });

    it('reorder with low confidence → action_required (LOCKED POLICY)', () => {
        const changes: StructuralChange[] = [
            {
                type: 'reorder',
                nodeKey: 'n1',
                nodeName: 'Item',
                confidence: 'low',
                hasDesignerOverride: false,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('needsDecision');
        expect(conflicts).toHaveLength(1);
    });

    it('reorder with high confidence → auto-apply', () => {
        const changes: StructuralChange[] = [
            {
                type: 'reorder',
                nodeKey: 'n1',
                nodeName: 'Item',
                confidence: 'high',
                hasDesignerOverride: false,
            },
        ];
        const { operations, conflicts } = planStructuralChanges(changes);
        expect(operations[0].decision).toBe('applyIncoming');
        expect(conflicts).toHaveLength(0);
    });
});

describe('Sync Report Generation', () => {
    it('generates report with correct section counts', () => {
        const plan = createMergePlan(
            [
                {
                    nodeKey: 'n1',
                    nodeName: 'TestNode',
                    baseline: { fill: '#ff0000', characters: 'old' },
                    designer: { fill: '#ff0000', characters: 'old' },
                    incoming: { fill: '#00ff00', characters: 'new' },
                    confidence: 'high',
                },
            ],
            [
                {
                    type: 'add',
                    nodeKey: 'n-new',
                    nodeName: 'NewNode',
                    confidence: 'high',
                    hasDesignerOverride: false,
                },
            ],
        );

        const report = generateReport(plan, 'test-session-1');

        expect(report.schemaVersion).toBe(2);
        expect(report.sessionId).toBe('test-session-1');
        expect(report.summary.updated).toBe(2);
        expect(report.summary.added).toBe(1);
        expect(report.applied.length).toBe(2);
        expect(report.conflicts).toHaveLength(0);
        expect(report.metrics.autoMergeRatio).toBe(1);
    });

    it('reports conflicts with correct count', () => {
        const plan = createMergePlan(
            [
                {
                    nodeKey: 'n1',
                    nodeName: 'TestNode',
                    baseline: { fill: '#ff0000' },
                    designer: { fill: '#0000ff' },
                    incoming: { fill: '#00ff00' },
                    confidence: 'high',
                },
            ],
            [],
        );

        const report = generateReport(plan, 'test-session-2');
        expect(report.summary.conflicted).toBe(1);
        expect(report.conflicts).toHaveLength(1);
        expect(report.metrics.conflictCount).toBe(1);
        expect(report.metrics.autoMergeRatio).toBeLessThan(1);
    });
});
