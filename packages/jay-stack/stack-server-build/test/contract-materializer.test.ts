import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { materializeContracts, listContracts } from '../lib';

describe('contract-materializer plugins-index keys', () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'contract-materializer-'));
        write('package.json', JSON.stringify({ name: 'site', dependencies: {} }));
        write(
            'src/plugins/ds2/plugin.yaml',
            'name: brand-ds\ncontracts:\n  - name: card\n    contract: card.jay-contract\n',
        );
        write('src/plugins/ds2/card.jay-contract', 'name: card\ntags: []\n');
    });

    afterEach(async () => {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    function write(relPath: string, content: string): void {
        const full = path.join(root, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
    }

    /**
     * Bug: plugins-index.yaml keyed a local plugin by manifest.name, but `plugin="x"` resolves a
     * local plugin by folder (DL#221 — linked with `--as`).
     * Expected: `name: ds2` for folder ds2 whose manifest.name is brand-ds.
     * Actual (before fix): `name: brand-ds`.
     */
    it('keys a local plugin in plugins-index by its folder', async () => {
        const result = await materializeContracts({ projectRoot: root });
        expect(result.pluginsIndex.plugins.map((p) => p.name)).toEqual(['ds2']);
    });

    it('keys a local plugin by its folder in --list mode', async () => {
        const index = await listContracts({ projectRoot: root });
        expect(index.plugins.map((p) => p.name)).toEqual(['ds2']);
    });
});
