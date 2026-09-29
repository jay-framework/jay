import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fsp, readFileSync } from 'fs';
import { parse as parseHtml } from 'node-html-parser';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { syncPageContent } from '../lib/run-sync';
import { extractScopeBlock } from '../lib/scope-css';

/** Read a file synchronously, returning undefined when it does not exist (test template loader). */
function readFileSyncSafe(filePath: string): string | undefined {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

describe('syncPageContent (DL#196)', () => {
    const syncDir = path.resolve('./test/fixtures/validate/region-sync');

    async function parseSyncPage(fixturePath: string) {
        const jayFile = path.join(syncDir, fixturePath);
        const content = await fsp.readFile(jayFile, 'utf-8');
        const dirname = path.dirname(jayFile);
        const parsed = await parseJayFile(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            syncDir,
        );
        expect(parsed.validations).toHaveLength(0);
        return { content, jayHtml: parsed.val!, dirname };
    }

    it('re-flattens unmarked drift, preserves override facets, and injects @scope CSS', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('page.jay-html');
        const result = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);

        expect(result.errors).toEqual([]);
        expect(result.regions).toEqual(1);
        expect(result.changed).toBe(true);

        const out = parseHtml(result.content);
        const heading = out.querySelector('.card-heading')!;
        const body = out.querySelector('.card-body')!;

        // The `override="class"` heading keeps the page's class and marker.
        expect(heading.getAttribute('class')).toEqual('card-heading featured');
        expect(heading.getAttribute('override')).toEqual('class');
        // The unmarked <p> is re-flattened back to the source template text.
        expect(body.textContent).toEqual('Default body');

        // The region's @scope CSS block was injected (the page had none).
        const style = out.querySelector('style')!.textContent;
        expect(extractScopeBlock(style, '.promo')).not.toBeUndefined();
    });

    it('is idempotent — a synced page reports no further change', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('page.jay-html');
        const first = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);

        // Re-parse the synced output and sync again — nothing should change the second time.
        const reparsed = await parseJayFile(
            first.content,
            'page',
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            syncDir,
        );
        expect(reparsed.validations).toHaveLength(0);
        const second = syncPageContent(first.content, dirname, reparsed.val!, readFileSyncSafe);
        expect(second.changed).toBe(false);
    });
});
