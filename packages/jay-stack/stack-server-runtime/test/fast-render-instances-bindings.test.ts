import { describe, expect, it, vi } from 'vitest';
import { phaseOutput } from '@jay-framework/fullstack-component';
import { computeForEachInstanceKey, renderFastChangingData } from '../lib';
import type { ForEachHeadlessInstance, HeadlessInstanceComponent } from '../lib';
import type { InstancePhaseData } from '../lib';

describe('renderFastChangingData prop binding resolution', () => {
    it('resolves {key.field} bindings from merged slow+fast ViewState', async () => {
        const fastRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ items: [] }, {}),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'category-products',
                contract: {
                    name: 'category-products',
                    props: [
                        { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
                    ],
                    tags: [],
                } as any,
                compDefinition: {
                    fastRender,
                    services: [],
                } as any,
            },
        ];

        const instancePhaseData: InstancePhaseData = {
            discovered: [
                {
                    contractName: 'category-products',
                    props: { categorySlug: '{p.categorySlug}' },
                    coordinate: ['category-products:AR0'],
                },
            ],
            carryForwards: {},
        };

        const mergedSlowViewState = {
            p: { categorySlug: 'bedroom' },
        };

        await renderFastChangingData(
            {},
            { language: '', url: '' },
            {},
            [],
            instancePhaseData,
            [],
            headlessInstanceComponents,
            mergedSlowViewState,
        );

        expect(fastRender).toHaveBeenCalledWith(
            expect.objectContaining({ categorySlug: 'bedroom' }),
        );
    });

    it('resolves bindings from fast-phase ViewState when slow is empty', async () => {
        const pageFastRender = vi.fn(async (props: any) =>
            phaseOutput({ p: { dynamicSlug: 'summer-sale' } }, {}),
        );

        const instanceFastRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ items: [] }, {}),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'category-products',
                contract: {
                    name: 'category-products',
                    props: [
                        { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
                    ],
                    tags: [],
                } as any,
                compDefinition: {
                    fastRender: instanceFastRender,
                    services: [],
                } as any,
            },
        ];

        const instancePhaseData: InstancePhaseData = {
            discovered: [
                {
                    contractName: 'category-products',
                    props: { categorySlug: '{p.dynamicSlug}' },
                    coordinate: ['category-products:AR0'],
                },
            ],
            carryForwards: {},
        };

        const pagePartDef = {
            compDefinition: { fastRender: pageFastRender, services: [] } as any,
            clientImport: '',
            clientPart: '',
        };

        await renderFastChangingData(
            {},
            { language: '', url: '' },
            {},
            [pagePartDef],
            instancePhaseData,
            [],
            headlessInstanceComponents,
            {},
        );

        expect(instanceFastRender).toHaveBeenCalledWith(
            expect.objectContaining({ categorySlug: 'summer-sale' }),
        );
    });

    it('resolves route param bindings in fast phase', async () => {
        const fastRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ items: [] }, {}),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'category-products',
                contract: {
                    name: 'category-products',
                    props: [
                        { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
                    ],
                    tags: [],
                } as any,
                compDefinition: {
                    fastRender,
                    services: [],
                } as any,
            },
        ];

        const instancePhaseData: InstancePhaseData = {
            discovered: [
                {
                    contractName: 'category-products',
                    props: { categorySlug: '{category}' },
                    coordinate: ['category-products:AR0'],
                },
            ],
            carryForwards: {},
        };

        await renderFastChangingData(
            { category: 'bedroom' },
            { url: '', language: '' },
            {},
            [],
            instancePhaseData,
            [],
            headlessInstanceComponents,
            {},
        );

        expect(fastRender).toHaveBeenCalledWith(
            expect.objectContaining({ categorySlug: 'bedroom' }),
        );
    });

    it('passes literal props without resolution', async () => {
        const fastRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ items: [] }, {}),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'category-products',
                contract: {
                    name: 'category-products',
                    props: [{ name: 'limit', dataType: { kind: 'primitive', name: 'number' } }],
                    tags: [],
                } as any,
                compDefinition: {
                    fastRender,
                    services: [],
                } as any,
            },
        ];

        const instancePhaseData: InstancePhaseData = {
            discovered: [
                {
                    contractName: 'category-products',
                    props: { limit: '4' },
                    coordinate: ['category-products:AR0'],
                },
            ],
            carryForwards: {},
        };

        await renderFastChangingData(
            {},
            { url: '', language: '' },
            {},
            [],
            instancePhaseData,
            [],
            headlessInstanceComponents,
            {},
        );

        expect(fastRender).toHaveBeenCalledWith(expect.objectContaining({ limit: 4 }));
    });
});

