import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../lib/validators/policy-file-validator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const validProject = path.join(here, 'fixtures', 'project', 'valid');

function tempProjectWith(policy: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-policy-test-'));
    fs.writeFileSync(path.join(dir, 'jay-policy.md'), policy);
    fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'pages', 'page.jay-html'), '<html><body></body></html>');
    return dir;
}

describe('policy-file validator (DL#231 §6.2)', () => {
    it('returns no findings when jay-policy.md is absent', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-policy-test-'));
        expect(await validate({ projectRoot: dir })).toEqual([]);
    });

    it('returns no findings for a valid policy whose selectors all match project files', async () => {
        expect(await validate({ projectRoot: validProject })).toEqual([]);
    });

    it('reports an unsupported version as an error finding', async () => {
        const dir = tempProjectWith(
            '---\nversion: 2\nroles:\n  developer:\n    - selector: "**"\n      rules: { code: yes }\n---\n\n# body\n',
        );
        expect(await validate({ projectRoot: dir })).toEqual([
            {
                severity: 'error',
                file: 'jay-policy.md',
                message: 'Unsupported policy version 2 (expected 1)',
                suggestion: 'Set "version: 1" in the frontmatter',
            },
        ]);
    });

    it('reports malformed YAML frontmatter as a parse error', async () => {
        const dir = tempProjectWith('---\nversion: 1\nroles: { unterminated\n---\n\n# body\n');
        const findings = await validate({ projectRoot: dir });
        expect(findings).toHaveLength(1);
        expect(findings[0].severity).toBe('error');
        expect(findings[0].file).toBe('jay-policy.md');
        expect(findings[0].message.startsWith('invalid YAML frontmatter')).toBe(true);
    });
});
