import { describe, it, expect } from 'vitest';
import { createRoute } from '@jay-framework/stack-route-scanner';
import { resolveClientImportPath } from '../lib';

/**
 * DL#182 — the browser hydration import must always target the plugin's browser-safe `./client`
 * bundle, never the SSR server bundle (`./tools` for devOnly routes, `.` otherwise).
 */
describe('resolveClientImportPath', () => {
    it('uses clientCompPath for a devOnly plugin route (compPath is tools.js)', () => {
        const route = createRoute(
            '/aiditor',
            '/node_modules/@jay-framework/aiditor/dist/pages/aiditor/page.jay-html',
            '/node_modules/@jay-framework/aiditor/dist/tools.js',
            'aiditorPage',
            {
                devOnly: true,
                clientCompPath: '/node_modules/@jay-framework/aiditor/dist/index.client.js',
            },
        );
        expect(resolveClientImportPath(route)).toEqual(
            '/node_modules/@jay-framework/aiditor/dist/index.client.js',
        );
    });

    it('uses clientCompPath for a non-devOnly plugin route (compPath is index.js)', () => {
        const route = createRoute(
            '/plugin-page',
            '/node_modules/@jay-framework/plugin/dist/pages/page.jay-html',
            '/node_modules/@jay-framework/plugin/dist/index.js',
            'pluginPage',
            { clientCompPath: '/node_modules/@jay-framework/plugin/dist/index.client.js' },
        );
        expect(resolveClientImportPath(route)).toEqual(
            '/node_modules/@jay-framework/plugin/dist/index.client.js',
        );
    });

    it('falls back to the index.js→index.client.js rewrite when no clientCompPath is set', () => {
        const route = createRoute(
            '/plugin-page',
            '/node_modules/@jay-framework/plugin/dist/pages/page.jay-html',
            '/node_modules/@jay-framework/plugin/dist/index.js',
            'pluginPage',
        );
        expect(resolveClientImportPath(route)).toEqual(
            '/node_modules/@jay-framework/plugin/dist/index.client.js',
        );
    });

    it('hydrates a local (project) component directly from compPath', () => {
        const route = createRoute(
            '/products',
            '/src/pages/products/page.jay-html',
            '/src/pages/products/page.ts',
        );
        expect(resolveClientImportPath(route)).toEqual('/src/pages/products/page.ts');
    });
});
