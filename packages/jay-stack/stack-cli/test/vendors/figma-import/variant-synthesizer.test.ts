import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import type { ContractTag } from '@jay-framework/editor-protocol';
import type { ImportIRNode } from '../../../lib/vendors/figma/import-ir';
import type { PageContractPath } from '../../../lib/vendors/figma/pageContractPath';
import {
    detectVariantGroups,
    synthesizeVariant,
    synthesizeRepeater,
    type ElementVisibilityChecker,
} from '../../../lib/vendors/figma/variant-synthesizer';
import { buildVariantCondition } from '../../../lib/vendors/figma/converters/variants';

const mockContractTags: ContractTag[] = [
    {
        tag: 'mediaType',
        type: 'variant' as any,
        dataType: 'enum',
        values: ['IMAGE', 'VIDEO'],
    } as any,
    { tag: 'isOnSale', type: 'variant' as any, dataType: 'boolean' } as any,
    { tag: 'a', type: 'variant' as any, dataType: 'enum' } as any,
    { tag: 'b', type: 'variant' as any, dataType: 'enum' } as any,
    { tag: 'quickAddType', type: 'variant' as any, dataType: 'enum' } as any,
    {
        tag: 'inventory',
        type: 'subContract' as any,
        tags: [{ tag: 'availabilityStatus', type: 'variant' as any, dataType: 'enum' } as any],
    } as any,
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

const mockBuildChildNode = (element: {
    getAttribute: (name: string) => string | undefined;
    rawTagName?: string;
}): ImportIRNode => ({
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
            expect(groups[0]!.conditions).toEqual(['mediaType == IMAGE', 'mediaType == VIDEO']);
        });

        it('non-if sibling between two if-siblings → two separate groups of 1', () => {
            const doc = parse(`
                <div>
                    <div if="mediaType == IMAGE" data-test-id="img"></div>
                    <span>separator</span>
                    <div if="mediaType == VIDEO" data-test-id="vid"></div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(2);
            expect(groups[0]!.elements).toHaveLength(1);
            expect(groups[0]!.conditions).toEqual(['mediaType == IMAGE']);
            expect(groups[1]!.elements).toHaveLength(1);
            expect(groups[1]!.conditions).toEqual(['mediaType == VIDEO']);
        });

        it('single if-element → group of 1', () => {
            const doc = parse(`
                <div>
                    <div>plain</div>
                    <div if="isSearching" data-test-id="loading"></div>
                    <div>plain</div>
                </div>
            `);
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);
            expect(groups[0]!.elements).toHaveLength(1);
            expect(groups[0]!.conditions).toEqual(['isSearching']);
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
        it('has mainComponentId pointing to first COMPONENT when no computed styles', () => {
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
            expect(result.instance.preferHiddenDefault).toBeFalsy();
        });
    });

    describe('default variant selection (using ElementVisibilityChecker)', () => {
        function makeVisibilityChecker(entries: Record<string, boolean>): ElementVisibilityChecker {
            return (el) => {
                const sid = el.getAttribute('data-jay-sid');
                if (!sid) return undefined;
                return entries[sid];
            };
        }

        it('boolean pair: picks visible element as default (hasResults=true visible → default)', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="!isOnSale" data-jay-sid="10:1" data-test-id="off"></div>
                        <div if="isOnSale" data-jay-sid="20:1" data-test-id="on"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);

            const checker = makeVisibilityChecker({
                '10:1': false,
                '20:1': true,
            });

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
                undefined,
                checker,
            );

            const trueComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.isOnSale === 'true',
            );
            expect(result.instance.mainComponentId).toBe(trueComp!.id);
            expect(result.instance.preferHiddenDefault).toBeFalsy();
        });

        it('boolean pair: picks first visible when negated element is the one visible', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="!isOnSale" data-jay-sid="10:1" data-test-id="off"></div>
                        <div if="isOnSale" data-jay-sid="20:1" data-test-id="on"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);

            const checker = makeVisibilityChecker({
                '10:1': true,
                '20:1': false,
            });

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
                undefined,
                checker,
            );

            const falseComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.isOnSale === 'false',
            );
            expect(result.instance.mainComponentId).toBe(falseComp!.id);
        });

        it('solo variant: preferHiddenDefault when element is unknown to checker', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div>plain</div>
                        <div if="isOnSale" data-jay-sid="10:1" data-test-id="sale"></div>
                        <div>more plain</div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);

            const checker = makeVisibilityChecker({});

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
                undefined,
                checker,
            );

            expect(result.instance.preferHiddenDefault).toBe(true);
        });

        it('solo variant: preferHiddenDefault when element is hidden in default', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div>plain</div>
                        <div if="isOnSale" data-jay-sid="10:1" data-test-id="sale"></div>
                        <div>more plain</div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);

            const checker = makeVisibilityChecker({
                '10:1': false,
            });

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
                undefined,
                checker,
            );

            expect(result.instance.preferHiddenDefault).toBe(true);
        });
    });

    describe('inequality (!=) variant values', () => {
        it('!= condition produces !-prefixed variant value', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
                        <div if="mediaType != IMAGE" data-test-id="not-img"></div>
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

            expect(
                result.componentSet.componentPropertyDefinitions!['mediaType']?.variantOptions,
            ).toEqual(expect.arrayContaining(['IMAGE', '!IMAGE']));

            const notImgComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.mediaType === '!IMAGE',
            );
            expect(notImgComp).toBeDefined();
        });

        it('=== and !== (strict operators) produce correct variant values', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="mediaType === IMAGE" data-test-id="img"></div>
                        <div if="mediaType !== IMAGE" data-test-id="not-img"></div>
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

            expect(
                result.componentSet.componentPropertyDefinitions!['mediaType']?.variantOptions,
            ).toEqual(expect.arrayContaining(['IMAGE', '!IMAGE']));
        });

        it('compound with mixed == and != fills missing dimensions with "*"', () => {
            const doc = parse(`
                <body>
                    <div>
                        <button if="quickAddType === SIMPLE && inventory.availabilityStatus === IN_STOCK" data-test-id="a"></button>
                        <button if="quickAddType === SINGLE_OPTION && inventory.availabilityStatus !== OUT_OF_STOCK" data-test-id="b"></button>
                        <button if="quickAddType === NEEDS_CONFIGURATION && inventory.availabilityStatus !== OUT_OF_STOCK" data-test-id="c"></button>
                        <div if="inventory.availabilityStatus === OUT_OF_STOCK" data-test-id="d"></div>
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

            const defs = result.componentSet.componentPropertyDefinitions!;
            expect(defs['quickAddType']?.variantOptions).toEqual(
                expect.arrayContaining(['SIMPLE', 'SINGLE_OPTION', 'NEEDS_CONFIGURATION', '*']),
            );
            expect(defs['availabilityStatus']?.variantOptions).toEqual(
                expect.arrayContaining(['IN_STOCK', 'OUT_OF_STOCK', '!OUT_OF_STOCK']),
            );

            const components = result.componentSet.children!;
            expect(components).toHaveLength(4);

            // All components must have both dimension keys
            for (const comp of components) {
                expect(comp.variantProperties).toHaveProperty('quickAddType');
                expect(comp.variantProperties).toHaveProperty('availabilityStatus');
            }

            // Condition 4 has no quickAddType → should get "*"
            const outOfStockComp = components.find(
                (c) => c.variantProperties?.availabilityStatus === 'OUT_OF_STOCK',
            );
            expect(outOfStockComp?.variantProperties?.quickAddType).toBe('*');

            // Condition 2 has != OUT_OF_STOCK → should get "!OUT_OF_STOCK"
            const singleOptionComp = components.find(
                (c) => c.variantProperties?.quickAddType === 'SINGLE_OPTION',
            );
            expect(singleOptionComp?.variantProperties?.availabilityStatus).toBe('!OUT_OF_STOCK');
        });
    });

    describe('single-element variant groups', () => {
        it('standalone boolean if → 1-variant COMPONENT_SET', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div>plain content</div>
                        <div if="isOnSale" data-test-id="sale"></div>
                        <div>more plain</div>
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
            expect(result.componentSet.children).toHaveLength(1);
            expect(result.componentSet.componentPropertyDefinitions!['isOnSale']).toEqual({
                type: 'VARIANT',
                variantOptions: ['true'],
            });
        });

        it('standalone negated boolean → 1-variant with "false"', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div>plain</div>
                        <div if="!isOnSale" data-test-id="no-sale"></div>
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

            expect(result.componentSet.children).toHaveLength(1);
            expect(result.componentSet.componentPropertyDefinitions!['isOnSale']).toEqual({
                type: 'VARIANT',
                variantOptions: ['false'],
            });
        });

        it('standalone equality → 1-variant with the value', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div>plain</div>
                        <div if="mediaType == IMAGE" data-test-id="img"></div>
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

            expect(result.componentSet.children).toHaveLength(1);
            expect(result.componentSet.componentPropertyDefinitions!['mediaType']).toEqual({
                type: 'VARIANT',
                variantOptions: ['IMAGE'],
            });
        });
    });

    describe('expression operator variants (>, <, >=, <=)', () => {
        it('> and <= siblings → expression values as variant options', () => {
            const tags: ContractTag[] = [
                { tag: 'count', type: 'variant' as any, dataType: 'number' } as any,
            ];
            const doc = parse(`
                <body>
                    <div>
                        <span if="count > 0" data-test-id="in-stock"></span>
                        <span if="count <= 0" data-test-id="out-of-stock"></span>
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
                tags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.componentPropertyDefinitions!['count']).toEqual({
                type: 'VARIANT',
                variantOptions: ['<= 0', '> 0'],
            });

            const inStockComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.count === '> 0',
            );
            const outStockComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.count === '<= 0',
            );
            expect(inStockComp).toBeDefined();
            expect(outStockComp).toBeDefined();
        });

        it('standalone >= → single-variant expression', () => {
            const tags: ContractTag[] = [
                { tag: 'score', type: 'variant' as any, dataType: 'number' } as any,
            ];
            const doc = parse(`
                <body>
                    <div>
                        <div>plain</div>
                        <span if="score >= 80" data-test-id="pass"></span>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            const result = synthesizeVariant(
                groups[0]!,
                body,
                tags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            expect(result.componentSet.children).toHaveLength(1);
            expect(result.componentSet.componentPropertyDefinitions!['score']).toEqual({
                type: 'VARIANT',
                variantOptions: ['>= 80'],
            });
        });
    });

    describe('duplicate variant values', () => {
        it('siblings with same condition are merged into one COMPONENT with multiple children', () => {
            const doc = parse(`
                <body>
                    <div>
                        <div if="!isOnSale" data-test-id="empty"></div>
                        <div if="isOnSale" data-test-id="grid"></div>
                        <div if="isOnSale" data-test-id="pagination"></div>
                    </div>
                </body>
            `);
            const body = doc.querySelector('body')!;
            const parent = doc.querySelector('div')!;
            const groups = detectVariantGroups(parent);
            expect(groups).toHaveLength(1);
            expect(groups[0]!.elements).toHaveLength(3);

            const result = synthesizeVariant(
                groups[0]!,
                body,
                mockContractTags,
                jayPageSectionId,
                pageContractPath,
                (el) => mockBuildChildNode(el),
            );

            // Should produce 2 COMPONENTs (not 3), since two share isOnSale=true
            expect(result.componentSet.children).toHaveLength(2);

            const trueComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.isOnSale === 'true',
            );
            const falseComp = result.componentSet.children!.find(
                (c) => c.variantProperties?.isOnSale === 'false',
            );

            expect(trueComp).toBeDefined();
            expect(trueComp!.children).toHaveLength(2);
            expect(falseComp).toBeDefined();
            expect(falseComp!.children).toHaveLength(1);
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

describe('variants inside repeater (repeaterContext)', () => {
    const repeaterContractTags: ContractTag[] = [
        {
            tag: 'productSearch',
            type: 'subContract' as any,
            tags: [
                {
                    tag: 'searchResults',
                    type: 'subContract',
                    repeated: true,
                    tags: [
                        { tag: 'hasRibbon', type: 'variant', dataType: 'boolean' } as any,
                        { tag: 'hasDiscount', type: 'variant', dataType: 'boolean' } as any,
                        {
                            tag: 'inventory',
                            type: 'subContract' as any,
                            tags: [
                                {
                                    tag: 'availabilityStatus',
                                    type: 'variant',
                                    dataType: 'enum',
                                } as any,
                            ],
                        } as any,
                    ],
                } as any,
            ],
        } as any,
    ];

    it('INSTANCE bindings get full tag path with repeater prefix', () => {
        const doc = parse(`
                <body>
                    <div>
                        <span if="hasRibbon" data-test-id="ribbon"></span>
                        <span if="hasDiscount" data-test-id="discount"></span>
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
            repeaterContractTags,
            jayPageSectionId,
            pageContractPath,
            (el) => mockBuildChildNode(el),
            undefined,
            undefined,
            [['productSearch', 'searchResults']],
        );

        expect(result.instance.bindings).toBeDefined();
        expect(result.instance.bindings!.length).toBe(2);

        const layerBindings = result.instance
            .bindings!.filter((b) => b.kind === 'layer')
            .map((b) => (b as any).binding);

        const ribbonBinding = layerBindings.find((b: any) => b.property === 'hasRibbon');
        expect(ribbonBinding).toBeDefined();
        expect(ribbonBinding.tagPath).toEqual(['productSearch', 'searchResults', 'hasRibbon']);

        const discountBinding = layerBindings.find((b: any) => b.property === 'hasDiscount');
        expect(discountBinding).toBeDefined();
        expect(discountBinding.tagPath).toEqual(['productSearch', 'searchResults', 'hasDiscount']);
    });

    it('nested subContract path inside repeater gets full prefix', () => {
        const doc = parse(`
                <body>
                    <div>
                        <span if="inventory.availabilityStatus === IN_STOCK" data-test-id="in-stock"></span>
                        <span if="inventory.availabilityStatus === OUT_OF_STOCK" data-test-id="out-stock"></span>
                    </div>
                </body>
            `);
        const body = doc.querySelector('body')!;
        const parent = doc.querySelector('div')!;
        const groups = detectVariantGroups(parent);

        const result = synthesizeVariant(
            groups[0]!,
            body,
            repeaterContractTags,
            jayPageSectionId,
            pageContractPath,
            (el) => mockBuildChildNode(el),
            undefined,
            undefined,
            [['productSearch', 'searchResults']],
        );

        expect(result.instance.bindings).toBeDefined();
        const layerBindings = result.instance
            .bindings!.filter((b) => b.kind === 'layer')
            .map((b) => (b as any).binding);

        const statusBinding = layerBindings.find((b: any) => b.property === 'availabilityStatus');
        expect(statusBinding).toBeDefined();
        expect(statusBinding.tagPath).toEqual([
            'productSearch',
            'searchResults',
            'inventory',
            'availabilityStatus',
        ]);
    });

    it('without repeaterContext, same variants produce no bindings (tags not at page level)', () => {
        const doc = parse(`
                <body>
                    <div>
                        <span if="hasRibbon" data-test-id="ribbon"></span>
                    </div>
                </body>
            `);
        const body = doc.querySelector('body')!;
        const parent = doc.querySelector('div')!;
        const groups = detectVariantGroups(parent);

        const result = synthesizeVariant(
            groups[0]!,
            body,
            repeaterContractTags,
            jayPageSectionId,
            pageContractPath,
            (el) => mockBuildChildNode(el),
        );

        const layerBindings = (result.instance.bindings ?? []).filter((b) => b.kind === 'layer');
        expect(layerBindings).toHaveLength(0);
    });
});

describe('buildVariantCondition (export: Figma → HTML)', () => {
    it('enum value → tagPath == value', () => {
        const result = buildVariantCondition([
            { property: 'status', tagPath: 'order.status', value: 'ACTIVE', isBoolean: false },
        ]);
        expect(result).toBe('order.status == ACTIVE');
    });

    it('boolean true → tagPath', () => {
        const result = buildVariantCondition([
            { property: 'isOnSale', tagPath: 'isOnSale', value: 'true', isBoolean: true },
        ]);
        expect(result).toBe('isOnSale');
    });

    it('boolean false → !tagPath', () => {
        const result = buildVariantCondition([
            { property: 'isOnSale', tagPath: 'isOnSale', value: 'false', isBoolean: true },
        ]);
        expect(result).toBe('!isOnSale');
    });

    it('! prefixed value → tagPath != value', () => {
        const result = buildVariantCondition([
            {
                property: 'availabilityStatus',
                tagPath: 'inventory.availabilityStatus',
                value: '!OUT_OF_STOCK',
                isBoolean: false,
            },
        ]);
        expect(result).toBe('inventory.availabilityStatus != OUT_OF_STOCK');
    });

    it('"*" value → skipped from condition', () => {
        const result = buildVariantCondition([
            { property: 'quickAddType', tagPath: 'quickAddType', value: '*', isBoolean: false },
            {
                property: 'availabilityStatus',
                tagPath: 'inventory.availabilityStatus',
                value: 'OUT_OF_STOCK',
                isBoolean: false,
            },
        ]);
        expect(result).toBe('inventory.availabilityStatus == OUT_OF_STOCK');
    });

    it('expression value > 0 → tagPath > 0', () => {
        const result = buildVariantCondition([
            { property: 'count', tagPath: 'count', value: '> 0', isBoolean: false },
        ]);
        expect(result).toBe('count > 0');
    });

    it('expression value <= 0 → tagPath <= 0', () => {
        const result = buildVariantCondition([
            { property: 'count', tagPath: 'count', value: '<= 0', isBoolean: false },
        ]);
        expect(result).toBe('count <= 0');
    });

    it('expression value >= 80 → tagPath >= 80', () => {
        const result = buildVariantCondition([
            { property: 'score', tagPath: 'score', value: '>= 80', isBoolean: false },
        ]);
        expect(result).toBe('score >= 80');
    });

    it('compound with mixed == and != values', () => {
        const result = buildVariantCondition([
            {
                property: 'quickAddType',
                tagPath: 'quickAddType',
                value: 'SINGLE_OPTION',
                isBoolean: false,
            },
            {
                property: 'availabilityStatus',
                tagPath: 'inventory.availabilityStatus',
                value: '!OUT_OF_STOCK',
                isBoolean: false,
            },
        ]);
        expect(result).toBe(
            'quickAddType == SINGLE_OPTION && inventory.availabilityStatus != OUT_OF_STOCK',
        );
    });
});
