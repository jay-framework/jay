import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listFiles } from '../lib/core/plugin-summary';

/** DL#237 TL;DR #7a: no GitHub API, no `gh`, no repo creation, never a force push. */
describe('share never creates repos or force-pushes', () => {
    const libDir = path.resolve(__dirname, '../lib');
    const sources = listFiles(libDir).map((f) => ({
        file: f,
        text: fs.readFileSync(path.join(libDir, f), 'utf-8'),
    }));
    const offending = (pattern: RegExp) =>
        sources.filter((s) => pattern.test(s.text)).map((s) => s.file);

    it('has no GitHub API URL', () => expect(offending(/api\.github\.com/)).toEqual([]));
    it('never spawns gh', () =>
        expect(offending(/execFile\(\s*'gh'|spawn\(\s*'gh'|['"]gh['"]\s*,\s*\[/)).toEqual([]));
    it('never passes --force or -f to git push', () =>
        expect(offending(/'push'[^\]]*('--force'|'-f'|'--force-with-lease')/)).toEqual([]));
    it('spawns only the git binary', () => expect(offending(/execFile\(\s*'(?!git')/)).toEqual([]));
});
