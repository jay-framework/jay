import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveComponentScript } from '../lib/component-script';
import type { ScriptCache } from '../lib/plugin-validators';

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jay-component-script-'));
}

describe('resolveComponentScript', () => {
    let dir: string;

    afterEach(() => {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('prefers <basename>.ts over page.ts', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'shop.jay-html'), '<body></body>');
        fs.writeFileSync(path.join(dir, 'shop.ts'), 'export const shop = 1;');
        fs.writeFileSync(path.join(dir, 'page.ts'), 'export const page = 1;');

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'shop.jay-html'), dir, cache);
        expect(script?.filePath).toBe('shop.ts');
    });

    it('falls back to page.ts when basename script is missing', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');
        fs.writeFileSync(path.join(dir, 'page.ts'), 'export const page = 1;');

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache);
        expect(script?.filePath).toBe('page.ts');
    });

    it('returns undefined when no sibling script exists', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache);
        expect(script).toBeUndefined();
    });

    it('parses once per path when text and sourceFile are read through one cache', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');
        fs.writeFileSync(path.join(dir, 'page.ts'), 'const x = 1;\n');

        const cache: ScriptCache = new Map();

        const first = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache);
        const second = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache);
        expect(first).toBe(second);

        const sourceA = first!.sourceFile;
        const sourceB = second!.sourceFile;
        expect(sourceA).toBe(sourceB);
    });

    it('returns a sourceFile for syntactically invalid TypeScript without throwing', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');
        fs.writeFileSync(path.join(dir, 'page.ts'), 'export const {{{');

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache);
        expect(script?.sourceFile).toBeDefined();
        expect(script!.sourceFile.getText()).toEqual('export const {{{');
    });
});
