import { describe, it, expect, beforeEach } from 'vitest';
import {
    extractActionsFromSource,
    isActionImport,
    isActionModule,
    transformActionImports,
    clearActionMetadataCache,
} from '../lib/transform-action-imports';
import { prettify } from '@jay-framework/compiler-shared';

describe('transform-action-imports', () => {
    beforeEach(() => {
        clearActionMetadataCache();
    });

    describe('isActionModule', () => {
        it('should return true for .actions.ts files', () => {
            expect(isActionModule('cart.actions.ts')).toBe(true);
            expect(isActionModule('src/actions/cart.actions.ts')).toBe(true);
        });

        it('should return true for .actions.js files', () => {
            expect(isActionModule('cart.actions.js')).toBe(true);
        });

        it('should return false for non-action files', () => {
            expect(isActionModule('cart.ts')).toBe(false);
            expect(isActionModule('actions.ts')).toBe(false);
        });
    });

    describe('isActionImport', () => {
        it('should return true for .actions imports', () => {
            expect(isActionImport('./cart.actions')).toBe(true);
            expect(isActionImport('../actions/cart.actions')).toBe(true);
        });

        it('should return true for /actions/ path imports', () => {
            expect(isActionImport('./actions/cart')).toBe(true);
            expect(isActionImport('src/actions/cart')).toBe(true);
        });

        it('should return true for plugin action imports', () => {
            expect(isActionImport('@jay-plugin-store/actions')).toBe(true);
        });

        it('should return false for non-action imports', () => {
            expect(isActionImport('./utils/cart')).toBe(false);
            expect(isActionImport('@jay-framework/fullstack-component')).toBe(false);
        });
    });

    describe('extractActionsFromSource', () => {
        it('should extract makeJayAction with POST method', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';

                export const addToCart = makeJayAction('cart.addToCart')
                    .withHandler(async (input) => ({ success: true }));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'cart.addToCart',
                method: 'POST',
                exportName: 'addToCart',
            });
        });

        it('should extract makeJayQuery with GET method', () => {
            const source = `
                import { makeJayQuery } from '@jay-framework/fullstack-component';

                export const searchProducts = makeJayQuery('products.search')
                    .withCaching({ maxAge: 60 })
                    .withHandler(async (input) => ({ items: [] }));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'products.search',
                method: 'GET',
                exportName: 'searchProducts',
            });
        });

        it('should extract action with explicit method override', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';

                export const updateCart = makeJayAction('cart.update')
                    .withMethod('PUT')
                    .withHandler(async (input) => ({ success: true }));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0].method).toBe('PUT');
        });

        it('should extract multiple actions from same file', () => {
            const source = `
                import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';

                export const addToCart = makeJayAction('cart.addToCart')
                    .withHandler(async (input) => ({ success: true }));

                export const getCart = makeJayQuery('cart.get')
                    .withHandler(async () => ({ items: [] }));

                export const removeFromCart = makeJayAction('cart.remove')
                    .withHandler(async (input) => ({ success: true }));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(3);
            expect(actions.map((a) => a.exportName)).toEqual([
                'addToCart',
                'getCart',
                'removeFromCart',
            ]);
        });

        it('should extract makeJayStream with POST method and isStreaming flag', () => {
            const source = `
                import { makeJayStream } from '@jay-framework/fullstack-component';

                export const checkInventory = makeJayStream('inventory.check')
                    .withHandler(async function* () {
                        yield { name: 'item1' };
                    });
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'inventory.check',
                method: 'POST',
                exportName: 'checkInventory',
                isStreaming: true,
            });
        });

        it('should extract makeJayStream with services', () => {
            const source = `
                import { makeJayStream } from '@jay-framework/fullstack-component';

                export const checkInventory = makeJayStream('inventory.check')
                    .withServices(PRODUCTS_SERVICE, INVENTORY_SERVICE)
                    .withHandler(async function* (input, productsDb, inventory) {
                        yield { name: 'item1' };
                    });
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'inventory.check',
                method: 'POST',
                exportName: 'checkInventory',
                isStreaming: true,
            });
        });

        it('should extract mixed actions and streams from same file', () => {
            const source = `
                import { makeJayAction, makeJayStream } from '@jay-framework/fullstack-component';

                export const addToCart = makeJayAction('cart.addToCart')
                    .withHandler(async (input) => ({ success: true }));

                export const checkInventory = makeJayStream('inventory.check')
                    .withHandler(async function* () {
                        yield { name: 'item1' };
                    });
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(2);
            expect(actions[0]).toEqual({
                actionName: 'cart.addToCart',
                method: 'POST',
                exportName: 'addToCart',
            });
            expect(actions[1]).toEqual({
                actionName: 'inventory.check',
                method: 'POST',
                exportName: 'checkInventory',
                isStreaming: true,
            });
        });

        it('should extract makeJayAction with withFiles flag', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';

                export const uploadPhoto = makeJayAction('photos.upload')
                    .withFiles()
                    .withHandler(async (input) => ({ id: '1' }));
            `;

            const actions = extractActionsFromSource(source, 'test-files.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'photos.upload',
                method: 'POST',
                exportName: 'uploadPhoto',
                acceptsFiles: true,
            });
        });

        it('should extract makeJayStream with withFiles flag', () => {
            const source = `
                import { makeJayStream } from '@jay-framework/fullstack-component';

                export const submitTask = makeJayStream('aiditor.submitTask')
                    .withFiles({ maxFileSize: 5000000 })
                    .withServices(AGENT_SERVICE)
                    .withHandler(async function* (input, agent) {
                        yield { status: 'done' };
                    });
            `;

            const actions = extractActionsFromSource(source, 'test-stream-files.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0]).toEqual({
                actionName: 'aiditor.submitTask',
                method: 'POST',
                exportName: 'submitTask',
                isStreaming: true,
                acceptsFiles: true,
            });
        });

        it('should ignore non-exported actions', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';

                const internalAction = makeJayAction('internal')
                    .withHandler(async () => ({}));

                export const publicAction = makeJayAction('public')
                    .withHandler(async () => ({}));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0].exportName).toBe('publicAction');
        });

        it('should extract action with services', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';
                import { CART_SERVICE } from '../services';

                export const addToCart = makeJayAction('cart.addToCart')
                    .withServices(CART_SERVICE)
                    .withHandler(async (input, cartService) => ({ success: true }));
            `;

            const actions = extractActionsFromSource(source, 'test.ts');

            expect(actions).toHaveLength(1);
            expect(actions[0].actionName).toBe('cart.addToCart');
        });

        it('should cache results', () => {
            const source = `
                import { makeJayAction } from '@jay-framework/fullstack-component';
                export const action = makeJayAction('test').withHandler(async () => ({}));
            `;

            const first = extractActionsFromSource(source, 'cached.ts');
            const second = extractActionsFromSource(source, 'cached.ts');

            expect(first).toBe(second); // Same reference (cached)
        });
    });

    describe('transformActionImports', () => {
        const mockActionSource = `
            import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';

            export const addToCart = makeJayAction('cart.addToCart')
                .withHandler(async (input) => ({ success: true }));

            export const searchProducts = makeJayQuery('products.search')
                .withCaching({ maxAge: 60 })
                .withHandler(async (input) => ({ items: [] }));
        `;

        const mockResolveModule = async (importSource: string, _importer: string) => {
            if (importSource.includes('.actions') || importSource.includes('/actions/')) {
                return { path: '/test/cart.actions.ts', code: mockActionSource };
            }
            return null;
        };

        it('should transform action imports to createActionCaller', async () => {
            const source = `
                import { addToCart, searchProducts } from './actions/cart.actions';

                async function handleClick() {
                    await addToCart({ productId: '123' });
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockResolveModule);

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller } from '@jay-framework/stack-client-runtime';

                const addToCart = createActionCaller('cart.addToCart', 'POST');
                const searchProducts = createActionCaller('products.search', 'GET');

                async function handleClick() {
                    await addToCart({ productId: '123' });
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should preserve non-action imports', async () => {
            const source = `
                import { Component } from 'react';
                import { addToCart } from './actions/cart.actions';

                export function Page() {
                    return null;
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockResolveModule);

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller } from '@jay-framework/stack-client-runtime';

                import { Component } from 'react';
                const addToCart = createActionCaller('cart.addToCart', 'POST');

                export function Page() {
                    return null;
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should return null for files without action imports', async () => {
            const source = `
                import { useState } from 'react';

                export function Component() {
                    const count = useState(0);
                    return count;
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockResolveModule);

            expect(result).toBeNull();
        });

        it('should handle single action import', async () => {
            const source = `
                import { addToCart } from '../actions/cart.actions';

                await addToCart({ productId: '123' });
            `;

            const result = await transformActionImports(
                source,
                '/test/nested/page.ts',
                mockResolveModule,
            );

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller } from '@jay-framework/stack-client-runtime';

                const addToCart = createActionCaller('cart.addToCart', 'POST');

                await addToCart({ productId: '123' });
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should transform stream imports to createStreamCaller', async () => {
            const streamActionSource = `
                import { makeJayStream } from '@jay-framework/fullstack-component';

                export const checkInventory = makeJayStream('inventory.check')
                    .withServices(PRODUCTS_SERVICE)
                    .withHandler(async function* (input, productsDb) {
                        yield { name: 'item1' };
                    });
            `;

            const mockStreamResolve = async (importSource: string, _importer: string) => {
                if (importSource.includes('.actions') || importSource.includes('/actions/')) {
                    return { path: '/test/inventory.actions.ts', code: streamActionSource };
                }
                return null;
            };

            const source = `
                import { checkInventory } from './actions/inventory-check.actions';

                async function run() {
                    for await (const chunk of checkInventory({})) {
                        console.log(chunk);
                    }
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockStreamResolve);

            expect(result).not.toBeNull();

            const expected = `
                import { createStreamCaller } from '@jay-framework/stack-client-runtime';

                const checkInventory = createStreamCaller('inventory.check');

                async function run() {
                    for await (const chunk of checkInventory({})) {
                        console.log(chunk);
                    }
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should transform mixed action and stream imports', async () => {
            const mixedSource = `
                import { makeJayAction, makeJayStream } from '@jay-framework/fullstack-component';

                export const addToCart = makeJayAction('cart.addToCart')
                    .withHandler(async (input) => ({ success: true }));

                export const checkInventory = makeJayStream('inventory.check')
                    .withHandler(async function* () {
                        yield { name: 'item1' };
                    });
            `;

            const mockMixedResolve = async (importSource: string, _importer: string) => {
                if (importSource.includes('.actions') || importSource.includes('/actions/')) {
                    return { path: '/test/mixed.actions.ts', code: mixedSource };
                }
                return null;
            };

            const source = `
                import { addToCart, checkInventory } from './actions/shop.actions';

                async function run() {
                    await addToCart({ productId: '1' });
                    for await (const chunk of checkInventory({})) {
                        console.log(chunk);
                    }
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockMixedResolve);

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller, createStreamCaller } from '@jay-framework/stack-client-runtime';

                const addToCart = createActionCaller('cart.addToCart', 'POST');
                const checkInventory = createStreamCaller('inventory.check');

                async function run() {
                    await addToCart({ productId: '1' });
                    for await (const chunk of checkInventory({})) {
                        console.log(chunk);
                    }
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should transform withFiles action to createActionCaller with acceptsFiles option', async () => {
            const filesActionSource = `
                import { makeJayAction } from '@jay-framework/fullstack-component';

                export const uploadPhoto = makeJayAction('photos.upload')
                    .withFiles()
                    .withHandler(async (input) => ({ id: '1' }));
            `;

            const mockFilesResolve = async (importSource: string, _importer: string) => {
                if (importSource.includes('.actions') || importSource.includes('/actions/')) {
                    return { path: '/test/upload.actions.ts', code: filesActionSource };
                }
                return null;
            };

            const source = `
                import { uploadPhoto } from './actions/upload.actions';

                async function run() {
                    await uploadPhoto({ file: someFile });
                }
            `;

            const result = await transformActionImports(source, '/test/page.ts', mockFilesResolve);

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller } from '@jay-framework/stack-client-runtime';

                const uploadPhoto = createActionCaller('photos.upload', 'POST', { acceptsFiles: true });

                async function run() {
                    await uploadPhoto({ file: someFile });
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should transform withFiles stream to createStreamCaller with acceptsFiles option', async () => {
            const filesStreamSource = `
                import { makeJayStream } from '@jay-framework/fullstack-component';

                export const submitTask = makeJayStream('aiditor.submitTask')
                    .withFiles()
                    .withHandler(async function* (input) {
                        yield { status: 'done' };
                    });
            `;

            const mockStreamFilesResolve = async (importSource: string, _importer: string) => {
                if (importSource.includes('.actions') || importSource.includes('/actions/')) {
                    return { path: '/test/task.actions.ts', code: filesStreamSource };
                }
                return null;
            };

            const source = `
                import { submitTask } from './actions/task.actions';

                async function run() {
                    for await (const chunk of submitTask({ screenshots: [file1] })) {
                        console.log(chunk);
                    }
                }
            `;

            const result = await transformActionImports(
                source,
                '/test/page.ts',
                mockStreamFilesResolve,
            );

            expect(result).not.toBeNull();

            const expected = `
                import { createStreamCaller } from '@jay-framework/stack-client-runtime';

                const submitTask = createStreamCaller('aiditor.submitTask', { acceptsFiles: true });

                async function run() {
                    for await (const chunk of submitTask({ screenshots: [file1] })) {
                        console.log(chunk);
                    }
                }
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });

        it('should transform plugin component that imports actions from same plugin', async () => {
            const pluginActionSource = `
                import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';

                export const submitRating = makeJayAction('rating.submit')
                    .withHandler(async (input) => ({ success: true }));

                export const getRatings = makeJayQuery('rating.get')
                    .withCaching({ maxAge: 60 })
                    .withHandler(async (input) => ({ ratings: [] }));
            `;

            const mockPluginResolve = async (importSource: string, _importer: string) => {
                if (importSource.includes('rating.actions')) {
                    return { path: '/plugin/rating.actions.ts', code: pluginActionSource };
                }
                return null;
            };

            // Plugin component importing actions from same plugin
            const source = `
                import { makeJayStackComponent } from '@jay-framework/fullstack-component';
                import { submitRating, getRatings } from './rating.actions';

                export const ratingWidget = makeJayStackComponent()
                    .withInteractive((props, refs) => {
                        refs.submitBtn.onclick(async () => {
                            await submitRating({ rating: 5 });
                        });
                    });
            `;

            const result = await transformActionImports(
                source,
                '/plugin/rating-widget.ts',
                mockPluginResolve,
            );

            expect(result).not.toBeNull();

            const expected = `
                import { createActionCaller } from '@jay-framework/stack-client-runtime';

                import { makeJayStackComponent } from '@jay-framework/fullstack-component';
                const submitRating = createActionCaller('rating.submit', 'POST');
                const getRatings = createActionCaller('rating.get', 'GET');

                export const ratingWidget = makeJayStackComponent()
                    .withInteractive((props, refs) => {
                        refs.submitBtn.onclick(async () => {
                            await submitRating({ rating: 5 });
                        });
                    });
            `;

            expect(await prettify(result!.code)).toEqual(await prettify(expected));
        });
    });
});
