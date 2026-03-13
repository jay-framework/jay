import { describe, it, expect } from 'vitest';
import type {
    ImportReportV2,
    MergePreviewResponse,
    MergeApplyResponse,
    SyncStateV1,
    ConflictItem,
    FigmaVendorDocument,
} from '@jay-framework/editor-protocol';
import { generateReport } from '../../../../lib/vendors/figma/iterative/sync-report';
import { createMergePlan } from '../../../../lib/vendors/figma/iterative/merge-planner';
import type { PlannerInput, StructuralChange } from '../../../../lib/vendors/figma/iterative/merge-planner';
import { applyMergePlan, buildBaseline } from '../../../../lib/vendors/figma/iterative/merge-applier';

// ─── Helpers ─────────────────────────────────────────────────────

function makeDoc(children: FigmaVendorDocument[] = []): FigmaVendorDocument {
    return { id: 'section-1', name: 'TestPage', type: 'SECTION', pluginData: {}, children };
}

function makeNode(id: string, props: Record<string, unknown> = {}): FigmaVendorDocument {
    return { id, name: `Node-${id}`, type: 'FRAME', pluginData: {}, ...props };
}

function makePlannerInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
    return {
        nodeKey: 'n1',
        nodeName: 'Node-n1',
        baseline: { fills: '#red' },
        designer: { fills: '#red' },
        incoming: { fills: '#blue' },
        confidence: 'high',
        ...overrides,
    };
}

// ─── ImportReportV2 Schema Contract ──────────────────────────────

describe('ImportReportV2 Schema Contract', () => {
    it('has schemaVersion 2', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-1');

        expect(report.schemaVersion).toBe(2);
    });

    it('has required top-level fields', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-contract');

        expect(report).toHaveProperty('schemaVersion');
        expect(report).toHaveProperty('sessionId');
        expect(report).toHaveProperty('timestamp');
        expect(report).toHaveProperty('summary');
        expect(report).toHaveProperty('applied');
        expect(report).toHaveProperty('preservedOverrides');
        expect(report).toHaveProperty('conflicts');
        expect(report).toHaveProperty('warnings');
        expect(report).toHaveProperty('optimizations');
        expect(report).toHaveProperty('metrics');
    });

    it('summary has required numeric fields', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-1');

        const { summary } = report;
        expect(typeof summary.added).toBe('number');
        expect(typeof summary.updated).toBe('number');
        expect(typeof summary.removed).toBe('number');
        expect(typeof summary.preserved).toBe('number');
        expect(typeof summary.conflicted).toBe('number');
        expect(typeof summary.skipped).toBe('number');
    });

    it('metrics has required fields', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-1');

        expect(typeof report.metrics.autoMergeRatio).toBe('number');
        expect(report.metrics.autoMergeRatio).toBeGreaterThanOrEqual(0);
        expect(report.metrics.autoMergeRatio).toBeLessThanOrEqual(1);
        expect(typeof report.metrics.conflictCount).toBe('number');
        expect(report.metrics.matchConfidenceDistribution).toHaveProperty('high');
        expect(report.metrics.matchConfidenceDistribution).toHaveProperty('medium');
        expect(report.metrics.matchConfidenceDistribution).toHaveProperty('low');
    });

    it('applied items have nodeKey, property, rationale', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-1');

        for (const item of report.applied) {
            expect(typeof item.nodeKey).toBe('string');
            expect(typeof item.property).toBe('string');
            expect(typeof item.rationale).toBe('string');
        }
    });

    it('preservedOverrides items have nodeKey, property, reason', () => {
        const plan = createMergePlan([
            makePlannerInput({
                baseline: { fills: '#red' },
                designer: { fills: '#green' },
                incoming: { fills: '#red' },
            }),
        ], []);
        const report = generateReport(plan, 'sess-1');

        expect(report.preservedOverrides.length).toBeGreaterThan(0);
        for (const item of report.preservedOverrides) {
            expect(typeof item.nodeKey).toBe('string');
            expect(typeof item.property).toBe('string');
            expect(typeof item.reason).toBe('string');
        }
    });

    it('conflicts have required ConflictItem fields', () => {
        const plan = createMergePlan([
            makePlannerInput({
                baseline: { fills: '#red' },
                designer: { fills: '#green' },
                incoming: { fills: '#blue' },
            }),
        ], []);
        const report = generateReport(plan, 'sess-1');

        expect(report.conflicts.length).toBeGreaterThan(0);
        for (const c of report.conflicts) {
            expect(typeof c.nodeKey).toBe('string');
            expect(typeof c.nodeName).toBe('string');
            expect(typeof c.property).toBe('string');
            expect(['visual', 'layout', 'semantic']).toContain(c.propertyClass);
            expect(['info', 'warning', 'action_required']).toContain(c.severity);
            expect(typeof c.reason).toBe('string');
            expect(Array.isArray(c.suggestedActions)).toBe(true);
            expect(c.suggestedActions.length).toBeGreaterThan(0);
        }
    });

    it('warnings have nodeKey, message, confidence', () => {
        const plan = createMergePlan([], [
            { type: 'remove', nodeKey: 'n-low', nodeName: 'LowNode', confidence: 'low', hasDesignerOverride: false },
        ]);
        const report = generateReport(plan, 'sess-1');

        expect(report.warnings.length).toBeGreaterThan(0);
        for (const w of report.warnings) {
            expect(typeof w.nodeKey).toBe('string');
            expect(typeof w.message).toBe('string');
            expect(['high', 'medium', 'low']).toContain(w.confidence);
        }
    });

    it('sessionId propagated correctly', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'my-session-42');

        expect(report.sessionId).toBe('my-session-42');
    });

    it('timestamp is valid ISO 8601', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'sess-1');

        const parsed = new Date(report.timestamp);
        expect(parsed.toISOString()).toBe(report.timestamp);
    });
});

