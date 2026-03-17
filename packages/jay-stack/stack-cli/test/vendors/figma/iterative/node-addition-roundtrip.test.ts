/**
 * Failing tests for Issue #15: False conflicts after node addition (Flow #4).
 *
 * These tests reproduce the bugs discovered during manual testing of Flow #4.
 * The root cause is that `data-jay-sid` is based on line:col positions in the
 * source file. When code is inserted (e.g., a <span> between <h2> and <p>),
 * all subsequent elements shift line numbers, causing their source IDs to
 * collide with IDs of DIFFERENT elements from the previous import.
 *
 * This creates three cascading problems:
 *   A) jaySid collision → matcher pairs WRONG nodes with high confidence
 *   B) Wrong matches → span never detected as ADD, wrong properties merged
 *   C) After merge, re-import sees wrong baseline → false conflicts + structural loop
 *
 * The fix must either:
 *   - Validate jaySid matches against secondary signals (tag name, classes)
 *   - Use content-based IDs instead of line:col-based IDs
 *   - Detect and break jaySid collisions when the matched nodes are clearly different
 */
import { describe, it, expect } from 'vitest';
import {
    applyMergePlan,
    buildBaseline,
} from '../../../../lib/vendors/figma/iterative/merge-applier';
import type { ApplyInput } from '../../../../lib/vendors/figma/iterative/merge-applier';
import { createMergePlan } from '../../../../lib/vendors/figma/iterative/merge-planner';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';
import {
    flattenVendorDoc,
    buildPlannerInputs,
    buildStructuralChanges,
    baselineToPropertyIndex,
} from '../../../../lib/vendors/figma/iterative/vendor-doc-flatten';
import { matchNodes } from '../../../../lib/vendors/figma/iterative/match-confidence';

// ─── Test Helpers ────────────────────────────────────────────────

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

function makeTextNode(
    id: string,
    text: string,
    props: Record<string, unknown> = {},
): FigmaVendorDocument {
    return {
        id,
        name: text,
        type: 'TEXT',
        characters: text,
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

/**
 * Builds a document that mirrors the l1 page structure BEFORE the span is added:
 *   section > card > [h2, p, footer]
 *
 * Source IDs are line:col based. The h2 is at 18:9, p at 19:9, footer at 20:9.
 */
function buildCleanImportDoc(): FigmaVendorDocument {
    return makeDoc({
        children: [
            makeNode('16:7', {
                name: 'class="card"',
                pluginData: { 'data-jay-sid': '16:7', semanticHtml: 'div' },
                cornerRadius: 8,
                fills: [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }],
                children: [
                    makeNode('18:9', {
                        name: 'class="card-title"',
                        type: 'TEXT',
                        characters: 'Featured Item',
                        pluginData: { 'data-jay-sid': '18:9', semanticHtml: 'h2' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
                    }),
                    makeNode('19:9', {
                        name: 'class="card-description"',
                        type: 'TEXT',
                        characters: 'This is a description of the featured item...',
                        pluginData: { 'data-jay-sid': '19:9', semanticHtml: 'p' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }],
                    }),
                    makeNode('20:9', {
                        name: 'class="card-footer"',
                        pluginData: { 'data-jay-sid': '20:9', semanticHtml: 'footer' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }],
                        strokes: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }],
                    }),
                ],
            }),
        ],
    });
}

/**
 * Builds the INCOMING doc after the developer adds a <span> between h2 and p.
 *
 * CRITICAL: Source IDs shift! The span takes 19:9 (where p used to be),
 * the p shifts to 20:9 (where footer used to be), footer shifts to 21:9.
 * This creates jaySid collisions: old p's sid = new span's sid, etc.
 */
