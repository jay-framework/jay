import { describe, it, expect } from 'vitest';
import { RenderPipeline } from '../lib/render-pipeline';

describe('RenderPipeline', () => {
    // Test ViewState and CarryForward types for type checking
    interface TestViewState {
        name: string;
        value: number;
    }
    interface TestCarryForward {
        id: string;
    }

    describe('Pipeline Factory', () => {
        it('should create a pipeline with ok()', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok({ data: 'test' }).toPhaseOutput((value) => ({
                viewState: { name: value.data, value: 42 },
                carryForward: { id: '123' },
            }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('test');
                expect(result.rendered.value).toBe(42);
                expect(result.carryForward.id).toBe('123');
            }
        });

        it('should create a pipeline with try() for sync function', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.try(() => ({ data: 'sync' })).toPhaseOutput((value) => ({
                viewState: { name: value.data, value: 1 },
                carryForward: { id: 'sync-id' },
            }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('sync');
            }
        });

        it('should create a pipeline with try() for async function', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.try(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { data: 'async' };
            }).toPhaseOutput((value) => ({
                viewState: { name: value.data, value: 2 },
                carryForward: { id: 'async-id' },
            }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('async');
            }
        });

        it('should create error pipelines', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();

            const notFoundResult = await Pipeline.notFound('Not found', {
                resource: 'test',
            }).toPhaseOutput(() => ({
                viewState: { name: '', value: 0 },
                carryForward: { id: '' },
            }));
            expect(notFoundResult.kind).toBe('ClientError');
            if (notFoundResult.kind === 'ClientError') {
                expect(notFoundResult.status).toBe(404);
                expect(notFoundResult.message).toBe('Not found');
                expect(notFoundResult.details?.resource).toBe('test');
            }

            const serverErrorResult = await Pipeline.serverError(
                503,
                'Service unavailable',
            ).toPhaseOutput(() => ({
                viewState: { name: '', value: 0 },
                carryForward: { id: '' },
            }));
            expect(serverErrorResult.kind).toBe('ServerError');
            if (serverErrorResult.kind === 'ServerError') {
                expect(serverErrorResult.status).toBe(503);
                expect(serverErrorResult.message).toBe('Service unavailable');
            }

            const redirectResult = await Pipeline.redirect(301, '/new-location').toPhaseOutput(
                () => ({
                    viewState: { name: '', value: 0 },
                    carryForward: { id: '' },
                }),
            );
            expect(redirectResult.kind).toBe('Redirect');
            if (redirectResult.kind === 'Redirect') {
                expect(redirectResult.status).toBe(301);
                expect(redirectResult.location).toBe('/new-location');
            }
        });
    });

    describe('map()', () => {
        it('should transform values with sync function', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok(5)
                .map((x) => x * 2)
                .map((x) => ({ doubled: x }))
                .toPhaseOutput((value) => ({
                    viewState: { name: 'result', value: value.doubled },
                    carryForward: { id: 'test' },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.value).toBe(10);
            }
        });

        it('should transform values with async function', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok(5)
                .map(async (x) => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return x * 3;
                })
                .toPhaseOutput((value) => ({
                    viewState: { name: 'async-result', value },
                    carryForward: { id: 'async-test' },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.value).toBe(15);
            }
        });

        it('should handle conditional errors in map', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok<number | null>(null)
                .map((x) => (x !== null ? x * 2 : Pipeline.notFound('Value is null')))
                .toPhaseOutput((value) => ({
                    viewState: { name: 'result', value },
                    carryForward: { id: 'test' },
                }));

            expect(result.kind).toBe('ClientError');
            if (result.kind === 'ClientError') {
                expect(result.status).toBe(404);
                expect(result.message).toBe('Value is null');
            }
        });

        it('should pass through errors', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.notFound('Original error')
                .map((x: number) => x * 2) // This should not be called
                .map((x) => x + 1) // This should not be called either
                .toPhaseOutput((value) => ({
                    viewState: { name: 'result', value },
                    carryForward: { id: 'test' },
                }));

            expect(result.kind).toBe('ClientError');
            if (result.kind === 'ClientError') {
                expect(result.status).toBe(404);
                expect(result.message).toBe('Original error');
            }
        });

        it('should chain multiple async operations', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok(1)
                .map(async (x) => x + 1) // 2
                .map(async (x) => x * 2) // 4
                .map(async (x) => x + 10) // 14
                .toPhaseOutput((value) => ({
                    viewState: { name: 'chained', value },
                    carryForward: { id: 'chain-test' },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.value).toBe(14);
            }
        });
    });

    describe('recover()', () => {
        it('should recover from errors', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.notFound('Not found')
                .recover(() => Pipeline.ok({ fallback: true }))
                .toPhaseOutput((value) => ({
                    viewState: { name: value.fallback ? 'recovered' : 'original', value: 0 },
                    carryForward: { id: 'recovery' },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('recovered');
            }
        });

        it('should pass error to recovery function', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            let capturedError: Error | null = null;

            await Pipeline.serverError(503, 'Service down')
                .recover((error) => {
                    capturedError = error;
                    return Pipeline.ok({ recovered: true });
                })
                .toPhaseOutput((value) => ({
                    viewState: { name: 'test', value: 0 },
                    carryForward: { id: 'test' },
                }));

            expect(capturedError).not.toBeNull();
            expect(capturedError!.message).toContain('Service down');
        });

        it('should recover from async errors', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.try(async () => {
                throw new Error('Async failure');
            })
                .recover((error) => Pipeline.ok({ errorMessage: error.message }))
                .toPhaseOutput((value) => ({
                    viewState: { name: value.errorMessage, value: 0 },
                    carryForward: { id: 'async-recovery' },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('Async failure');
            }
        });

        it('should not affect successful pipelines', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            let recoveryCalled = false;

            const result = await Pipeline.ok({ original: true })
                .recover(() => {
                    recoveryCalled = true;
                    return Pipeline.ok({ recovered: true });
                })
                .toPhaseOutput((value) => ({
                    viewState: { name: 'original' in value ? 'original' : 'recovered', value: 0 },
                    carryForward: { id: 'test' },
                }));

            expect(recoveryCalled).toBe(false);
            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.name).toBe('original');
            }
        });
    });

    describe('toPhaseOutput()', () => {
        it('should produce PhaseOutput for success', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.ok({
                id: '123',
                name: 'Test',
                extra: 'data',
            }).toPhaseOutput((value) => ({
                viewState: { name: value.name, value: 42 },
                carryForward: { id: value.id },
            }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered).toEqual({ name: 'Test', value: 42 });
                expect(result.carryForward).toEqual({ id: '123' });
            }
        });

        it('should return error for failed pipelines', async () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            const result = await Pipeline.forbidden('Access denied').toPhaseOutput(() => ({
                viewState: { name: '', value: 0 },
                carryForward: { id: '' },
            }));

            expect(result.kind).toBe('ClientError');
            if (result.kind === 'ClientError') {
                expect(result.status).toBe(403);
                expect(result.message).toBe('Access denied');
            }
        });
    });

    describe('Complex scenarios', () => {
        it('should handle product page scenario', async () => {
            interface Product {
                id: string;
                name: string;
                price: number;
                inventoryItemId: string;
            }

            interface ProductViewState {
                name: string;
                price: number;
            }

            interface ProductCarryForward {
                productId: string;
                inventoryItemId: string;
            }

            const Pipeline = RenderPipeline.for<ProductViewState, ProductCarryForward>();

            // Simulate fetching a product
            const fetchProduct = async (slug: string): Promise<Product | null> => {
                if (slug === 'valid-product') {
                    return {
                        id: 'prod-123',
                        name: 'Test Product',
                        price: 29.99,
                        inventoryItemId: 'inv-456',
                    };
                }
                return null;
            };

            // Test successful case
            const successResult = await Pipeline.try(() => fetchProduct('valid-product'))
                .map((product) => (product ? product : Pipeline.notFound('Product not found')))
                .toPhaseOutput((product) => ({
                    viewState: { name: product.name, price: product.price },
                    carryForward: {
                        productId: product.id,
                        inventoryItemId: product.inventoryItemId,
                    },
                }));

            expect(successResult.kind).toBe('PhaseOutput');
            if (successResult.kind === 'PhaseOutput') {
                expect(successResult.rendered.name).toBe('Test Product');
                expect(successResult.rendered.price).toBe(29.99);
                expect(successResult.carryForward.productId).toBe('prod-123');
            }

            // Test not found case
            const notFoundResult = await Pipeline.try(() => fetchProduct('invalid-product'))
                .map((product) => (product ? product : Pipeline.notFound('Product not found')))
                .toPhaseOutput((product) => ({
                    viewState: { name: product.name, price: product.price },
                    carryForward: {
                        productId: product.id,
                        inventoryItemId: product.inventoryItemId,
                    },
                }));

            expect(notFoundResult.kind).toBe('ClientError');
            if (notFoundResult.kind === 'ClientError') {
                expect(notFoundResult.status).toBe(404);
            }
        });

        it('should handle multiple sequential async operations', async () => {
            interface UserViewState {
                userName: string;
                orderCount: number;
            }

            interface UserCarryForward {
                userId: string;
            }

            const Pipeline = RenderPipeline.for<UserViewState, UserCarryForward>();

            const fetchUser = async (id: string) => ({ id, name: 'John' });
            const fetchOrders = async (userId: string) => [{ id: '1' }, { id: '2' }, { id: '3' }];

            const result = await Pipeline.try(() => fetchUser('user-123'))
                .map(async (user) => {
                    const orders = await fetchOrders(user.id);
                    return { user, orders };
                })
                .toPhaseOutput(({ user, orders }) => ({
                    viewState: { userName: user.name, orderCount: orders.length },
                    carryForward: { userId: user.id },
                }));

            expect(result.kind).toBe('PhaseOutput');
            if (result.kind === 'PhaseOutput') {
                expect(result.rendered.userName).toBe('John');
                expect(result.rendered.orderCount).toBe(3);
                expect(result.carryForward.userId).toBe('user-123');
            }
        });
    });

    describe('Utility methods', () => {
        it('isOk() should return true for success', () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            expect(Pipeline.ok('test').isOk()).toBe(true);
            expect(Pipeline.notFound().isOk()).toBe(false);
        });

        it('isError() should return true for errors', () => {
            const Pipeline = RenderPipeline.for<TestViewState, TestCarryForward>();
            expect(Pipeline.ok('test').isError()).toBe(false);
            expect(Pipeline.notFound().isError()).toBe(true);
            expect(Pipeline.serverError(500).isError()).toBe(true);
            expect(Pipeline.redirect(301, '/').isError()).toBe(true);
        });
    });
});
