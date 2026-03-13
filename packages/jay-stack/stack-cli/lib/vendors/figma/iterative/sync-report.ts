import type {
    ImportReportV2,
    MergeConfidence,
    MergeOperation,
    StructuralOperation,
    ConflictItem,
} from '@jay-framework/editor-protocol';
import type { MergePlan } from './merge-planner';

export function generateReport(plan: MergePlan, sessionId: string): ImportReportV2 {
    const applied: ImportReportV2['applied'] = [];
    const preservedOverrides: ImportReportV2['preservedOverrides'] = [];
    const warnings: ImportReportV2['warnings'] = [];
    const optimizations: ImportReportV2['optimizations'] = [];

    let added = 0, updated = 0, removed = 0, preserved = 0, conflicted = 0, skipped = 0;
    const confidenceDist: Record<MergeConfidence, number> = { high: 0, medium: 0, low: 0 };

    for (const op of plan.propertyOperations) {
        confidenceDist[op.confidence]++;

        switch (op.decision) {
            case 'applyIncoming':
                updated++;
                applied.push({ nodeKey: op.nodeKey, property: op.property, rationale: op.rationale });
                break;
            case 'preserveDesigner':
                preserved++;
                preservedOverrides.push({ nodeKey: op.nodeKey, property: op.property, reason: op.rationale });
                break;
            case 'needsDecision':
                conflicted++;
                break;
            case 'skip':
                skipped++;
                break;
        }
    }

    for (const op of plan.structuralOperations) {
        confidenceDist[op.confidence]++;

        switch (op.type) {
            case 'add':
                if (op.decision === 'applyIncoming') added++;
                break;
            case 'remove':
                if (op.decision === 'applyIncoming') removed++;
                else if (op.decision === 'needsDecision') conflicted++;
                break;
            case 'reorder':
                if (op.decision === 'applyIncoming') updated++;
                else if (op.decision === 'needsDecision') conflicted++;
                break;
        }

        if (op.confidence === 'low' || op.confidence === 'medium') {
            warnings.push({
                nodeKey: op.nodeKey,
                message: op.rationale,
                confidence: op.confidence,
            });
        }
    }

    const totalDecisions = applied.length + preserved + conflicted + skipped;
    const autoMergeRatio = totalDecisions > 0
        ? (applied.length + preserved + skipped) / totalDecisions
        : 1;

    return {
        schemaVersion: 2,
        sessionId,
        timestamp: new Date().toISOString(),
        summary: { added, updated, removed, preserved, conflicted, skipped },
        applied,
        preservedOverrides,
        conflicts: plan.conflicts,
        warnings,
        optimizations,
        metrics: {
            autoMergeRatio,
            conflictCount: conflicted,
            matchConfidenceDistribution: confidenceDist,
        },
    };
}
