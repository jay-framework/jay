import { describe, expect, it, vi } from 'vitest';
import { phaseOutput } from '@jay-framework/fullstack-component';
import { slowRenderInstances } from '../lib';
import type { HeadlessInstanceComponent } from '../lib';

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

        // slowlyRender still receives values resolved against the slow scope.
        expect(slowlyRender).toHaveBeenCalledWith({ productId: 'prod-1', categorySlug: 'bedroom' });

        // DL#189 — discovered props keep the RAW bindings (names normalized, values
        // unresolved) so the fast phase can re-resolve each prop at its own phase against
        // the merged slow+fast scope, rather than baking slow-resolved literals.
        expect(result?.instancePhaseData.discovered[0].props).toEqual({
            productId: '{p._id}',
            categorySlug: '{p.categorySlug}',
        });
    });
});
