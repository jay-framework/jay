import { describe, expect, it } from 'vitest';
import { resolveNpmPluginClientImportPath } from '../lib/load-page-parts.js';

describe('resolveNpmPluginClientImportPath', () => {
    it('maps serve entry index.js to index.client.js', () => {
        expect(
            resolveNpmPluginClientImportPath(
                '/pkg/node_modules/@jay-framework/aiditor/dist/index.js',
            ),
        ).toEqual('/pkg/node_modules/@jay-framework/aiditor/dist/index.client.js');
    });

    it('maps devOnly tools.js server entry to index.client.js for hydration', () => {
        expect(
            resolveNpmPluginClientImportPath(
                '/pkg/node_modules/@jay-framework/aiditor/dist/tools.js',
            ),
        ).toEqual('/pkg/node_modules/@jay-framework/aiditor/dist/index.client.js');
    });
});
