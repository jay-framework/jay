import {
    JayPluginContext,
    JayRollupConfig,
    jayRuntime as rollupJayRuntime,
} from 'jay-rollup-plugin';
import { Plugin } from 'vite';

export function jayRuntime(jayOptions: JayRollupConfig = {}): Plugin {
    const jayContext = new JayPluginContext(jayOptions);
    return {
        enforce: 'pre',
        ...rollupJayRuntime(jayOptions, jayContext),
    };
}
