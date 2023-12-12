import { resolve } from 'path';
import Inspect from 'vite-plugin-inspect';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayRuntime } from 'rollup-plugin-jay';
import { ModuleNode, ViteDevServer } from 'vite';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
    tsConfigFilePath: resolve(root, 'tsconfig.json'),
    outputDir: 'dist/jay-runtime',
};

export default defineConfig(({ mode }) => {
    const external =
        mode === 'production' ? [] : ['jay-component', 'jay-reactive', 'jay-runtime', 'jay-secure'];

    return {
        plugins: [
            Inspect(),
            {
                enforce: 'pre',
                ...jayRuntime(jayOptions),
                handleHotUpdate({
                    file,
                    modules,
                    server,
                }: {
                    file: string;
                    modules: ModuleNode[];
                    server: ViteDevServer;
                }): ModuleNode[] {
                    if (modules.length === 0 && file.endsWith('.jay-html')) {
                        const tsFile = server.moduleGraph.getModuleById(`${file}.ts`);
                        return tsFile ? [tsFile] : [];
                    }
                    return modules;
                },
            },
        ],
        worker: {
            rollupOptions: {
                external,
            },
        },
        root,
        optimizeDeps: { entries: [] },
        build: {
            emptyOutDir: true,
            minify: false,
            target: 'es2020',
            rollupOptions: { external },
        },
    };
});
