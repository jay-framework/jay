import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { unlink } from '../lib/core/unlink';
import { link } from '../lib/core/link';
import { readManifest } from '../lib/core/manifest';
import { linkedSite, REPO_URL } from './harness';

describe('share/unlink (DL#237)', () => {
    it('removes the entry and ignore line and moves the folder to a distinct backup each time', async () => {
        const { sandbox, dir } = await linkedSite();
        const first = await unlink(sandbox.ctx(), { folder: 'brand-ds' });
        expect(readManifest(sandbox.site).plugins).toEqual([]);
        expect(sandbox.read('.gitignore')).toEqual(
            '# >>> jay share\n/.jay-share/\n# <<< jay share\n',
        );
        expect(fs.existsSync(dir)).toEqual(false);

        await link(sandbox.ctx(), { repo: REPO_URL });
        const second = await unlink(sandbox.ctx(), { folder: 'brand-ds' });
        expect(first.files).toHaveLength(1);
        expect(second.files).toHaveLength(1);
        expect(first.files[0]).not.toEqual(second.files[0]);
        for (const backup of [...first.files, ...second.files]) {
            expect(fs.existsSync(path.join(sandbox.site, backup, 'plugin.yaml'))).toEqual(true);
        }
        expect(first.files[0]).toMatch(
            /^\.jay-share\/backup\/brand-ds-\d{8}T\d{6}Z-[0-9a-f]{7}(-\d+)?$/,
        );
    });
});
