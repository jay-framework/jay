import type {
    MergeConfidence,
    MergeDecision,
    ConflictSeverity,
    ConflictAction,
    PropertyClass,
    MergeOperation,
    StructuralOperation,
    ConflictItem,
} from '@jay-framework/editor-protocol';
import { classifyProperty, getPropertyPolicy } from './policy';

// ─── Planner Input ───────────────────────────────────────────────

export interface PropertySnapshot {
    [propertyName: string]: unknown;
}

export interface PlannerInput {
    nodeKey: string;
    nodeName: string;
    baseline: PropertySnapshot;
    designer: PropertySnapshot;
    incoming: PropertySnapshot;
    confidence: MergeConfidence;
}

export interface StructuralChange {
    type: 'add' | 'remove' | 'reorder';
    nodeKey: string;
    nodeName: string;
    confidence: MergeConfidence;
    hasDesignerOverride: boolean;
}

// ─── Planner Output ──────────────────────────────────────────────

export interface MergePlan {
    propertyOperations: MergeOperation[];
    structuralOperations: StructuralOperation[];
    conflicts: ConflictItem[];
}

// ─── 3-Way Merge Per Property ────────────────────────────────────

const NUMERIC_TOLERANCE = 0.5;

function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) < NUMERIC_TOLERANCE;
    }
    return JSON.stringify(a) === JSON.stringify(b);
}

function resolvePropertyDecision(
    propertyName: string,
    baseline: unknown,
    designer: unknown,
    incoming: unknown,
    confidence: MergeConfidence,
): { decision: MergeDecision; rationale: string; severity: ConflictSeverity } {
    const designerChanged = !valuesEqual(baseline, designer);
    const codeChanged = !valuesEqual(baseline, incoming);
    const bothSame = valuesEqual(designer, incoming);

    if (!designerChanged && !codeChanged) {
        return { decision: 'skip', rationale: 'no change', severity: 'info' };
    }

    if (bothSame) {
        return { decision: 'skip', rationale: 'both changed to same value', severity: 'info' };
    }

    if (codeChanged && !designerChanged) {
        return {
            decision: 'applyIncoming',
            rationale: 'code changed, designer unchanged',
            severity: 'info',
        };
    }

    if (designerChanged && !codeChanged) {
        return {
            decision: 'preserveDesigner',
            rationale: 'designer changed, code unchanged',
            severity: 'info',
        };
    }

    // Both changed differently — conflict
    const policy = getPropertyPolicy(propertyName);

    if (policy.propertyClass === 'semantic') {
        return {
            decision: 'needsDecision',
            rationale: 'both changed semantic property — requires resolution',
            severity: 'action_required',
        };
    }

    if (policy.propertyClass === 'visual') {
        return {
            decision: 'needsDecision',
            rationale: 'both changed visual property — designer override may be intentional',
            severity: 'action_required',
        };
    }

    // Layout: depends on confidence
    if (confidence === 'high') {
        return {
            decision: 'needsDecision',
            rationale:
                'both changed layout property — high confidence match but conflicting values',
            severity: 'warning',
        };
    }

    return {
        decision: 'needsDecision',
        rationale: 'both changed layout property — low confidence, requires decision',
        severity: 'action_required',
    };
}

// ─── Plan Properties ─────────────────────────────────────────────

export function planPropertyMerges(input: PlannerInput): {
    operations: MergeOperation[];
    conflicts: ConflictItem[];
} {
    const operations: MergeOperation[] = [];
    const conflicts: ConflictItem[] = [];

    const allProperties = new Set([
        ...Object.keys(input.baseline),
        ...Object.keys(input.designer),
        ...Object.keys(input.incoming),
    ]);

    for (const prop of allProperties) {
        const baseVal = input.baseline[prop];
        const desVal = input.designer[prop];
        const incVal = input.incoming[prop];

        // If a property exists only on the Figma (designer) side but not in the
        // incoming code doc, the code has no opinion about it. Auto-preserve the
        // designer value without conflict (e.g., parentId, absoluteRenderBounds).
        if (!(prop in input.incoming) && prop in input.designer) {
            operations.push({
                nodeKey: input.nodeKey,
                property: prop,
                propertyClass: classifyProperty(prop),
                decision: 'preserveDesigner',
                confidence: input.confidence,
                rationale: 'property not set by code — preserving designer value',
                baselineValue: baseVal,
                designerValue: desVal,
                incomingValue: incVal,
            });
            continue;
        }

        const { decision, rationale, severity } = resolvePropertyDecision(
            prop,
            baseVal,
            desVal,
            incVal,
            input.confidence,
        );

        const propertyClass = classifyProperty(prop);

        operations.push({
            nodeKey: input.nodeKey,
            property: prop,
            propertyClass,
            decision,
            confidence: input.confidence,
            rationale,
            baselineValue: baseVal,
            designerValue: desVal,
            incomingValue: incVal,
        });

        if (decision === 'needsDecision') {
            const suggestedActions: ConflictAction[] = ['keepMine', 'applyIncoming'];
            if (propertyClass === 'semantic') {
                suggestedActions.push('rebind');
            }

            conflicts.push({
                nodeKey: input.nodeKey,
                nodeName: input.nodeName,
                property: prop,
                propertyClass,
                severity,
                reason: rationale,
                designerValue: desVal,
                incomingValue: incVal,
                suggestedActions,
            });
        }
    }

    return { operations, conflicts };
}