function buildIncomingDocWithSpan(): FigmaVendorDocument {
    return makeDoc({
        children: [
            makeNode('16:7', {
                name: 'class="card"',
                pluginData: { 'data-jay-sid': '16:7', semanticHtml: 'div' },
                cornerRadius: 8,
                fills: [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }],
                children: [
                    makeNode('18:9', {
                        name: 'class="card-title"',
                        type: 'TEXT',
                        characters: 'Featured Item',
                        pluginData: { 'data-jay-sid': '18:9', semanticHtml: 'h2' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
                    }),
                    // NEW SPAN — gets sid 19:9 (same as old p!)
                    makeNode('19:9', {
                        name: 'class="card-badge"',
                        pluginData: { 'data-jay-sid': '19:9', semanticHtml: 'span' },
                        cornerRadius: 4,
                        fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.6, b: 1 } }],
                        children: [
                            makeTextNode('19:9_text', 'New', {
                                pluginData: { 'data-jay-sid': '19:9_text' },
                            }),
                        ],
                    }),
                    // p shifted from 19:9 → 20:9 (same as old footer!)
                    makeNode('20:9', {
                        name: 'class="card-description"',
                        type: 'TEXT',
                        characters: 'This is a description of the featured item...',
                        pluginData: { 'data-jay-sid': '20:9', semanticHtml: 'p' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }],
                    }),
                    // footer shifted from 20:9 → 21:9
                    makeNode('21:9', {
                        name: 'class="card-footer"',
                        pluginData: { 'data-jay-sid': '21:9', semanticHtml: 'footer' },
                        cornerRadius: 0,
                        fills: [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }],
                        strokes: [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }],
                    }),
                ],
            }),
        ],
    });
}

/**
 * Simulates Figma reassigning IDs to all nodes after merge-apply.
 * The plugin creates new Figma nodes with new IDs. pluginData is preserved.
 */
function reassignFigmaIds(doc: FigmaVendorDocument, prefix: string): FigmaVendorDocument {
    let counter = 0;
    function walk(node: FigmaVendorDocument): FigmaVendorDocument {
        const newId = `${prefix}:${counter++}`;
        return {
            ...node,
            id: newId,
            children: node.children?.map((c) => walk(c)),
        };
    }
    return walk(doc);
}

// ─── Core Bug: jaySid Collision Causes Wrong Matches ────────────

describe.skip('Node matching must handle source ID shifts correctly', () => {
    it('p node should match p node, not the new span with colliding jaySid', () => {
        const designerDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        // Find the match for the current p node (id: "19:9", semanticHtml: 'p')
        const pMatch = matchResult.matches.find((m) => m.currentNodeKey === '19:9');
        expect(pMatch).toBeDefined();

        // The p (current 19:9) should match the INCOMING p (20:9), NOT the incoming span (19:9).
        // Currently broken: jaySid "19:9" on both current p and incoming span
        // causes a false high-confidence match between p and span.
        expect(pMatch!.incomingNodeKey).toBe('20:9');
    });

    it('footer node should match footer node, not the shifted p', () => {
        const designerDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        // Find the match for the current footer (id: "20:9", semanticHtml: 'footer')
        const footerMatch = matchResult.matches.find((m) => m.currentNodeKey === '20:9');
        expect(footerMatch).toBeDefined();

        // Footer (current 20:9) should match incoming footer (21:9), NOT incoming p (20:9).
        // Currently broken: jaySid "20:9" collides between current footer and incoming p.
        expect(footerMatch!.incomingNodeKey).toBe('21:9');
    });

    it('new span should be detected as unmatched incoming (addition)', () => {
        const designerDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        // The span (incoming 19:9) should NOT match any current node.
        // It should appear as unmatchedIncoming → structural ADD.
        expect(matchResult.unmatchedIncoming).toContain('19:9');
    });
});

// ─── Property Conflicts: Wrong Match → Wrong Baseline → Conflicts ─

