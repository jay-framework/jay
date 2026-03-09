import { jayRuntime, JayRollupConfig } from '../../../lib';

describe('source-ids configResolved auto-enable', () => {
    function getConfigResolvedHook(jayOptions: JayRollupConfig) {
        const plugin = jayRuntime(jayOptions);
        return (plugin as any).configResolved as (config: Record<string, unknown>) => void;
    }

    it('auto-enables injectSourceIds in Vite serve mode when undefined', () => {
        const jayOptions: JayRollupConfig = {};
        const configResolved = getConfigResolvedHook(jayOptions);

        configResolved({ command: 'serve' });

        expect(jayOptions.injectSourceIds).toBe(true);
    });

    it('does NOT auto-enable injectSourceIds in Vite build mode', () => {
        const jayOptions: JayRollupConfig = {};
        const configResolved = getConfigResolvedHook(jayOptions);

        configResolved({ command: 'build' });

        expect(jayOptions.injectSourceIds).toBeUndefined();
    });

    it('respects explicit injectSourceIds: false in serve mode', () => {
        const jayOptions: JayRollupConfig = { injectSourceIds: false };
        const configResolved = getConfigResolvedHook(jayOptions);

        configResolved({ command: 'serve' });

        expect(jayOptions.injectSourceIds).toBe(false);
    });

    it('respects explicit injectSourceIds: true in build mode', () => {
        const jayOptions: JayRollupConfig = { injectSourceIds: true };
        const configResolved = getConfigResolvedHook(jayOptions);

        configResolved({ command: 'build' });

        expect(jayOptions.injectSourceIds).toBe(true);
    });
});