// ─── Plan Structural Changes ─────────────────────────────────────
// Locked policy: low-confidence destructive operations NEVER auto-apply.

export function planStructuralChanges(changes: StructuralChange[]): {
    operations: StructuralOperation[];
    conflicts: ConflictItem[];
} {
    const operations: StructuralOperation[] = [];
    const conflicts: ConflictItem[] = [];

    for (const change of changes) {
        if (change.type === 'add') {
            operations.push({
                type: 'add',
                nodeKey: change.nodeKey,
                confidence: change.confidence,
                decision: 'applyIncoming',
                rationale: 'new node in incoming — added',
                hasDesignerOverride: false,
            });
            continue;
        }

        if (change.type === 'remove') {
            if (change.hasDesignerOverride) {
                operations.push({
                    type: 'remove',
                    nodeKey: change.nodeKey,
                    confidence: change.confidence,
                    decision: 'needsDecision',
                    rationale:
                        'node removed in code but designer has overrides — requires decision',
                    hasDesignerOverride: true,
                });
                conflicts.push({
                    nodeKey: change.nodeKey,
                    nodeName: change.nodeName,
                    property: '_structure',
                    propertyClass: 'semantic',
                    severity: 'action_required',
                    reason: 'Node removed in code but has designer overrides',
                    suggestedActions: ['keepMine', 'applyIncoming'],
                });
                continue;
            }

            if (change.confidence === 'low') {
                operations.push({
                    type: 'remove',
                    nodeKey: change.nodeKey,
                    confidence: 'low',
                    decision: 'needsDecision',
                    rationale: 'low-confidence destructive operation — blocked',
                    hasDesignerOverride: false,
                });
                conflicts.push({
                    nodeKey: change.nodeKey,
                    nodeName: change.nodeName,
                    property: '_structure',
                    propertyClass: 'semantic',
                    severity: 'action_required',
                    reason: 'Low-confidence node removal blocked — verify before applying',
                    suggestedActions: ['keepMine', 'applyIncoming'],
                });
                continue;
            }

            // High/medium confidence, no designer override → auto-remove
            operations.push({
                type: 'remove',
                nodeKey: change.nodeKey,
                confidence: change.confidence,
                decision: 'applyIncoming',
                rationale: `node removed in code — auto-removed (${change.confidence} confidence, no overrides)`,
                hasDesignerOverride: false,
            });
            continue;
        }

        if (change.type === 'reorder') {
            if (change.confidence === 'low') {
                operations.push({
                    type: 'reorder',
                    nodeKey: change.nodeKey,
                    confidence: 'low',
                    decision: 'needsDecision',
                    rationale: 'low-confidence reorder — blocked',
                    hasDesignerOverride: change.hasDesignerOverride,
                });
                conflicts.push({
                    nodeKey: change.nodeKey,
                    nodeName: change.nodeName,
                    property: '_order',
                    propertyClass: 'layout',
                    severity: 'action_required',
                    reason: 'Low-confidence node reorder blocked',
                    suggestedActions: ['keepMine', 'applyIncoming'],
                });
                continue;
            }

            operations.push({
                type: 'reorder',
                nodeKey: change.nodeKey,
                confidence: change.confidence,
                decision: 'applyIncoming',
                rationale: `node reordered — applied (${change.confidence} confidence)`,
                hasDesignerOverride: change.hasDesignerOverride,
            });
        }
    }

    return { operations, conflicts };
}

// ─── Full Merge Plan ─────────────────────────────────────────────

export function createMergePlan(
    propertyInputs: PlannerInput[],
    structuralChanges: StructuralChange[],
): MergePlan {
    const allPropertyOps: MergeOperation[] = [];
    const allConflicts: ConflictItem[] = [];

    for (const input of propertyInputs) {
        const { operations, conflicts } = planPropertyMerges(input);
        allPropertyOps.push(...operations);
        allConflicts.push(...conflicts);
    }

    const { operations: structOps, conflicts: structConflicts } =
        planStructuralChanges(structuralChanges);
    allConflicts.push(...structConflicts);

    return {
        propertyOperations: allPropertyOps,
        structuralOperations: structOps,
        conflicts: allConflicts,
    };
}