describe.skip('No false property conflicts when designer made no changes', () => {
    it('baseline should be found correctly for p node despite source ID shift', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );

        // Find the planner input for the p node
        const pInput = inputs.find((i) => i.nodeName?.includes('card-description'));
        expect(pInput).toBeDefined();

        // The baseline should contain p's properties (cornerRadius: 0, etc.).
        // If source ID collision caused wrong matching, the baseline would contain
        // SPAN properties instead (wrong data but non-empty), or be empty (if
        // the lookup key changed entirely).
        expect(pInput!.baseline).toHaveProperty('cornerRadius', 0);

        // Verify the INCOMING properties also belong to p, not span
        expect(pInput!.incoming).toHaveProperty('cornerRadius', 0);
    });

    it('merge plan should have zero property conflicts (designer unchanged)', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent,
            matchResult.unmatchedIncoming,
            designerDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const plan = createMergePlan(inputs, structChanges);

        // Since the designer made NO changes, there should be ZERO property conflicts.
        // All code changes should auto-apply.
        const propertyConflicts = plan.conflicts.filter(
            (c) => c.property !== '_structure' && c.property !== '_order',
        );
        expect(propertyConflicts).toHaveLength(0);
    });
});

// ─── Structural: Span Addition Should Work Cleanly ──────────────

describe.skip('Span addition should be detected and applied correctly', () => {
    it('merge plan should include exactly 1 structural add for the span', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent,
            matchResult.unmatchedIncoming,
            designerDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const plan = createMergePlan(inputs, structChanges);

        // Should have 1 add (the span; its text child is included via cloneDoc)
        const adds = plan.structuralOperations.filter((op) => op.type === 'add');
        expect(adds).toHaveLength(1);
        expect(adds[0].nodeKey).toBe('19:9');

        // No removals — all existing nodes should be matched
        const removals = plan.structuralOperations.filter((op) => op.type === 'remove');
        expect(removals).toHaveLength(0);
    });

    it('after merge, merged doc should contain the span with correct content', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent,
            matchResult.unmatchedIncoming,
            designerDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const plan = createMergePlan(inputs, structChanges);

        const result = applyMergePlan(
            makeApplyInput({
                existingDoc: designerDoc,
                incomingDoc,
                plan,
                matches: matchResult.matches.map((m) => ({
                    currentNodeKey: m.currentNodeKey,
                    incomingNodeKey: m.incomingNodeKey,
                })),
            }),
        );

        // The card should now have 4 children: h2, span, p, footer
        const card = result.mergedDoc.children?.[0];
        expect(card?.children).toHaveLength(4);

        // The span should be present with its text child
        const span = card?.children?.find((c: FigmaVendorDocument) =>
            c.name?.includes('card-badge'),
        );
        expect(span).toBeDefined();
        expect(span?.children?.[0]?.characters).toBe('New');

        // The p and footer should still be present (not corrupted)
        const p = card?.children?.find((c: FigmaVendorDocument) =>
            c.name?.includes('card-description'),
        );
        expect(p).toBeDefined();
        expect(p?.characters).toBe('This is a description of the featured item...');

        const footer = card?.children?.find((c: FigmaVendorDocument) =>
            c.name?.includes('card-footer'),
        );
        expect(footer).toBeDefined();
    });
});

// ─── Re-Import Stability After Node Addition ────────────────────

