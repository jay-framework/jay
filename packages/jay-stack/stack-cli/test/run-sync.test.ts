import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fsp, readFileSync } from 'fs';
import { parse as parseHtml } from 'node-html-parser';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { syncPageContent, resolveTargets, narrowScopeBlock } from '../lib/run-sync';
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

    it('coalesces same-template instances into one selector-list @scope block', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('two-cards.jay-html');
        const result = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);

        expect(result.errors).toEqual([]);
        expect(result.regions).toEqual(2);

        const style = parseHtml(result.content).querySelector('style')!.textContent;
        // One coalesced block scopes both refs; extraction answers per-member from that block.
        const blocks = style.match(/@scope/g) ?? [];
        expect(blocks).toHaveLength(1);
        expect(extractScopeBlock(style, '.cardStarter')).toEqual(
            extractScopeBlock(style, '.cardPro'),
        );
        // DL#206 — the component CSS is emitted verbatim inside `@scope (.<ref>) { … }`; the region's real
        // roots are descendants of the `display:contents` scope-anchor wrapper, so a root rule (`.card`)
        // matches as an ordinary descendant. No `:scope` rewrite (the old root-matching fix is removed).
        const starter = extractScopeBlock(style, '.cardStarter')!;
        expect(starter.includes(':scope')).toBe(false);
        expect(/(^|[\s{,])\.card\s*\{/.test(starter)).toBe(true);
    });

    it('is idempotent after coalescing — a re-synced coalesced page reports no change', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('two-cards.jay-html');
        const first = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);
        expect(first.changed).toBe(true); // separate/absent blocks → coalesced

        const reparsed = await parseJayFile(
            first.content,
            'two-cards',
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            syncDir,
        );
        expect(reparsed.validations).toHaveLength(0);
        const second = syncPageContent(first.content, dirname, reparsed.val!, readFileSyncSafe);
        expect(second.changed).toBe(false);
    });

    it('appends only the missing member when the page already scopes one ref', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('two-cards-one-scoped.jay-html');
        const result = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);

        const style = parseHtml(result.content).querySelector('style')!.textContent;
        // The hand-scoped .cardStarter (with its override) is untouched; only .cardPro is appended,
        // re-narrowed to just that member — never re-duplicating .cardStarter.
        const starter = extractScopeBlock(style, '.cardStarter')!;
        expect(starter.includes('rebeccapurple')).toBe(true);
        expect(starter.includes('cardPro')).toBe(false);
        const pro = extractScopeBlock(style, '.cardPro')!;
        expect(pro.includes('rebeccapurple')).toBe(false);
        expect(pro.includes('cardStarter')).toBe(false);
    });

    it('overwrites an unmarked stale CSS block, coalescing both refs into one canonical block', async () => {
        const { content, jayHtml, dirname } = await parseSyncPage('two-cards-stale-css.jay-html');
        const result = syncPageContent(content, dirname, jayHtml, readFileSyncSafe);

        const style = parseHtml(result.content).querySelector('style')!.textContent;
        // The stale, unmarked `.cardStarter` block is unmarked drift: sync overwrites it, coalescing both
        // refs into one canonical block. DL#206 — the canonical form emits the component CSS verbatim
        // (root rule `.card` kept), not the old root→`:scope` rewrite.
        const blocks = style.match(/@scope/g) ?? [];
        expect(blocks).toHaveLength(1);
        const starter = extractScopeBlock(style, '.cardStarter')!;
        expect(starter).toEqual(extractScopeBlock(style, '.cardPro'));
        expect(starter.includes(':scope')).toBe(false);
        expect(/(^|[\s{,])\.card\s*\{/.test(starter)).toBe(true);
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

describe('narrowScopeBlock — DL#203 preserves the `to (…)` donut on re-narrowing', () => {
    it('re-narrows the selector list while keeping the `to (…)` boundary intact', () => {
        const block = `@scope (.cardStarter, .cardPro) to (.cta) {\n  .card-heading { color: black; }\n}`;
        const narrowed = narrowScopeBlock(block, ['.cardPro']);
        expect(narrowed).toEqual(
            `@scope (.cardPro) to (.cta) {\n  .card-heading { color: black; }\n}`,
        );
    });

    it('leaves a plain block (no `to`) correctly narrowed', () => {
        const block = `@scope (.a, .b) {\n  .x { color: red; }\n}`;
        expect(narrowScopeBlock(block, ['.a'])).toEqual(`@scope (.a) {\n  .x { color: red; }\n}`);
    });
});

describe('resolveTargets — discovery scoping (DL#196)', () => {
    const root = path.resolve('./test/fixtures/validate/region-sync-scope');
    const pagesDir = path.join(root, 'src', 'pages');
    const componentsDir = path.join(root, 'src', 'components');
    const rel = (files: string[]) => files.map((f) => path.relative(root, f)).sort();

    it('scans only pagesBase + componentsBase, never the build/ output tree', async () => {
        const files = await resolveTargets(root, [pagesDir, componentsDir], undefined, false);

        // The flattened page copy under build/ must never be swept in — that was the sync bug.
        expect(rel(files)).toEqual([
            path.join('src', 'components', 'card.jay-html'),
            path.join('src', 'pages', 'nested', 'page.jay-html'),
            path.join('src', 'pages', 'page.jay-html'),
        ]);
    });

    it('an explicit target resolves to that single page, ignoring scan dirs', async () => {
        const files = await resolveTargets(root, [pagesDir], 'src/pages/page.jay-html', false);
        expect(files).toEqual([path.resolve(root, 'src/pages/page.jay-html')]);
    });
});
