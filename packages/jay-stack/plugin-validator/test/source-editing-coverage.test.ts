import { describe, it, expect } from 'vitest';
import { validatePlugin, ValidationResult } from '../lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * DL#219 — source-editing coverage: a plugin contract should declare how its bound data is edited
 * (an `editingGuide` markdown, or `readonly`), else `jay-stack validate` warns.
 */

const CONTRACT = `name: thing
tags:
  - tag: title
    type: data
    dataType: string
`;

function makePlugin(contractEntry: string, extraFiles: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-editing-cov-'));
    fs.writeFileSync(
        path.join(dir, 'plugin.yaml'),
        `name: cov-plugin\ncontracts:\n${contractEntry}`,
    );
    fs.writeFileSync(path.join(dir, 'thing.jay-contract'), CONTRACT);
    for (const [rel, content] of Object.entries(extraFiles)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return dir;
}

function coverageWarnings(result: ValidationResult) {
    return result.warnings.filter((w) => w.type === 'source-editing-coverage');
}

describe('plugin source-editing coverage validation (DL#219)', () => {
    it('warns when a contract declares neither editingGuide nor readonly', async () => {
        const dir = makePlugin(
            `  - name: thing\n    contract: ./thing.jay-contract\n    component: thing\n`,
        );
        const result = await validatePlugin({ pluginPath: dir });
        expect(coverageWarnings(result)).toHaveLength(1);
    });

    it('does not warn when the contract is readonly', async () => {
        const dir = makePlugin(
            `  - name: thing\n    contract: ./thing.jay-contract\n    component: thing\n    readonly: true\n`,
        );
        const result = await validatePlugin({ pluginPath: dir });
        expect(coverageWarnings(result)).toHaveLength(0);
    });

    it('does not warn when an existing editingGuide is declared', async () => {
        const dir = makePlugin(
            `  - name: thing\n    contract: ./thing.jay-contract\n    component: thing\n    editingGuide: ./editing/thing.md\n`,
            { 'editing/thing.md': '# How to edit thing' },
        );
        const result = await validatePlugin({ pluginPath: dir });
        expect(coverageWarnings(result)).toHaveLength(0);
    });

    it('warns when the declared editingGuide file is missing', async () => {
        const dir = makePlugin(
            `  - name: thing\n    contract: ./thing.jay-contract\n    component: thing\n    editingGuide: ./editing/missing.md\n`,
        );
        const result = await validatePlugin({ pluginPath: dir });
        const w = coverageWarnings(result);
        expect(w).toHaveLength(1);
        expect(w[0].message.includes('not found')).toBe(true);
    });
});
