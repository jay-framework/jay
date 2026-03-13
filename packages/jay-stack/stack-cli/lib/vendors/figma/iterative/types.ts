import type { MergeConfidence } from '@jay-framework/editor-protocol';

export interface NodeIdentity {
    jaySid?: string;
    figmaId?: string;
    bindingSignature?: string;
    ref?: string;
    id?: string;
    classes: string[];
    tagName?: string;
    parentIndex: number;
    treeDepth: number;
}

export interface MatchCandidate {
    nodeKey: string;
    identity: NodeIdentity;
    score: number;
    confidence: MergeConfidence;
    reason: string;
}

export interface MatchResult {
    currentNodeKey: string;
    incomingNodeKey: string;
    confidence: MergeConfidence;
    score: number;
    reason: string;
    candidates: MatchCandidate[];
    ambiguous: boolean;
}

export interface AmbiguityDiagnostic {
    currentNodeKey: string;
    tagName?: string;
    classes: string[];
    jaySid?: string;
    candidates: Array<{
        incomingNodeKey: string;
        score: number;
        confidence: MergeConfidence;
        reason: string;
    }>;
    selectedCandidate: string;
    selectionReason: string;
    triggersDestructiveGate: boolean;
}

export interface MatchEngineResult {
    matches: MatchResult[];
    unmatchedCurrent: string[];
    unmatchedIncoming: string[];
    diagnostics: AmbiguityDiagnostic[];
}
