import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import type { ImportIRNode } from '../../../lib/vendors/figma/import-ir';
import {
    synthesizeVariant,
    detectVariantGroups,
} from '../../../lib/vendors/figma/variant-synthesizer';

/**
 * Bug: Fixed-position overlays inflate variant instance dimensions
 * Found in: store-light products page import — `position: fixed; inset: 0` loading overlay
 * Expected: Variant instance should not inherit 1280×900 viewport dimensions from a fixed overlay
 * Actual: Instance gets maxWidth=1280, maxHeight=900 from the overlay component
 */

const PAGE_CONTRACT_PATH = { pageUrl: '/test' };
const SECTION_ID = 'test-section';

function makeContractTag(tag: string, type: string = 'boolean'): ContractTag {
    return { tag, type };
}

describe('variant-synthesizer: fixed-position nodes excluded from instance sizing', () => {
    it('should not use fixed-position node dimensions for instance size', () => {
        const html = parse(`
            <div>
                <div if="isLoading" class="overlay"></div>
                <div if="!isLoading" class="content"></div>
            </div>
        `);
        const body = html;
        const parent = html.querySelector('div')!;
        const groups = detectVariantGroups(parent);
        expect(groups).toHaveLength(1);

        const group = groups[0]!;
        const contractTags: ContractTag[] = [makeContractTag('isLoading')];

        const result = synthesizeVariant(
            group,
            body,
            contractTags,
            SECTION_ID,
            PAGE_CONTRACT_PATH,
            (element): ImportIRNode => {
                const cls = element.getAttribute('class') ?? '';
                if (cls === 'overlay') {
                    // Simulates a position:fixed; inset:0 overlay → full viewport
                    return {
                        id: 'overlay-node',
                        sourcePath: 'test',
                        kind: 'FRAME',
                        style: { width: 1280, height: 900, isFixed: true, isAbsolute: true },
                    };
                }
                // Normal content with real dimensions
                return {
                    id: 'content-node',
                    sourcePath: 'test',
                    kind: 'FRAME',
                    style: { width: 400, height: 300 },
                };
            },
        );

        // Instance should use 400×300 from the content, not 1280×900 from the fixed overlay
        expect(result.instance.style?.width).toBe(400);
        expect(result.instance.style?.height).toBe(300);
    });

    it('should use normal (non-fixed) node dimensions for instance size', () => {
        const html = parse(`
            <div>
                <div if="hasResults" class="results"></div>
                <div if="!hasResults" class="empty"></div>
            </div>
        `);
        const body = html;
        const parent = html.querySelector('div')!;
        const groups = detectVariantGroups(parent);
        const group = groups[0]!;
        const contractTags: ContractTag[] = [makeContractTag('hasResults')];

        const result = synthesizeVariant(
            group,
            body,
            contractTags,
            SECTION_ID,
            PAGE_CONTRACT_PATH,
            (element): ImportIRNode => {
                const cls = element.getAttribute('class') ?? '';
                if (cls === 'results') {
                    return {
                        id: 'results-node',
                        sourcePath: 'test',
                        kind: 'FRAME',
                        style: { width: 800, height: 600 },
                    };
                }
                return {
                    id: 'empty-node',
                    sourcePath: 'test',
                    kind: 'FRAME',
                    style: { width: 400, height: 200 },
                };
            },
        );

        // Instance should use max of both: 800×600
        expect(result.instance.style?.width).toBe(800);
        expect(result.instance.style?.height).toBe(600);
    });

    it('should use 1×1 when ALL variants are fixed-position and preferHiddenDefault', () => {
        const html = parse(`
            <div>
                <div if="showOverlay" class="overlay"></div>
            </div>
        `);
        const body = html;
        const parent = html.querySelector('div')!;
        const groups = detectVariantGroups(parent);
        const group = groups[0]!;
        const contractTags: ContractTag[] = [makeContractTag('showOverlay')];

        const result = synthesizeVariant(
            group,
            body,
            contractTags,
            SECTION_ID,
            PAGE_CONTRACT_PATH,
            (): ImportIRNode => ({
                id: 'overlay-node',
                sourcePath: 'test',
                kind: 'FRAME',
                style: { width: 1280, height: 900, isFixed: true, isAbsolute: true },
            }),
            undefined, // contractContext
            () => false, // isVisibleInDefault — overlay hidden by default → preferHiddenDefault
        );

        // No non-fixed dimensions + preferHiddenDefault → instance collapses to 1×1
        // (avoids Figma's 100×100 default)
        expect(result.instance.style?.width).toBe(1);
        expect(result.instance.style?.height).toBe(1);
    });
});
