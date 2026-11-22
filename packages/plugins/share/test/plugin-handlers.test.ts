import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultPluginHandlers } from '../lib/core/plugin-handlers';
import { createSandbox } from './harness';

/** Real path: the core starts its own Vite server to load a local `./setup.ts`, then closes it. */
describe('setup + agent-kit after link/pull/restore (DL#237)', () => {
    async function runFixture(kind: string) {
        const sandbox = createSandbox();
        fs.writeFileSync(
            path.join(sandbox.site, 'tsconfig.json'),
            JSON.stringify({ compilerOptions: { module: 'esnext' } }),
        );
        sandbox.copyFixturePlugin(`setup-${kind}`, `setup-${kind}`);
        const result = await defaultPluginHandlers.runSetupAndAgentKit(
            sandbox.site,
            `setup-${kind}`,
        );
        return { sandbox, result };
    }

    it('reports none for a plugin without a setup handler', async () => {
        const sandbox = createSandbox();
        fs.writeFileSync(path.join(sandbox.site, 'tsconfig.json'), '{}');
        sandbox.copyFixturePlugin('brand-ds');
        expect(await defaultPluginHandlers.runSetupAndAgentKit(sandbox.site, 'brand-ds')).toEqual({
            setup: 'none',
        });
    });

    it('runs a ./setup.ts handler (configured) and the agent-kit handler', async () => {
        const { sandbox, result } = await runFixture('configured');
        expect(result).toEqual({ setup: 'configured', setupMessage: 'config written' });
        expect(
            fs.existsSync(path.join(sandbox.site, 'agent-kit-ran-setup-configured.txt')),
        ).toEqual(true);
    });

    it('maps needs-config', async () => {
        const { result } = await runFixture('needs-config');
        expect(result).toEqual({ setup: 'needs-config', setupMessage: 'fill config/x.yaml' });
    });

    it('maps a throwing handler to error', async () => {
        const { result } = await runFixture('error');
        expect(result).toEqual({ setup: 'error', setupMessage: 'boom' });
    });

    it('maps a prompt to needs-answer with the question, never prompting', async () => {
        const { result } = await runFixture('needs-answer');
        expect(result).toMatchObject({
            setup: 'needs-answer',
            setupQuestion: {
                key: 'region',
                type: 'select',
                message: 'Which region?',
                choices: [{ name: 'EU', value: 'eu' }],
            },
        });
    });
});
