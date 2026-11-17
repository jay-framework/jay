import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { validateProject } from '../lib/validators/seo-project-validator.js';

function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'seo-project-'));
}
function write(root: string, rel: string, content: string) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}
function files(findings: { file: string }[]): string[] {
    return findings.map((f) => f.file).sort();
}

const ARD = path.join('public', '.well-known', 'ard.json');

describe('seo-validator validateProject (DL#232 — moved from core)', () => {
    it('warns on missing robots.txt, site.baseUrl, site.name, and ARD', async () => {
        const root = tmp();
        const findings = await validateProject({ projectRoot: root });
        expect(files(findings)).toEqual([
            '.jay',
            '.jay',
            'public/.well-known/ard.json',
            'public/robots.txt',
        ]);
        expect(findings.every((f) => f.severity === 'warning')).toBe(true);
    });

    it('is silent when robots.txt, site identity, and allow-no-ard are all set', async () => {
        const root = tmp();
        write(root, 'public/robots.txt', 'User-agent: *\nAllow: /\n');
        write(
            root,
            '.jay',
            'site:\n  name: Example\n  baseUrl: https://example.com\nvalidations:\n  allow-no-ard: true\n',
        );
        expect(await validateProject({ projectRoot: root })).toEqual([]);
    });

    it('does not warn on ARD absence when a valid ard.json is present', async () => {
        const root = tmp();
        write(root, 'public/robots.txt', 'User-agent: *\n');
        write(root, '.jay', 'site:\n  name: Example\n  baseUrl: https://example.com\n');
        write(
            root,
            ARD,
            JSON.stringify({
                entries: [
                    {
                        identifier: 'urn:air:acme:shop:catalog',
                        displayName: 'Catalog',
                        type: 'application/mcp-server-card+json',
                        url: 'https://example.com/mcp',
                        representativeQueries: ['find a product', 'check stock'],
                    },
                ],
            }),
        );
        const findings = await validateProject({ projectRoot: root });
        expect(findings.filter((f) => f.file === ARD)).toEqual([]);
    });

    it('reports an error for a malformed ard.json', async () => {
        const root = tmp();
        write(root, 'public/robots.txt', 'User-agent: *\n');
        write(root, '.jay', 'site:\n  name: Example\n  baseUrl: https://example.com\n');
        write(root, ARD, JSON.stringify({ notEntries: [] }));
        const findings = await validateProject({ projectRoot: root });
        const ardFindings = findings.filter((f) => f.file === ARD);
        expect(ardFindings).toHaveLength(1);
        expect(ardFindings[0].severity).toBe('error');
    });
});
