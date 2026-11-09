import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePolicy } from '../lib/policy/parse-policy.js';
import { comparePolicy } from '../lib/compare/compare.js';
import { treeFromDir } from '../lib/fs/read-tree.js';
import { renderJson, renderMarkdown } from '../lib/report/render.js';
import { CompareResult } from '../lib/compare/types.js';

// On-disk baseline/candidate pair, rotating policies, golden CompareResults (DL#231 §9.1). The same
// candidate is judged differently as the policy and role rotate. Goldens omit `policyHash` (so a
// reformat of a policy file can't break them); the hash is asserted separately as a sha256.
//
// To regenerate the goldens after an intentional engine change: GEN_GOLDENS=1 yarn vitest run
// test/compare-fixtures.test.ts  — then review the diff.

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'fixtures', 'compare');
const expectedDir = path.join(dir, 'expected');

const baselineDir = path.join(dir, 'baseline');
const candidateDir = path.join(dir, 'candidate');
const baseline = treeFromDir(baselineDir);
const candidate = treeFromDir(candidateDir);

function loadPolicy(name: string) {
    const content = fs.readFileSync(path.join(dir, 'policies', `${name}.md`), 'utf-8');
    return { policy: parsePolicy(content), content };
}

function compareWith(policyName: string, role: string): Promise<CompareResult> {
    const { policy, content } = loadPolicy(policyName);
    return comparePolicy({
        baseline,
        candidate,
        role,
        policy,
        policyContent: content,
        baselineRoot: baselineDir,
        candidateRoot: candidateDir,
    });
}

function withoutHash(r: CompareResult) {
    const { policyHash, ...rest } = r;
    return rest;
}

const MATRIX: Array<{ policy: string; role: string }> = [
    { policy: 'main', role: 'developer' },
    { policy: 'main', role: 'designer' },
    { policy: 'main', role: 'client' },
    { policy: 'main', role: 'admin' },
    { policy: 'permissive', role: 'client' },
    { policy: 'review', role: 'client' },
];

const GEN = process.env.GEN_GOLDENS === '1';

describe('comparePolicy — on-disk fixture matrix (DL#231 §9.1)', () => {
    for (const { policy, role } of MATRIX) {
        it(`${policy} × ${role}`, async () => {
            const result = await compareWith(policy, role);
            expect(result.policyHash).toMatch(/^[0-9a-f]{64}$/);

            const goldenPath = path.join(expectedDir, `${policy}.${role}.json`);
            const actual = withoutHash(result);

            if (GEN) {
                fs.mkdirSync(expectedDir, { recursive: true });
                fs.writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
                return;
            }
            const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
            expect(actual).toEqual(golden);
        });
    }

    it('invariant: compare(baseline, baseline) is PUBLISH for every role', async () => {
        for (const role of ['developer', 'designer', 'client', 'admin']) {
            const { policy, content } = loadPolicy('main');
            const result = await comparePolicy({
                baseline,
                candidate: baseline,
                role,
                policy,
                policyContent: content,
                baselineRoot: baselineDir,
                candidateRoot: baselineDir,
            });
            expect(result.disposition).toBe('PUBLISH');
        }
    });

    it('unknown role is a tool error', async () => {
        await expect(compareWith('main', 'ghost')).rejects.toThrow();
    });

    it('allowed changes with publish: review → REVIEW, no findings', async () => {
        const result = await compareWith('review', 'client');
        expect(result.disposition).toBe('REVIEW');
        expect(result.findings).toEqual([]);
    });

    it('falls back to defaultRole (client) when no role is given → BLOCK on the frozen legal page', async () => {
        const { policy, content } = loadPolicy('main');
        const result = await comparePolicy({
            baseline,
            candidate,
            policy,
            policyContent: content,
            baselineRoot: baselineDir,
            candidateRoot: candidateDir,
        });
        expect(result.disposition).toBe('BLOCK');
    });

    it('same candidate, different policy → different disposition (rotation)', async () => {
        expect((await compareWith('main', 'client')).disposition).toBe('BLOCK');
        expect((await compareWith('permissive', 'client')).disposition).toBe('PUBLISH');
    });

    it('report parity: markdown and JSON agree on disposition and finding count', async () => {
        const result = await compareWith('main', 'client');
        const json = JSON.parse(renderJson(result));
        const md = renderMarkdown(result, { role: 'client' });
        expect(json.disposition).toBe(result.disposition);
        expect(md.startsWith(`# Policy comparison: ${result.disposition}`)).toBe(true);
        expect(md.includes(`## Findings (${result.findings.length})`)).toBe(true);
    });
});
