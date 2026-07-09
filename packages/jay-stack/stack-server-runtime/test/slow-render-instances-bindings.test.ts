import { describe, expect, it, vi } from 'vitest';
import { phaseOutput } from '@jay-framework/fullstack-component';
import { slowRenderInstances } from '../lib/instance-slow-render';
import type { HeadlessInstanceComponent } from '../lib/load-page-parts';

describe('slowRenderInstances prop binding resolution', () => {
    it('resolves {key.field} bindings from page ViewState before slowlyRender', async () => {
        const slowlyRender = vi.fn(async (props: Record<string, string>) =>
            phaseOutput({ ok: true }, { received: props }),
        );

        const headlessInstanceComponents: HeadlessInstanceComponent[] = [
            {
                contractName: 'category-products',
                contract: {
                    name: 'category-products',
                    props: [
                        { name: 'productId', dataType: { kind: 'primitive', name: 'string' } },
                        { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
                    ],
                    tags: [],
                } as any,
                compDefinition: {
                    slowlyRender,
                    fastRender: undefined,
                    services: [],
                } as any,
            },
        ];

        const result = await slowRenderInstances(
            [
                {
                    contractName: 'category-products',
                    props: {
                        productId: '{p._id}',
                        categorySlug: '{p.categorySlug}',
                    },
                    coordinate: ['category-products:AR0'],
                },
            ],
            headlessInstanceComponents,
            {
                pageViewState: {
                    p: { _id: 'prod-1', categorySlug: 'bedroom' },
                },
            },
        );

        expect(slowlyRender).toHaveBeenCalledWith({ productId: 'prod-1', categorySlug: 'bedroom' });
        expect(result?.instancePhaseData.discovered[0].props).toEqual({
            productId: 'prod-1',
            categorySlug: 'bedroom',
        });
    });
});
