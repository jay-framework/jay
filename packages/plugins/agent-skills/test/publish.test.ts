import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishSkills, AGENT_SKILLS_SCHEMA } from '../lib/publish';

// DL#216 — agent-skills publishing: folder/config modes → index.json + digests + api-catalog.

function sha256(buf: Buffer): string {
    return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

const SKILL_JAY = [
    '---',
    'name: jay',
    'description: Build a website with the Jay framework',
    '---',
    '',
    '# Build with Jay',
    '',
    'Step one...',
    '',
].join('\n');

describe('publishSkills (DL#216)', () => {
    let root: string;
    let publicFolder: string;

    beforeEach(async () => {
        root = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-skills-'));
        publicFolder = path.join(root, 'public');
    });
    afterEach(async () => {
        await fsp.rm(root, { recursive: true, force: true });
    });

    async function writeSkill(name: string, content: string): Promise<string> {
        const dir = path.join(root, 'src', 'skills', name);
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(path.join(dir, 'SKILL.md'), content);
        return dir;
    }

    it('folder mode: publishes a skill-md entry with a matching digest + index + api-catalog', async () => {
        await writeSkill('jay', SKILL_JAY);

        const result = await publishSkills({ projectRoot: root, publicFolder });

        expect(result.skills).toEqual([
            {
                name: 'jay',
                type: 'skill-md',
                description: 'Build a website with the Jay framework',
                url: '/.well-known/agent-skills/jay/SKILL.md',
                digest: sha256(Buffer.from(SKILL_JAY, 'utf8')),
            },
        ]);

        const served = await fsp.readFile(
            path.join(publicFolder, '.well-known/agent-skills/jay/SKILL.md'),
            'utf8',
        );
        expect(served).toBe(SKILL_JAY);

        const index = JSON.parse(
            await fsp.readFile(
                path.join(publicFolder, '.well-known/agent-skills/index.json'),
                'utf8',
            ),
        );
        expect(index.$schema).toBe(AGENT_SKILLS_SCHEMA);
        expect(index.skills).toEqual(result.skills);

        const apiCatalog = JSON.parse(
            await fsp.readFile(path.join(publicFolder, '.well-known/api-catalog'), 'utf8'),
        );
        expect(apiCatalog).toEqual({
            linkset: [
                {
                    anchor: '/',
                    'agent-skills': [
                        {
                            href: '/.well-known/agent-skills/index.json',
                            type: 'application/json',
                        },
                    ],
                },
            ],
        });
    });

    it('folder mode: a skill with assets is packaged as an archive whose digest matches the bytes', async () => {
        const dir = await writeSkill('themed', SKILL_JAY.replace('name: jay', 'name: themed'));
        await fsp.writeFile(path.join(dir, 'logo.svg'), '<svg/>');

        const result = await publishSkills({ projectRoot: root, publicFolder });

        expect(result.skills).toHaveLength(1);
        const entry = result.skills[0];
        expect(entry.type).toBe('archive');
        expect(entry.url).toBe('/.well-known/agent-skills/themed/themed.tar.gz');

        const archive = await fsp.readFile(
            path.join(publicFolder, '.well-known/agent-skills/themed/themed.tar.gz'),
        );
        expect(entry.digest).toBe(sha256(archive));
        // SKILL.md is still served standalone at the predictable path.
        await fsp.access(path.join(publicFolder, '.well-known/agent-skills/themed/SKILL.md'));
    });

    it('config mode: curated list with inline body', async () => {
        const configPath = path.join(root, 'skills.config.yaml');
        await fsp.writeFile(
            configPath,
            [
                'skills:',
                '  - name: inline',
                '    description: An inline skill',
                '    body: |',
                '      ---',
                '      name: inline',
                '      description: An inline skill',
                '      ---',
                '      Body here',
                '',
            ].join('\n'),
        );

        const result = await publishSkills({ projectRoot: root, publicFolder, config: configPath });

        expect(result.skills.map((s) => ({ name: s.name, type: s.type }))).toEqual([
            { name: 'inline', type: 'skill-md' },
        ]);
    });

    it('rebuilds from scratch — a skill removed from source does not linger', async () => {
        await writeSkill('jay', SKILL_JAY);
        await publishSkills({ projectRoot: root, publicFolder });

        await fsp.rm(path.join(root, 'src', 'skills', 'jay'), { recursive: true, force: true });
        const result = await publishSkills({ projectRoot: root, publicFolder });

        expect(result.skills).toEqual([]);
        await expect(
            fsp.access(path.join(publicFolder, '.well-known/agent-skills/jay')),
        ).rejects.toThrow();
    });

    it('rejects a SKILL.md whose frontmatter name is invalid', async () => {
        await writeSkill('Bad_Name', SKILL_JAY.replace('name: jay', 'name: Bad_Name'));
        await expect(publishSkills({ projectRoot: root, publicFolder })).rejects.toThrow(/name/);
    });
});
