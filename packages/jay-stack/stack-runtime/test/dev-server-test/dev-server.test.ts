import {DevServerOptions, mkDevServer} from '../../lib';
import { JayRollupConfig } from 'vite-plugin-jay';
import path from 'path';

// this statement is required to tell vitest to load the right encodeUTF8("") instanceof Uint8Array
// @see https://github.com/vitest-dev/vitest/issues/4043
// @vitest-environment node

describe('dev server', () => {
    const baseOptions = {
        serverBase: '/',
        pagesBase: path.resolve(__dirname, './'),
        jayRollupConfig: {
            tsConfigFilePath: path.resolve(__dirname, '../../../tsconfig.json')
        } as JayRollupConfig,
        dontCacheSlowly: true
    };

    function optionsForDir(directory: string): DevServerOptions {
        return {
            ...baseOptions,
            pagesBase: path.resolve(__dirname, directory)
        }
    }

    it('should handle a simple jay-html file without code', async () => {
        const devServer = await mkDevServer(optionsForDir('./simple-page'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');
        await devServer.viteServer.close();
    });

    it('should handle a jay-html file with code', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-code'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');
        await devServer.viteServer.close();
    });

    it('should handle a jay-html file with headless component', async () => {
        const devServer = await mkDevServer(optionsForDir('./page-with-headless'))
        expect(devServer.routes).toHaveLength(1);
        expect(devServer.routes[0].path).toBe('/');
        await devServer.viteServer.close();
    });
}); 