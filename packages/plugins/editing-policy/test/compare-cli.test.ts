import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runCompareCli, CliIo } from '../lib/bin/compare.js';

const POLICY = [
    '---',
    'version: 1',
    'defaultRole: client',
    'roles:',
    '  developer:',
    '    - selector: "**"',
    '      rules: { content: yes, design: yes, code: yes, create: yes, publish: direct }',
    '  client:',
    '    - selector: "**"',
    '      rules: { content: yes, design: no, publish: review, onViolation: review }',
    '    - selector: "src/pages/legal/**"',
    '      rules: { edit: no, onViolation: block }',
    '---',
    '',
    '# body',
    '',
].join('\n');

const PAGE = (body: string) => `<html><body>${body}</body></html>`;

function writeProject(root: string, pageBody: string, legalBody: string, withPolicy = true) {
    fs.mkdirSync(path.join(root, 'src', 'pages', 'legal'), { recursive: true });
    if (withPolicy) fs.writeFileSync(path.join(root, 'jay-policy.md'), POLICY);
    fs.writeFileSync(path.join(root, 'src', 'pages', 'page.jay-html'), PAGE(pageBody));
    fs.writeFileSync(path.join(root, 'src', 'pages', 'legal', 'page.jay-html'), PAGE(legalBody));
}

let baseline: string;
function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cli-'));
}
function capture(): { io: CliIo; out: () => string; err: () => string } {
    let o = '';
    let e = '';
    return { io: { stdout: (s) => (o += s), stderr: (s) => (e += s) }, out: () => o, err: () => e };
}

beforeEach(() => {
    baseline = tmp();
    writeProject(baseline, '<h1>Hi</h1>', '<p>Legal</p>');
});

describe('compare CLI — exit codes (DL#231 §1.6)', () => {
    it('exit 0 PUBLISH: developer content edit', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Welcome</h1>', '<p>Legal</p>');
        const cap = capture();
        const code = await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'developer'],
            cap.io,
        );
        expect(code).toBe(0);
        expect(cap.out().startsWith('# Policy comparison: PUBLISH')).toBe(true);
    });

    it('exit 10 REVIEW: client content edit', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Welcome</h1>', '<p>Legal</p>');
        const cap = capture();
        const code = await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'client'],
            cap.io,
        );
        expect(code).toBe(10);
    });

    it('exit 11 BLOCK: client edit on frozen legal page', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Hi</h1>', '<p>Changed</p>');
        const cap = capture();
        const code = await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'client'],
            cap.io,
        );
        expect(code).toBe(11);
    });

    it('exit 1 tool error: unknown role', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Hi</h1>', '<p>Legal</p>');
        const cap = capture();
        const code = await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'ghost'],
            cap.io,
        );
        expect(code).toBe(1);
        expect(cap.err()).toMatch(/Unknown role/);
    });

    it('exit 1 tool error: missing arguments', async () => {
        const cap = capture();
        expect(await runCompareCli(['--role', 'client'], cap.io)).toBe(1);
    });

    it('--json emits parseable JSON with the same disposition', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Welcome</h1>', '<p>Legal</p>');
        const cap = capture();
        const code = await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'client', '--json'],
            cap.io,
        );
        const parsed = JSON.parse(cap.out());
        expect(parsed.disposition).toBe('REVIEW');
        expect(code).toBe(10);
    });

    it('output is byte-identical across runs (deterministic)', async () => {
        const cand = tmp();
        writeProject(cand, '<h1>Welcome</h1>', '<p>Changed</p>');
        const a = capture();
        const b = capture();
        await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'client'],
            a.io,
        );
        await runCompareCli(
            ['--baseline', baseline, '--candidate', cand, '--role', 'client'],
            b.io,
        );
        expect(a.out()).toBe(b.out());
    });
});
