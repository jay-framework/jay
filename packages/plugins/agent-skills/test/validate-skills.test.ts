import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publishSkills } from '../lib/publish';
import { validateAgentSkills } from '../lib/validate-skills';

// DL#216 — the validator is the digest-drift tripwire.

const SKILL = [
    '---',
    'name: jay',
    'description: Build a website with the Jay framework',
    '---',
    '',
    '# Build with Jay',
    '',
].join('\n');

describe('validateAgentSkills (DL#216)', () => {
    let root: string;
    let publicFolder: string;

    beforeEach(async () => {
        root = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-skills-val-'));
        publicFolder = path.join(root, 'public');
    });
    afterEach(async () => {
        await fsp.rm(root, { recursive: true, force: true });
    });

    async function publishOne(): Promise<void> {
        const dir = path.join(root, 'src', 'skills', 'jay');
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, 'SKILL.md'), SKILL);
        await publishSkills({ projectRoot: root, publicFolder });
    }

    it('reports absent when no index.json exists', async () => {
        const { findings, absent } = await validateAgentSkills(root);
        expect(absent).toBe(true);
        expect(findings).toEqual([]);
    });

    it('passes a freshly published tree', async () => {
        await publishOne();
        const { findings, absent } = await validateAgentSkills(root);
        expect(absent).toBe(false);
        expect(findings).toEqual([]);
    });

    it('flags digest drift when SKILL.md changed without re-publishing', async () => {
        await publishOne();
        // Edit the served SKILL.md directly (simulating a changed source + stale index).
        await fsp.writeFile(
            path.join(publicFolder, '.well-known/agent-skills/jay/SKILL.md'),
            SKILL + '\nEdited without re-running the tool.\n',
        );

        const { findings } = await validateAgentSkills(root);
        const digestErrors = findings.filter(
            (f) => f.severity === 'error' && f.message.includes('digest mismatch'),
        );
        expect(digestErrors).toHaveLength(1);
    });

    it('errors on a malformed index.json', async () => {
        const dir = path.join(publicFolder, '.well-known/agent-skills');
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, 'index.json'), '{ not json');

        const { findings, absent } = await validateAgentSkills(root);
        expect(absent).toBe(false);
        expect(findings.some((f) => f.severity === 'error')).toBe(true);
    });

    it('errors when $schema is wrong', async () => {
        await publishOne();
        const indexPath = path.join(publicFolder, '.well-known/agent-skills/index.json');
        const index = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
        index.$schema = 'https://example.com/wrong.json';
        await fsp.writeFile(indexPath, JSON.stringify(index, null, 2));

        const { findings } = await validateAgentSkills(root);
        expect(findings.some((f) => f.message.includes('$schema'))).toBe(true);
    });
});
