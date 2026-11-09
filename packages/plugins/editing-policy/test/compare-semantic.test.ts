import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePolicy } from '../lib/policy/parse-policy.js';
import { comparePolicy } from '../lib/compare/compare.js';
import { treeFromDir } from '../lib/fs/read-tree.js';
import { CompareResult } from '../lib/compare/types.js';

// DL#233 — semantic verification end-to-end. One candidate whose five changes each hit one verifier
// branch; judged through the real comparePolicy pipeline (compiler parseJayFile, real DESIGN.md, real
// template regions). `semantic.md` uses `publish: direct` so a verified upgrade is observable as
// REVIEW→PUBLISH. Regenerate goldens: GEN_GOLDENS=1 yarn vitest run test/compare-semantic.test.ts

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'fixtures', 'compare-semantic');
const expectedDir = path.join(dir, 'expected');
const baselineDir = path.join(dir, 'baseline');
const candidateDir = path.join(dir, 'candidate');
const baseline = treeFromDir(baselineDir);
const candidate = treeFromDir(candidateDir);

function compareWith(policyName: string, role: string): Promise<CompareResult> {
    const content = fs.readFileSync(path.join(dir, 'policies', `${policyName}.md`), 'utf-8');
    return comparePolicy({
        baseline,
        candidate,
        role,
        policy: parsePolicy(content),
        policyContent: content,
        baselineRoot: baselineDir,
        candidateRoot: candidateDir,
    });
}

function withoutHash(r: CompareResult) {
    const { policyHash, ...rest } = r;
    return rest;
}

const GEN = process.env.GEN_GOLDENS === '1';

describe('comparePolicy — semantic verification (DL#233)', () => {
    it('semantic × client: upgrades sync / designSystemOnly-add / from-template; keeps re-theme + non-template', async () => {
        const result = await compareWith('semantic', 'client');

        const goldenPath = path.join(expectedDir, 'semantic.client.json');
        const actual = withoutHash(result);
        if (GEN) {
            fs.mkdirSync(expectedDir, { recursive: true });
            fs.writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
        } else {
            expect(actual).toEqual(JSON.parse(fs.readFileSync(goldenPath, 'utf-8')));
        }

        // Exactly the two un-provable changes survive (the three verifiable ones were upgraded).
        const survived = result.findings
            .filter((f) => f.source === 'rule')
            .map((f) => `${f.ruleId}@${f.section ?? path.basename(f.path ?? '')}`)
            .sort();
        expect(survived).toEqual([
            'create:from-template@plain.jay-html',
            'design:designSystemOnly@ds-retheme',
        ]);
        expect(result.disposition).toBe('REVIEW');
    });

    it('semantic × admin: PUBLISH, no findings', async () => {
        const result = await compareWith('semantic', 'admin');
        expect(result.disposition).toBe('PUBLISH');
        expect(result.findings).toEqual([]);
    });
});