// ─── MergePreviewResponse Schema Contract ────────────────────────

describe('MergePreviewResponse Schema Contract', () => {
    it('successful preview has type, success, report', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'preview-1');

        const response: MergePreviewResponse = {
            type: 'mergePreview',
            success: true,
            report,
        };

        expect(response.type).toBe('mergePreview');
        expect(response.success).toBe(true);
        expect(response.report).toBeDefined();
        expect(response.report!.schemaVersion).toBe(2);
    });

    it('failed preview has type, success=false, error', () => {
        const response: MergePreviewResponse = {
            type: 'mergePreview',
            success: false,
            error: 'No existing section data provided',
        };

        expect(response.type).toBe('mergePreview');
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(response.report).toBeUndefined();
    });
});

// ─── MergeApplyResponse Schema Contract ──────────────────────────

describe('MergeApplyResponse Schema Contract', () => {
    it('successful apply has vendorDoc, report, syncState', () => {
        const existing = makeDoc([makeNode('n1', { fills: '#red' })]);
        const incoming = makeDoc([makeNode('n1', { fills: '#blue' })]);
        const plan = createMergePlan(
            [makePlannerInput()],
            [],
        );

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'apply-1',
            sectionSyncId: 'sync-1',
        });

        const response: MergeApplyResponse<FigmaVendorDocument> = {
            type: 'mergeApply',
            success: true,
            vendorDoc: result.mergedDoc,
            report: result.report,
            syncState: result.newSyncState,
        };

        expect(response.type).toBe('mergeApply');
        expect(response.success).toBe(true);
        expect(response.vendorDoc).toBeDefined();
        expect(response.vendorDoc!.id).toBe('section-1');
        expect(response.report).toBeDefined();
        expect(response.report!.schemaVersion).toBe(2);
        expect(response.syncState).toBeDefined();
        expect(response.syncState!.schemaVersion).toBe(1);
    });

    it('SyncStateV1 has required fields', () => {
        const existing = makeDoc([makeNode('n1')]);
        const incoming = makeDoc([makeNode('n1', { fills: '#new' })]);
        const plan = createMergePlan([makePlannerInput()], []);

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/products',
            sessionId: 'sess-sync',
            sectionSyncId: 'sync-products',
        });

        const state = result.newSyncState;
        expect(state.schemaVersion).toBe(1);
        expect(state.pageUrl).toBe('/products');
        expect(state.sectionSyncId).toBe('sync-products');
        expect(typeof state.baselineImportHash).toBe('string');
        expect(state.baselineImportHash.length).toBeGreaterThan(0);
        expect(typeof state.baselineImportedAt).toBe('string');
        expect(typeof state.unresolvedConflictCount).toBe('number');
    });

    it('failed apply has error, no vendorDoc', () => {
        const response: MergeApplyResponse<FigmaVendorDocument> = {
            type: 'mergeApply',
            success: false,
            error: 'Apply operation failed: section not found',
        };

        expect(response.type).toBe('mergeApply');
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(response.vendorDoc).toBeUndefined();
        expect(response.report).toBeUndefined();
        expect(response.syncState).toBeUndefined();
    });
});