describe('renderFastChangingData forEach instances', () => {
    // DL#198 Case 1: a region inside a page-level forEach with only slowlyRender (no fastRender).
    // ForEach instances have no pre-baked slow ViewState, so slowlyRender must run per item at
    // request time and populate __headlessInstances even without a fast phase.
    it('populates a slow-only forEach instance from per-item slow render', async () => {
        const slowlyRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ heading: props.heading }, {}),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'dismiss-card',
                contract: {
                    name: 'dismiss-card',
                    props: [{ name: 'heading', dataType: { kind: 'primitive', name: 'string' } }],
                    tags: [],
                } as any,
                compDefinition: {
                    slowlyRender,
                    services: [],
                } as any,
            },
        ];

        const forEachInstances: ForEachHeadlessInstance[] = [
            {
                contractName: 'dismiss-card',
                forEachPath: 'cards',
                trackBy: 'id',
                propBindings: { heading: '{title}' },
                coordinateSuffix: 'dismiss-card:region',
            },
        ];

        const mergedSlowViewState = {
            cards: [
                { id: 'c1', title: 'Card One' },
                { id: 'c2', title: 'Card Two' },
            ],
        };

        const result = await renderFastChangingData(
            {},
            { language: '', url: '' },
            {},
            [],
            undefined,
            forEachInstances,
            headlessInstanceComponents,
            mergedSlowViewState,
        );

        expect(slowlyRender).toHaveBeenCalledWith(expect.objectContaining({ heading: 'Card One' }));
        expect(slowlyRender).toHaveBeenCalledWith(expect.objectContaining({ heading: 'Card Two' }));

        const rendered = (result as any).rendered.__headlessInstances;
        expect(rendered[computeForEachInstanceKey('c1', 'dismiss-card:region')]).toEqual({
            heading: 'Card One',
        });
        expect(rendered[computeForEachInstanceKey('c2', 'dismiss-card:region')]).toEqual({
            heading: 'Card Two',
        });
    });

    it('merges slow and fast render for a forEach instance with both phases', async () => {
        const slowlyRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ heading: props.heading }, {}),
        );
        const fastRender = vi.fn(async () => phaseOutput({ count: 3 }, {}));

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'dismiss-card',
                contract: {
                    name: 'dismiss-card',
                    props: [{ name: 'heading', dataType: { kind: 'primitive', name: 'string' } }],
                    tags: [],
                } as any,
                compDefinition: {
                    slowlyRender,
                    fastRender,
                    services: [],
                } as any,
            },
        ];

        const forEachInstances: ForEachHeadlessInstance[] = [
            {
                contractName: 'dismiss-card',
                forEachPath: 'cards',
                trackBy: 'id',
                propBindings: { heading: '{title}' },
                coordinateSuffix: 'dismiss-card:region',
            },
        ];

        const result = await renderFastChangingData(
            {},
            { language: '', url: '' },
            {},
            [],
            undefined,
            forEachInstances,
            headlessInstanceComponents,
            { cards: [{ id: 'c1', title: 'Card One' }] },
        );

        const rendered = (result as any).rendered.__headlessInstances;
        expect(rendered[computeForEachInstanceKey('c1', 'dismiss-card:region')]).toEqual({
            heading: 'Card One',
            count: 3,
        });
    });
});
