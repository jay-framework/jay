import { describe, expect, it, vi } from 'vitest';
import { phaseOutput } from '@jay-framework/fullstack-component';
import { renderFastChangingData } from '../lib';
import type { HeadlessInstanceComponent } from '../lib';
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
            { language:'', url: '' },
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
            { language:'', url: '' },
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
                    props: [
                        { name: 'limit', dataType: { kind: 'primitive', name: 'number' } },
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

        expect(fastRender).toHaveBeenCalledWith(
            expect.objectContaining({ limit: '4' }),
        );
    });
});
