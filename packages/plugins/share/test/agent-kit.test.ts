import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { shareAgentKit } from '../lib/agent-kit';
import { linkedSite, REPO_URL } from './harness';

describe('share agent-kit handler (DL221)', () => {
    it('lists the shared folders in agent-kit/references/share/shared-plugins.yaml', async () => {
        const { sandbox, sha } = await linkedSite();
        const referencesDir = path.join(sandbox.site, 'agent-kit/references/share');
        const result = await shareAgentKit({
            pluginName: 'share',
            projectRoot: sandbox.site,
            referencesDir,
            services: new Map(),
            force: false,
        });
        expect(result.agentKitCreated).toEqual(['agent-kit/references/share/shared-plugins.yaml']);
        const written = YAML.parse(
            fs.readFileSync(path.join(referencesDir, 'shared-plugins.yaml'), 'utf-8'),
        );
        expect(written.plugins).toEqual([
            { folder: 'brand-ds', repo: REPO_URL, ref: 'main', commit: sha },
        ]);
    });
});
