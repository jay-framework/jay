import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import type { ImportIRNode } from '../../../lib/vendors/figma/import-ir';
import type { PageContractPath } from '../../../lib/vendors/figma/pageContractPath';
import {
    detectVariantGroups,
    synthesizeVariant,
    synthesizeRepeater,
} from '../../../lib/vendors/figma/variant-synthesizer';

const mockContractTags: ContractTag[] = [
    { tag: 'mediaType', type: 'variant' as any, dataType: 'enum', values: ['IMAGE', 'VIDEO'] } as any,
    { tag: 'isOnSale', type: 'variant' as any, dataType: 'boolean' } as any,
    { tag: 'a', type: 'variant' as any, dataType: 'enum' } as any,
    { tag: 'b', type: 'variant' as any, dataType: 'enum' } as any,
    {
        tag: 'items',
        type: 'subContract',
        repeated: true,
        tags: [
            { tag: 'name', type: 'data', dataType: 'string' },
            { tag: 'id', type: 'data', dataType: 'string' },
        ],
    },
];

const pageContractPath: PageContractPath = { pageUrl: '/test' };
const jayPageSectionId = 'section-1';

const mockBuildChildNode = (element: { getAttribute: (name: string) => string | undefined; rawTagName?: string }): ImportIRNode => ({
    id: 'child-' + (element.getAttribute('data-test-id') || 'unknown'),
    sourcePath: 'test',
    kind: 'FRAME',
    name: element.rawTagName || 'div',
    visible: true,
    children: [],
});

describe('variant-synthesizer', () => {
    describe('detectVariantGroups', () => {
        it('two sibling divs with if conditions → one group', () => {
            const doc = parse(`
                <div>
                    <div if="mediaType == IMAGE" data-test-id="img"></div>
                    <div if="mediaType == VIDEO" data-test-id="vid"></div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);
            expect(groups[0]!.elements).toHaveLength(2);
            expect(groups[0]!.conditions).toEqual([
                'mediaType == IMAGE',
                'mediaType == VIDEO',
            ]);
        });

        it('non-if sibling between two if-siblings → two separate groups (each with 1 element, neither qualifies)', () => {
            const doc = parse(`
                <div>
                    <div if="mediaType == IMAGE" data-test-id="img"></div>
                    <span>separator</span>
                    <div if="mediaType == VIDEO" data-test-id="vid"></div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(0);
        });

        it('no if siblings → empty array', () => {
            const doc = parse(`
                <div>
                    <div>a</div>
                    <div>b</div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(0);
        });

        it('three consecutive if siblings → one group of 3', () => {
            const doc = parse(`
                <div>
                    <div if="a == X" data-test-id="x"></div>
                    <div if="a == Y" data-test-id="y"></div>
                    <div if="a == Z" data-test-id="z"></div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);
            expect(groups[0]!.elements).toHaveLength(3);
            expect(groups[0]!.conditions).toEqual(['a == X', 'a == Y', 'a == Z']);
        });
    });

    describe('synthesizeVariant', () => {
        it('enum: if="mediaType == IMAGE" / if="mediaType == VIDEO" → COMPONENT_SET with 2 COMPONENTs, one INSTANCE', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
                        <div if="mediaType == VIDEO" data-test-id="vid"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.kind).toBe('COMPONENT_SET');
            expect(result.componentSet.children).toHaveLength(2);
            expect(result.componentSet.children!.every((c) => c.kind === 'COMPONENT')).toBe(true);
            expect(result.instance.kind).toBe('INSTANCE');
        });

        it('boolean: if="isOnSale" / if="!isOnSale" → boolean dimension with true/false variants', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="isOnSale" data-test-id="on"></div>
                        <div if="!isOnSale" data-test-id="off"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.componentPropertyDefinitions).toBeDefined();
            expect(result.componentSet.componentPropertyDefinitions!['isOnSale']).toEqual({
                type: 'VARIANT',
                variantOptions: ['false', 'true'],
            });
        });

        it('compound: if="a == X && b == Y" / if="a == Z && b == W" → multiple dimensions', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="a == X && b == Y" data-test-id="xy"></div>
                        <div if="a == Z && b == W" data-test-id="zw"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.componentPropertyDefinitions).toBeDefined();
            expect(result.componentSet.componentPropertyDefinitions!['a']?.variantOptions).toEqual(
                expect.arrayContaining(['X', 'Z']),
            );
            expect(result.componentSet.componentPropertyDefinitions!['b']?.variantOptions).toEqual(
                expect.arrayContaining(['Y', 'W']),
            );
        });
    });

    describe('synthesizeRepeater', () => {
        it('div with forEach="items" trackBy="id" → FRAME node with one template child', () => {
            const doc = parse(`
                <body>
                    <div forEach="items" trackBy="id">
                        <span data-test-id="item">item</span>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const forEachEl = doc.querySelector('div[forEach]')!;

            const result = synthesizeRepeater(
                forEachEl,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.kind).toBe('FRAME');
            expect(result.children).toHaveLength(1);
            expect(result.children![0]!.id).toBe('child-item');
        });
    });

    describe('COMPONENT_SET structure', () => {
        it('has correct componentPropertyDefinitions', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
                        <div if="mediaType == VIDEO" data-test-id="vid"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.componentPropertyDefinitions).toEqual({
                mediaType: {
                    type: 'VARIANT',
                    variantOptions: expect.arrayContaining(['IMAGE', 'VIDEO']),
                },
            });
        });
    });

    describe('INSTANCE structure', () => {
        it('has mainComponentId pointing to first COMPONENT', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
                        <div if="mediaType == VIDEO" data-test-id="vid"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            const firstComponent = result.componentSet.children![0]!;
            expect(result.instance.mainComponentId).toBe(firstComponent.id);
        });
    });

    describe('COMPONENT children', () => {
        it('have correct variantProperties', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
                        <div if="mediaType == VIDEO" data-test-id="vid"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            const components = result.componentSet.children!;
            const imgComp = components.find((c) => c.variantProperties?.mediaType === 'IMAGE');
            const vidComp = components.find((c) => c.variantProperties?.mediaType === 'VIDEO');

            expect(imgComp).toBeDefined();
            expect(imgComp!.variantProperties).toEqual({ mediaType: 'IMAGE' });
            expect(vidComp).toBeDefined();
            expect(vidComp!.variantProperties).toEqual({ mediaType: 'VIDEO' });
        });
    });
});
