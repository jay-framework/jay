import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { status } from '../lib/core/status';
import { linkedSite, REPO_URL } from './harness';

describe('share/status (DL#237)', () => {
    it('reports offline by default and refreshes ahead/behind only with fetch', async () => {
        const { sandbox, dir, sha } = await linkedSite();
        const teammate = sandbox.teammateClone(REPO_URL);
        sandbox.commitFile(teammate, 'remote.txt', 'r');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);
        const localSha = sandbox.commitFile(dir, 'local.txt', 'l');
        fs.writeFileSync(path.join(dir, 'dirty.css'), '');

        sandbox.gitSpy.mockClear();
        const offline = await status(sandbox.ctx(), {});
        expect(sandbox.gitSpy.mock.calls.some(([a]) => a[0] === 'fetch')).toEqual(false);
        expect(offline.plugins).toEqual([
            {
                folder: 'brand-ds',
                name: 'brand-ds',
                present: true,
                dirtyFiles: ['dirty.css'],
                ahead: 1,
                behind: 0,
                diverged: false,
                headSha: localSha,
                pinnedSha: sha,
                headMatchesPin: false,
                fetched: false,
            },
        ]);
        expect(offline.incoming).toEqual(undefined);

        const fetched = await status(sandbox.ctx(), { fetch: true });
        expect(fetched.plugins?.[0]).toMatchObject({
            ahead: 1,
            behind: 1,
            diverged: true,
            fetched: true,
        });
    });

    it('reports a missing folder as not present', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.renameSync(dir, path.join(sandbox.root, 'gone'));
        const report = await status(sandbox.ctx(), {});
        expect(report.plugins?.[0]).toMatchObject({ folder: 'brand-ds', present: false });
    });
});
