import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        minify: false,
        target: 'es2020',
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            name: 'figmaAdapter',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                '@jay-framework/dev-server',
                '@jay-framework/figma-interchange'
            ],
        },
    },
    test: {
        globals: true,
        environment: 'node',
    },
});

