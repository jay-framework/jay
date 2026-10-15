import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDirectDocumentAccess, validateJayFiles } from '../lib/validate';
import { resolveComponentScript, type ScriptCache } from '@jay-framework/compiler-shared';
import { isFindingSuppressed, createLineTextResolver } from '../lib/validation-findings';

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jay-validation-findings-'));
}

describe('validation findings (DL#220)', () => {
    let dir: string;

    afterEach(() => {
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('suppresses DOM warnings via block comment jay-dom: allow on the script line', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');
        fs.writeFileSync(
            path.join(dir, 'page.ts'),
            'document.querySelector(".x"); /* jay-dom: allow */\n',
        );

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache)!;
        const findings = checkDirectDocumentAccess(script);
        expect(findings).toHaveLength(1);

        const resolveLineText = createLineTextResolver(dir);
        expect(
            isFindingSuppressed(findings[0], 'page.jay-html', undefined, resolveLineText),
        ).toBe(true);
    });

    it('suppresses DOM warnings via // jay-dom: allow on the script line', () => {
        dir = tempDir();
        fs.writeFileSync(path.join(dir, 'page.jay-html'), '<body></body>');
        fs.writeFileSync(
            path.join(dir, 'page.ts'),
            'document.querySelector(".x"); // jay-dom: allow\n',
        );

        const cache: ScriptCache = new Map();
        const script = resolveComponentScript(path.join(dir, 'page.jay-html'), dir, cache)!;
        const findings = checkDirectDocumentAccess(script);
        expect(findings).toHaveLength(1);

        const resolveLineText = createLineTextResolver(dir);
        expect(
            isFindingSuppressed(findings[0], 'page.jay-html', undefined, resolveLineText),
        ).toBe(true);
    });

    it('does not run page export check for non-page templates (Q5)', async () => {
        dir = tempDir();
        const pages = path.join(dir, 'src', 'pages', 'widgets');
        fs.mkdirSync(pages, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'jay.config.yaml'),
            'devServer:\n  pagesBase: src/pages\n  componentsBase: src/components\n',
        );
        fs.writeFileSync(
            path.join(pages, 'card.jay-html'),
            '<html><head><script type="application/jay-data">data:\n  x: string\n</script></head><body></body></html>',
        );
        fs.writeFileSync(path.join(pages, 'page.ts'), 'export const notPage = 1;');

        const result = await validateJayFiles({ projectRoot: dir, path: pages });
        const exportErrors = result.errors.filter((e) => e.message.includes('does not export "page"'));
        expect(exportErrors).toHaveLength(0);
    });

    it('still errors when page.jay-html sibling page.ts lacks page export', async () => {
        dir = tempDir();
        const pages = path.join(dir, 'src', 'pages', 'home');
        fs.mkdirSync(pages, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'jay.config.yaml'),
            'devServer:\n  pagesBase: src/pages\n  componentsBase: src/components\n',
        );
        fs.writeFileSync(
            path.join(pages, 'page.jay-html'),
            '<html><head><script type="application/jay-data">data:\n  x: string\n</script></head><body></body></html>',
        );
        fs.writeFileSync(path.join(pages, 'page.ts'), 'export const notPage = 1;');

        const result = await validateJayFiles({ projectRoot: dir, path: pages });
        expect(
            result.errors.some((e) => e.message.includes('does not export "page"')),
        ).toBe(true);
    });
});