// ─── Payload Serialization Roundtrip ─────────────────────────────

describe('Payload serialization roundtrip', () => {
    it('ImportReportV2 survives JSON roundtrip', () => {
        const plan = createMergePlan(
            [
                makePlannerInput(),
                makePlannerInput({
                    nodeKey: 'n2',
                    nodeName: 'Node-n2',
                    baseline: { characters: 'old' },
                    designer: { characters: 'designer' },
                    incoming: { characters: 'code' },
                }),
            ],
            [
                { type: 'add', nodeKey: 'n3', nodeName: 'NewNode', confidence: 'high', hasDesignerOverride: false },
            ],
        );
        const report = generateReport(plan, 'roundtrip-sess');

        const serialized = JSON.stringify(report);
        const deserialized: ImportReportV2 = JSON.parse(serialized);

        expect(deserialized.schemaVersion).toBe(report.schemaVersion);
        expect(deserialized.sessionId).toBe(report.sessionId);
        expect(deserialized.summary).toEqual(report.summary);
        expect(deserialized.applied).toEqual(report.applied);
        expect(deserialized.preservedOverrides).toEqual(report.preservedOverrides);
        expect(deserialized.conflicts).toEqual(report.conflicts);
        expect(deserialized.warnings).toEqual(report.warnings);
        expect(deserialized.optimizations).toEqual(report.optimizations);
        expect(deserialized.metrics).toEqual(report.metrics);
    });

    it('SyncStateV1 survives JSON roundtrip', () => {
        const existing = makeDoc([makeNode('n1')]);
        const incoming = makeDoc([makeNode('n1', { fills: '#new' })]);
        const plan = createMergePlan([makePlannerInput()], []);

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'sess-rt',
            sectionSyncId: 'sync-1',
        });

        const serialized = JSON.stringify(result.newSyncState);
        const deserialized: SyncStateV1 = JSON.parse(serialized);

        expect(deserialized.schemaVersion).toBe(result.newSyncState.schemaVersion);
        expect(deserialized.pageUrl).toBe(result.newSyncState.pageUrl);
        expect(deserialized.sectionSyncId).toBe(result.newSyncState.sectionSyncId);
        expect(deserialized.baselineImportHash).toBe(result.newSyncState.baselineImportHash);
        expect(deserialized.unresolvedConflictCount).toBe(result.newSyncState.unresolvedConflictCount);
    });

    it('MergePreviewResponse survives protocol boundary (JSON roundtrip)', () => {
        const plan = createMergePlan([makePlannerInput()], []);
        const report = generateReport(plan, 'proto-sess');

        const response: MergePreviewResponse = {
            type: 'mergePreview',
            success: true,
            report,
        };

        const serialized = JSON.stringify(response);
        const deserialized: MergePreviewResponse = JSON.parse(serialized);

        expect(deserialized.type).toBe('mergePreview');
        expect(deserialized.success).toBe(true);
        expect(deserialized.report!.schemaVersion).toBe(2);
        expect(deserialized.report!.sessionId).toBe('proto-sess');
    });
});

// ─── Backward Compatibility ──────────────────────────────────────

describe('Backward compatibility', () => {
    it('merge-applier PLUGIN_DATA_PROPERTIES includes legacy jay-import-report key', () => {
        const existing = makeDoc([
            makeNode('n1', {
                pluginData: { 'jay-import-report': '{"old":"report"}' },
            }),
        ]);
        const incoming = makeDoc([
            makeNode('n1', {
                pluginData: { 'jay-import-report': '{"new":"report"}' },
            }),
        ]);
        const plan = createMergePlan([
            {
                nodeKey: 'n1',
                nodeName: 'Node-n1',
                baseline: { 'jay-import-report': '{"old":"report"}' },
                designer: { 'jay-import-report': '{"old":"report"}' },
                incoming: { 'jay-import-report': '{"new":"report"}' },
                confidence: 'high',
            },
        ], []);

        const result = applyMergePlan({
            existingDoc: existing,
            incomingDoc: incoming,
            plan,
            pageUrl: '/test',
            sessionId: 'compat-1',
            sectionSyncId: 'sync-1',
        });

        const n1 = result.mergedDoc.children?.find(c => c.id === 'n1');
        expect(n1?.pluginData?.['jay-import-report']).toBe('{"new":"report"}');
    });
});
