import { describe, it, expect } from 'vitest';
import {
    extractIdentity,
    matchNodes,
} from '../../../../lib/vendors/figma/iterative/match-confidence';

function makeNode(
    key: string,
    pluginData: Record<string, string> = {},
    overrides: { parentIndex?: number; treeDepth?: number; name?: string } = {},
) {
    return {
        key,
        pluginData,
        name: overrides.name,
        parentIndex: overrides.parentIndex ?? 0,
        treeDepth: overrides.treeDepth ?? 0,
    };
}

describe('Match Confidence Engine', () => {
    describe('extractIdentity', () => {
        it('extracts jaySid from pluginData', () => {
            const node = makeNode('n1', { 'data-jay-sid': 'sid-42' });
            const identity = extractIdentity(node);
            expect(identity.jaySid).toBe('sid-42');
        });

        it('extracts figmaId from node key', () => {
            const node = makeNode('123:456');
            const identity = extractIdentity(node);
            expect(identity.figmaId).toBe('123:456');
        });

        it('extracts binding signature', () => {
            const bindings = JSON.stringify([
                { tagPath: ['product', 'name'], attribute: undefined },
                { tagPath: ['product', 'price'], attribute: undefined },
            ]);
            const node = makeNode('n1', { 'jay-layer-bindings': bindings });
            const identity = extractIdentity(node);
            expect(identity.bindingSignature).toBeDefined();
            expect(identity.bindingSignature).toContain('product.name');
            expect(identity.bindingSignature).toContain('product.price');
        });

        it('handles malformed binding data gracefully', () => {
            const node = makeNode('n1', { 'jay-layer-bindings': '{invalid json' });
            const identity = extractIdentity(node);
            expect(identity.bindingSignature).toBeUndefined();
        });

        it('returns deterministic output for same input', () => {
            const node = makeNode(
                'n1',
                { 'data-jay-sid': 'sid-1', semanticHtml: 'div' },
                { parentIndex: 2, treeDepth: 3 },
            );
            const id1 = extractIdentity(node);
            const id2 = extractIdentity(node);
            expect(id1).toEqual(id2);
        });
    });

    describe('scoreMatch — confidence levels', () => {
        it('exact sid match → high confidence', () => {
            const current = [makeNode('c1', { 'data-jay-sid': 'sid-42' })];
            const incoming = [makeNode('i1', { 'data-jay-sid': 'sid-42' })];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].confidence).toBe('high');
            expect(result.matches[0].reason).toContain('sid');
        });

        it('exact figma-id match → high confidence', () => {
            const current = [makeNode('100:200')];
            const incoming = [makeNode('100:200')];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].confidence).toBe('high');
            expect(result.matches[0].reason).toContain('figma-id');
        });

        it('binding-only match → medium confidence', () => {
            const bindings = JSON.stringify([{ tagPath: ['title'], attribute: undefined }]);
            const current = [makeNode('c1', { 'jay-layer-bindings': bindings })];
            const incoming = [makeNode('i1', { 'jay-layer-bindings': bindings })];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].confidence).toBe('medium');
            expect(result.matches[0].reason).toContain('binding');
        });

        it('neighborhood heuristic only → low confidence', () => {
            const current = [
                makeNode('c1', { semanticHtml: 'h1' }, { parentIndex: 0, treeDepth: 2 }),
            ];
            const incoming = [
                makeNode('i1', { semanticHtml: 'h1' }, { parentIndex: 0, treeDepth: 2 }),
            ];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].confidence).toBe('low');
            expect(result.matches[0].reason).toContain('neighborhood');
        });
    });

    describe('no-match case', () => {
        it('reports unmatched nodes when no signals overlap', () => {
            const current = [
                makeNode(
                    'c1',
                    { 'data-jay-sid': 'sid-a', semanticHtml: 'h1' },
                    { parentIndex: 0, treeDepth: 1 },
                ),
            ];
            const incoming = [
                makeNode(
                    'i1',
                    { 'data-jay-sid': 'sid-b', semanticHtml: 'span' },
                    { parentIndex: 5, treeDepth: 3 },
                ),
            ];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(0);
            expect(result.unmatchedCurrent).toContain('c1');
            expect(result.unmatchedIncoming).toContain('i1');
        });
    });

    describe('ambiguous low-confidence match → diagnostics', () => {
        it('emits diagnostics for ties', () => {
            const current = [makeNode('c1', { semanticHtml: 'div' }, { parentIndex: 0 })];
            const incoming = [
                makeNode('i1', { semanticHtml: 'div' }, { parentIndex: 0, treeDepth: 0 }),
                makeNode('i2', { semanticHtml: 'div' }, { parentIndex: 0, treeDepth: 1 }),
            ];
            const result = matchNodes(current, incoming);
            expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
            expect(result.diagnostics[0].candidates.length).toBe(2);
            expect(result.diagnostics[0].triggersDestructiveGate).toBe(true);
        });
    });

    describe('tie-break determinism', () => {
        it('produces identical results across 3 runs', () => {
            const current = [
                makeNode('c1', { semanticHtml: 'p' }, { parentIndex: 0, treeDepth: 1 }),
                makeNode('c2', { semanticHtml: 'p' }, { parentIndex: 1, treeDepth: 1 }),
            ];
            const incoming = [
                makeNode('i1', { semanticHtml: 'p' }, { parentIndex: 0, treeDepth: 1 }),
                makeNode('i2', { semanticHtml: 'p' }, { parentIndex: 1, treeDepth: 1 }),
            ];

            const r1 = matchNodes(current, incoming);
            const r2 = matchNodes(current, incoming);
            const r3 = matchNodes(current, incoming);

            const normalize = (r: typeof r1) =>
                r.matches.map((m) => `${m.currentNodeKey}->${m.incomingNodeKey}`).sort();

            expect(normalize(r1)).toEqual(normalize(r2));
            expect(normalize(r2)).toEqual(normalize(r3));
        });
    });

    describe('priority enforcement', () => {
        it('high confidence sid match wins over medium binding match', () => {
            const bindings = JSON.stringify([{ tagPath: ['title'], attribute: undefined }]);
            const current = [
                makeNode('c1', {
                    'data-jay-sid': 'sid-exact',
                    'jay-layer-bindings': bindings,
                }),
            ];
            const incoming = [
                makeNode('i1', { 'jay-layer-bindings': bindings }),
                makeNode('i2', { 'data-jay-sid': 'sid-exact' }),
            ];
            const result = matchNodes(current, incoming);
            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].incomingNodeKey).toBe('i2');
            expect(result.matches[0].confidence).toBe('high');
        });
    });
});
