import type { MergeConfidence } from '@jay-framework/editor-protocol';
import type {
    NodeIdentity,
    MatchCandidate,
    MatchResult,
    AmbiguityDiagnostic,
    MatchEngineResult,
} from './types';

// ─── Thresholds ───────────────────────────────────────────────────
// Locked priority: high > medium > low.
// A high-confidence match always wins over medium/low.

const HIGH_THRESHOLD = 0.9;
const MEDIUM_THRESHOLD = 0.6;

// ─── Identity Extraction ─────────────────────────────────────────

export interface FlatNode {
    key: string;
    pluginData?: Record<string, string>;
    name?: string;
    type?: string;
    parentIndex: number;
    treeDepth: number;
}

export function extractIdentity(node: FlatNode): NodeIdentity {
    const pd = node.pluginData ?? {};

    let bindingSignature: string | undefined;
    if (pd['jay-layer-bindings']) {
        try {
            const bindings = JSON.parse(pd['jay-layer-bindings']);
            if (Array.isArray(bindings)) {
                bindingSignature = bindings
                    .map(
                        (b: any) =>
                            `${(b.tagPath ?? []).join('.')}:${b.attribute ?? b.property ?? 'content'}`,
                    )
                    .sort()
                    .join('|');
            }
        } catch {
            /* malformed — skip */
        }
    }

    const semanticHtml = pd['semanticHtml'];
    const tagName = semanticHtml || undefined;

    const classes: string[] = [];
    if (node.name) {
        const classMatch = node.name.match(/class="([^"]+)"/);
        if (classMatch) {
            classes.push(...classMatch[1].split(/\s+/).filter(Boolean));
        }
    }

    return {
        jaySid: pd['data-jay-sid'] || undefined,
        figmaId: node.key,
        bindingSignature,
        ref: pd['jay-ref'] || undefined,
        id: pd['jay-id'] || undefined,
        classes,
        tagName,
        parentIndex: node.parentIndex,
        treeDepth: node.treeDepth,
    };
}

// ─── Scoring ─────────────────────────────────────────────────────

function scoreMatch(
    current: NodeIdentity,
    incoming: NodeIdentity,
): { score: number; reason: string } {
    if (current.jaySid && current.jaySid === incoming.jaySid) {
        return { score: 1.0, reason: 'exact data-jay-sid match' };
    }

    if (current.figmaId && current.figmaId === incoming.figmaId) {
        return { score: 0.95, reason: 'exact data-figma-id match' };
    }

    if (current.bindingSignature && current.bindingSignature === incoming.bindingSignature) {
        return { score: 0.75, reason: 'binding signature match' };
    }

    let neighborhoodScore = 0;
    const reasons: string[] = [];

    if (current.ref && current.ref === incoming.ref) {
        neighborhoodScore += 0.25;
        reasons.push('ref match');
    }
    if (current.tagName && current.tagName === incoming.tagName) {
        neighborhoodScore += 0.15;
        reasons.push('tag match');
    }
    if (current.classes.length > 0 && incoming.classes.length > 0) {
        const overlap = current.classes.filter((c) => incoming.classes.includes(c));
        if (overlap.length > 0) {
            neighborhoodScore +=
                0.1 * (overlap.length / Math.max(current.classes.length, incoming.classes.length));
            reasons.push(`class overlap: ${overlap.join(', ')}`);
        }
    }
    if (current.parentIndex === incoming.parentIndex) {
        neighborhoodScore += 0.05;
        reasons.push('same parent index');
    }

    if (neighborhoodScore > 0) {
        return {
            score: Math.min(neighborhoodScore, 0.65),
            reason: `neighborhood heuristic (${reasons.join('; ')})`,
        };
    }

    return { score: 0, reason: 'no match signals' };
}

function toConfidence(score: number): MergeConfidence {
    if (score >= HIGH_THRESHOLD) return 'high';
    if (score >= MEDIUM_THRESHOLD) return 'medium';
    return 'low';
}

// ─── Deterministic Tie-Break ─────────────────────────────────────
// When multiple candidates have the same score, use stable ordering
// (tree depth first, then parent index) as the final tie-breaker.

function tieBreakOrder(a: MatchCandidate, b: MatchCandidate): number {
    if (a.score !== b.score) return b.score - a.score;
    if (a.identity.treeDepth !== b.identity.treeDepth)
        return a.identity.treeDepth - b.identity.treeDepth;
    return a.identity.parentIndex - b.identity.parentIndex;
}

// ─── Match Engine ────────────────────────────────────────────────

export function matchNodes(currentNodes: FlatNode[], incomingNodes: FlatNode[]): MatchEngineResult {
    const currentIdentities = currentNodes.map((n) => ({
        key: n.key,
        identity: extractIdentity(n),
    }));
    const incomingIdentities = incomingNodes.map((n) => ({
        key: n.key,
        identity: extractIdentity(n),
    }));

    const matches: MatchResult[] = [];
    const diagnostics: AmbiguityDiagnostic[] = [];
    const matchedIncoming = new Set<string>();
    const matchedCurrent = new Set<string>();

    for (const current of currentIdentities) {
        const candidates: MatchCandidate[] = [];

        for (const incoming of incomingIdentities) {
            if (matchedIncoming.has(incoming.key)) continue;
            const { score, reason } = scoreMatch(current.identity, incoming.identity);
            if (score > 0) {
                candidates.push({
                    nodeKey: incoming.key,
                    identity: incoming.identity,
                    score,
                    confidence: toConfidence(score),
                    reason,
                });
            }
        }

        if (candidates.length === 0) continue;

        candidates.sort(tieBreakOrder);
        const best = candidates[0];
        const ambiguous = candidates.length > 1 && candidates[1].score === best.score;

        if (ambiguous) {
            diagnostics.push({
                currentNodeKey: current.key,
                tagName: current.identity.tagName,
                classes: current.identity.classes,
                jaySid: current.identity.jaySid,
                candidates: candidates.map((c) => ({
                    incomingNodeKey: c.nodeKey,
                    score: c.score,
                    confidence: c.confidence,
                    reason: c.reason,
                })),
                selectedCandidate: best.nodeKey,
                selectionReason: 'tie-break by tree position',
                triggersDestructiveGate: best.confidence === 'low',
            });
        }

        matches.push({
            currentNodeKey: current.key,
            incomingNodeKey: best.nodeKey,
            confidence: best.confidence,
            score: best.score,
            reason: best.reason,
            candidates,
            ambiguous,
        });
        matchedIncoming.add(best.nodeKey);
        matchedCurrent.add(current.key);
    }

    const unmatchedCurrent = currentIdentities
        .filter((c) => !matchedCurrent.has(c.key))
        .map((c) => c.key);
    const unmatchedIncoming = incomingIdentities
        .filter((i) => !matchedIncoming.has(i.key))
        .map((i) => i.key);

    return { matches, unmatchedCurrent, unmatchedIncoming, diagnostics };
}
