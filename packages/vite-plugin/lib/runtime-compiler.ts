import { JayRollupConfig, jayRuntime as rollupJayRuntime } from 'rollup-plugin-jay';
import { handleHotUpdate } from './hot-update';
import { Plugin } from 'vite';

export function jayRuntime(jayOptions: JayRollupConfig = {}): Plugin {
    return {
        enforce: 'pre',
        handleHotUpdate,
        ...rollupJayRuntime(jayOptions),
    };
}
