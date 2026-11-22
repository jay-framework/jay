import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkShareHygiene, type ShareFinding } from '../lib/validators/share-hygiene';
import { readManifest, writeManifest } from '../lib/core/manifest';
import { linkedSite, createSandbox, type Sandbox } from './harness';

const codes = (findings: ShareFinding[]) => findings.map((f) => f.code);
const check = (sandbox: Sandbox) => checkShareHygiene(sandbox.site, sandbox.ctx().git);

describe('share validator — Phase 1a hygiene checks (DL#237)', () => {
    it('reports nothing for a cleanly linked plugin', async () => {
        const { sandbox } = await linkedSite();
        expect(await check(sandbox)).toEqual([]);
    });

    it('SHARE-MANIFEST-MISSING-FOLDER when a listed folder is missing', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.renameSync(dir, path.join(sandbox.root, 'gone'));
        expect(codes(await check(sandbox))).toEqual(['SHARE-MANIFEST-MISSING-FOLDER']);
    });

    it('SHARE-FOLDER-NOT-IN-MANIFEST for a git clone under src/plugins that share.yaml does not list', async () => {
        const { sandbox } = await linkedSite();
        writeManifest(sandbox.site, { plugins: [] });
        expect(codes(await check(sandbox))).toEqual(['SHARE-FOLDER-NOT-IN-MANIFEST']);
    });

    it('does not flag an ordinary local plugin without its own .git', async () => {
        const sandbox = createSandbox();
        sandbox.copyFixturePlugin('brand-ds');
        expect(await check(sandbox)).toEqual([]);
    });

    it('SHARE-NOT-IGNORED when the ignore line is missing', async () => {
        const { sandbox } = await linkedSite();
        fs.writeFileSync(path.join(sandbox.site, '.gitignore'), '');
        expect(codes(await check(sandbox))).toEqual(['SHARE-NOT-IGNORED']);
    });

    it('SHARE-NOT-IGNORED when the site repo still tracks files under the folder', async () => {
        const { sandbox, dir } = await linkedSite();
        // Tracked before the folder became a shared clone: hide its .git while the site commits it.
        fs.renameSync(path.join(dir, '.git'), path.join(sandbox.root, 'hidden-git'));
        sandbox.git(['add', '-f', 'src/plugins/brand-ds/card.jay-html'], sandbox.site);
        sandbox.git(['commit', '--quiet', '-m', 'tracked'], sandbox.site);
        fs.renameSync(path.join(sandbox.root, 'hidden-git'), path.join(dir, '.git'));
        expect(codes(await check(sandbox))).toEqual(['SHARE-NOT-IGNORED']);
    });

    it('SHARE-COMMIT-MISMATCH when HEAD differs from the pinned commit', async () => {
        const { sandbox, dir } = await linkedSite();
        sandbox.commitFile(dir, 'a.css', '.a{}');
        expect(codes(await check(sandbox))).toEqual(['SHARE-COMMIT-MISMATCH']);
    });

    it('SHARE-DIRTY for uncommitted changes, and every finding is a warning', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.writeFileSync(path.join(dir, 'card.jay-html'), 'changed');
        const manifest = readManifest(sandbox.site);
        writeManifest(sandbox.site, {
            plugins: [
                ...manifest.plugins,
                { folder: 'gone', repo: 'https://github.com/a/b.git', ref: 'main', commit: 'x' },
            ],
        });
        const findings = await check(sandbox);
        expect(codes(findings)).toEqual(['SHARE-DIRTY', 'SHARE-MANIFEST-MISSING-FOLDER']);
        expect(findings.map((f) => f.severity)).toEqual(['warning', 'warning']);
    });
});

describe('jay-stack validate with only share warnings', () => {
    const packageRoot = path.resolve(__dirname, '..');
    const cli = path.resolve(packageRoot, '../../jay-stack/stack-cli/dist/index.js');

    it('exits 0 and prints the SHARE-* warning', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.writeFileSync(
            path.join(dir, 'card.jay-html'),
            fs.readFileSync(path.join(dir, 'card.jay-html'), 'utf-8') + '\n',
        );
        fs.writeFileSync(
            path.join(sandbox.site, 'package.json'),
            JSON.stringify({
                name: 'site',
                private: true,
                dependencies: { '@jay-framework/share': '*' },
            }),
        );
        const scoped = path.join(sandbox.site, 'node_modules', '@jay-framework');
        fs.mkdirSync(scoped, { recursive: true });
        fs.symlinkSync(packageRoot, path.join(scoped, 'share'));
        fs.mkdirSync(path.join(sandbox.site, 'src/pages'), { recursive: true });
        fs.writeFileSync(
            path.join(sandbox.site, 'src/pages/page.jay-html'),
            '<html>\n  <head>\n    <script type="application/jay-data">\n      data:\n    </script>\n  </head>\n  <body>\n    <div>home</div>\n  </body>\n</html>\n',
        );
        const run = spawnSync(process.execPath, [cli, 'validate'], {
            cwd: sandbox.site,
            env: { ...process.env, ...sandbox.env },
            encoding: 'utf-8',
        });
        const output = run.stdout + run.stderr;
        expect({ status: run.status, sharedWarning: output.includes('[SHARE-DIRTY]') }).toEqual({
            status: 0,
            sharedWarning: true,
        });
    });
});
