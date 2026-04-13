import { describe, it, expect } from 'vitest';
import { checkComponentPropsAndParams } from '../lib/check-component-contract';

describe('checkComponentPropsAndParams', () => {
    describe('props detection', () => {
        it('should detect missing contract props when component uses .withProps<T>()', () => {
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';

                export interface WidgetProps {
                    itemId: string;
                }

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<WidgetProps>()
                    .withSlowlyRender(async (props: WidgetProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toEqual(
                '[widget] component uses .withProps<WidgetProps>() with properties [itemId] ' +
                    'but the contract does not declare any props',
            );
        });

        it('should detect individual missing prop names', () => {
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';

                export interface WidgetProps {
                    itemId: string;
                    color: string;
                }

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<WidgetProps>()
                    .withSlowlyRender(async (props: WidgetProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                {
                    props: [{ name: 'itemId', required: true }],
                    params: undefined,
                },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toEqual(
                '[widget] component prop "color" (from WidgetProps) is not declared in the contract',
            );
        });

        it('should pass when all props match', () => {
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';

                export interface WidgetProps {
                    itemId: string;
                }

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<WidgetProps>()
                    .withSlowlyRender(async (props: WidgetProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                {
                    props: [{ name: 'itemId', required: true }],
                    params: undefined,
                },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });

        it('should skip PageProps (framework type)', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<PageProps>()
                    .withSlowlyRender(async (props: PageProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(0);
        });

        it('should handle intersection types — extract non-PageProps parts', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';

                export interface MyParams {
                    slug: string;
                }

                export const page = makeJayStackComponent<PageContract>()
                    .withProps<PageProps & MyParams>()
                    .withSlowlyRender(async (props: PageProps & MyParams) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                {
                    props: [{ name: 'slug', required: true }],
                    params: undefined,
                },
                'page',
                'page.jay-contract',
                'page.ts',
            );

            expect(result.errors).toHaveLength(0);
        });

        it('should skip types imported from the contract', () => {
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';
                import type { WidgetContract, WidgetProps } from './widget.jay-contract';

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<WidgetProps>()
                    .withSlowlyRender(async (props: WidgetProps) => ({}));
            `;

            // WidgetProps comes from the contract, so it matches by definition
            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(0);
        });

        it('should warn when contract declares prop not in component interface', () => {
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';

                export interface WidgetProps {
                    itemId: string;
                }

                export const widget = makeJayStackComponent<WidgetContract>()
                    .withProps<WidgetProps>()
                    .withSlowlyRender(async (props: WidgetProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                {
                    props: [
                        { name: 'itemId', required: true },
                        { name: 'color', required: false },
                    ],
                    params: undefined,
                },
                'widget',
                'widget.jay-contract',
                'widget.ts',
            );

            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].message).toEqual(
                '[widget] contract declares prop "color" but the component\'s WidgetProps interface does not include it',
            );
        });
    });

    describe('params detection', () => {
        it('should detect missing contract params when component uses .withLoadParams()', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';

                export const page = makeJayStackComponent<PageContract>()
                    .withProps<PageProps>()
                    .withLoadParams(loadParams)
                    .withSlowlyRender(async (props: PageProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'page',
                'page.jay-contract',
                'page.ts',
            );

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toEqual(
                '[page] component uses .withLoadParams() but the contract does not declare any params',
            );
        });

        it('should pass when contract has params and component uses .withLoadParams()', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';

                export const page = makeJayStackComponent<PageContract>()
                    .withProps<PageProps>()
                    .withLoadParams(loadParams)
                    .withSlowlyRender(async (props: PageProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                {
                    props: undefined,
                    params: [{ name: 'slug' }],
                },
                'page',
                'page.jay-contract',
                'page.ts',
            );

            expect(result.errors).toHaveLength(0);
        });

        it('should not require params when component does not use .withLoadParams()', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';

                export const page = makeJayStackComponent<PageContract>()
                    .withProps<PageProps>()
                    .withSlowlyRender(async (props: PageProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'page',
                'page.jay-contract',
                'page.ts',
            );

            expect(result.errors).toHaveLength(0);
        });
    });

    describe('no component builder', () => {
        it('should not error when file has no makeJayStackComponent', () => {
            const source = `
                export const helper = { foo: 'bar' };
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'test',
                'test.jay-contract',
                'test.ts',
            );

            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });
    });

    describe('real-world patterns', () => {
        it('should detect wix-stores-v1 product-page pattern (withLoadParams, no contract params)', () => {
            const source = `
                import { makeJayStackComponent, PageProps, UrlParams } from '@jay-framework/fullstack-component';
                import type { ProductPageContract } from './product-page.jay-contract';

                export interface ProductPageParams extends UrlParams {
                    slug: string;
                }

                async function* loadProductParams(): AsyncIterable<ProductPageParams[]> {
                    yield [{ slug: 'test' }];
                }

                export const productPage = makeJayStackComponent<ProductPageContract>()
                    .withProps<PageProps>()
                    .withLoadParams(loadProductParams)
                    .withSlowlyRender(async (props: PageProps & ProductPageParams) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'product-page',
                'product-page.jay-contract',
                'product-page.ts',
            );

            // Should flag: .withLoadParams() used but contract has no params
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toEqual(
                '[product-page] component uses .withLoadParams() but the contract does not declare any params',
            );
        });

        it('should detect wix-stores product-card pattern (custom props, no contract props)', () => {
            const source = `
                import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
                import type { ProductCardContract } from './product-card.jay-contract';

                export interface ProductCardProps {
                    productId: string;
                }

                export const productCard = makeJayStackComponent<ProductCardContract>()
                    .withProps<ProductCardProps>()
                    .withSlowlyRender(async (props: ProductCardProps) => ({}));
            `;

            const result = checkComponentPropsAndParams(
                source,
                { props: undefined, params: undefined },
                'product-card',
                'product-card.jay-contract',
                'product-card.ts',
            );

            // Should flag: .withProps<ProductCardProps>() but contract has no props
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].message).toEqual(
                '[product-card] component uses .withProps<ProductCardProps>() with properties [productId] ' +
                    'but the contract does not declare any props',
            );
        });
    });
});