describe.skip('Re-import stability after node addition', () => {
    it('second merge (same code, no designer changes) should produce 0 conflicts', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent,
            matchResult.unmatchedIncoming,
            designerDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const plan = createMergePlan(inputs, structChanges);

        // Apply first merge
        const firstResult = applyMergePlan(
            makeApplyInput({
                existingDoc: designerDoc,
                incomingDoc,
                plan,
                matches: matchResult.matches.map((m) => ({
                    currentNodeKey: m.currentNodeKey,
                    incomingNodeKey: m.incomingNodeKey,
                })),
            }),
        );

        // Simulate Figma reassigning IDs
        const figmaDoc = reassignFigmaIds(firstResult.mergedDoc, '30');

        // Second merge with same incoming doc
        const reFlat = flattenVendorDoc(figmaDoc);
        const reIncFlat = flattenVendorDoc(incomingDoc);
        const reMatch = matchNodes(reFlat, reIncFlat);

        const reBaselineIndex = baselineToPropertyIndex(firstResult.newBaseline.nodes);
        const reInputs = buildPlannerInputs(
            reMatch.matches,
            reBaselineIndex,
            figmaDoc,
            incomingDoc,
        );
        const reStructChanges = buildStructuralChanges(
            reMatch.unmatchedCurrent,
            reMatch.unmatchedIncoming,
            figmaDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const rePlan = createMergePlan(reInputs, reStructChanges);

        // Zero conflicts — code hasn't changed, designer hasn't changed
        expect(rePlan.conflicts).toHaveLength(0);

        // Zero structural changes — everything is already in sync
        expect(rePlan.structuralOperations).toHaveLength(0);
    });

    it('conflict resolution loop should terminate in at most 1 round', () => {
        const cleanDoc = buildCleanImportDoc();
        const incomingDoc = buildIncomingDocWithSpan();

        const baseline = buildBaseline(cleanDoc, '/test');
        const baselineIndex = baselineToPropertyIndex(baseline.nodes);

        const designerDoc = JSON.parse(JSON.stringify(cleanDoc)) as FigmaVendorDocument;
        const currentFlat = flattenVendorDoc(designerDoc);
        const incomingFlat = flattenVendorDoc(incomingDoc);
        const matchResult = matchNodes(currentFlat, incomingFlat);

        const inputs = buildPlannerInputs(
            matchResult.matches,
            baselineIndex,
            designerDoc,
            incomingDoc,
        );
        const structChanges = buildStructuralChanges(
            matchResult.unmatchedCurrent,
            matchResult.unmatchedIncoming,
            designerDoc,
            incomingDoc,
            'low',
            new Set(),
        );
        const plan = createMergePlan(inputs, structChanges);

        // Apply first merge
        const firstResult = applyMergePlan(
            makeApplyInput({
                existingDoc: designerDoc,
                incomingDoc,
                plan,
                matches: matchResult.matches.map((m) => ({
                    currentNodeKey: m.currentNodeKey,
                    incomingNodeKey: m.incomingNodeKey,
                })),
            }),
        );

        // Simulate up to 3 resolution rounds
        let currentDoc = reassignFigmaIds(firstResult.mergedDoc, '30');
        let currentBaseline = firstResult.newBaseline;
        let round = 0;
        const MAX_ROUNDS = 3;

        while (round < MAX_ROUNDS) {
            round++;
            const curFlat = flattenVendorDoc(currentDoc);
            const incFlat = flattenVendorDoc(incomingDoc);
            const match = matchNodes(curFlat, incFlat);
            const bIdx = baselineToPropertyIndex(currentBaseline.nodes);
            const pInputs = buildPlannerInputs(match.matches, bIdx, currentDoc, incomingDoc);
            const sChanges = buildStructuralChanges(
                match.unmatchedCurrent,
                match.unmatchedIncoming,
                currentDoc,
                incomingDoc,
                'low',
                new Set(),
            );
            const mergePlan = createMergePlan(pInputs, sChanges);

            if (mergePlan.conflicts.length === 0) break;

            const resolutions = mergePlan.conflicts.map((c) => ({
                nodeKey: c.nodeKey,
                nodeName: c.nodeName,
                property: c.property,
                action: 'applyIncoming' as const,
            }));

            const result = applyMergePlan(
                makeApplyInput({
                    existingDoc: currentDoc,
                    incomingDoc,
                    plan: mergePlan,
                    conflictResolutions: resolutions,
                    matches: match.matches.map((m) => ({
                        currentNodeKey: m.currentNodeKey,
                        incomingNodeKey: m.incomingNodeKey,
                    })),
                }),
            );

            currentDoc = reassignFigmaIds(result.mergedDoc, `4${round}`);
            currentBaseline = result.newBaseline;
        }

        // Must terminate without hitting the safety limit
        expect(round).toBeLessThan(MAX_ROUNDS);
    });
});
