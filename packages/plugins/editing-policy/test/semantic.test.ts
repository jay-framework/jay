import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parsePage, designDiff } from '../lib/semantic/regions.js';
import { verifyDesignSystemOnly, verifyFromTemplate } from '../lib/semantic/verify.js';
import type { DesignTokens } from '@jay-framework/design-system-validator/design-tokens';
import type { DesignDiff } from '../lib/semantic/regions.js';

const tokens = {
    colors: { brand: '#6b7280' },
    typography: {},
    spacing: {},
    rounded: {},
    breakpoints: {},
    animations: {},
    components: {},
    rawComponents: {},
    rules: {},
} as unknown as DesignTokens;

function sig(partial: Partial<DesignDiff['added'][number]>): DesignDiff['added'][number] {
    return { isRegion: false, tag: 'span', classes: [], styles: [], key: '', ...partial };
}

describe('verifyDesignSystemOnly (DL#233 Q1 — additive + token-only)', () => {
    it('fails when a pre-existing element was changed/removed', () => {
        expect(verifyDesignSystemOnly({ added: [], removedOrChanged: 1 }, tokens)).toBe('fail');
    });

    it('passes an added region without DESIGN.md', () => {
        const diff: DesignDiff = {
            added: [sig({ isRegion: true, tag: 'jay:card' })],
            removedOrChanged: 0,
        };
        expect(verifyDesignSystemOnly(diff, undefined)).toBe('pass');
    });

    it('passes an added element whose inline-style values are tokens', () => {
        const diff: DesignDiff = {
            added: [sig({ styles: [['color', '#6b7280']] })],
            removedOrChanged: 0,
        };
        expect(verifyDesignSystemOnly(diff, tokens)).toBe('pass');
    });

    it('fails an added element with a non-token style value', () => {
        const diff: DesignDiff = {
            added: [sig({ styles: [['color', '#abcabc']] })],
            removedOrChanged: 0,
        };
        expect(verifyDesignSystemOnly(diff, tokens)).toBe('fail');
    });

    it('is unknown when a token-valued style add has no DESIGN.md', () => {
        const diff: DesignDiff = {
            added: [sig({ styles: [['color', '#6b7280']] })],
            removedOrChanged: 0,
        };
        expect(verifyDesignSystemOnly(diff, undefined)).toBe('unknown');
    });
});

describe('parsePage + designDiff + verifyFromTemplate (DL#233)', () => {
    function tmpPage(content: string): { root: string; rel: string } {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-'));
        fs.mkdirSync(path.join(root, 'pages'), { recursive: true });
        fs.writeFileSync(path.join(root, 'pages', 'p.jay-html'), content);
        return { root, rel: 'pages/p.jay-html' };
    }
    const PAGE = (body: string) =>
        `<html><head><script type="application/jay-data">\ndata:\n    title: string\n</script></head><body>${body}</body></html>`;

    it('designDiff reports an added element and no removed/changed', async () => {
        const { root, rel } = tmpPage(PAGE('<p>Intro</p><span style="color:#6b7280">New</span>'));
        const base = await parsePage(PAGE('<p>Intro</p>'), rel, root);
        const cand = await parsePage(
            PAGE('<p>Intro</p><span style="color:#6b7280">New</span>'),
            rel,
            root,
        );
        expect(base && cand).toBeTruthy();
        const diff = designDiff(base!.body, cand!.body);
        expect(diff.removedOrChanged).toBe(0);
        expect(diff.added.some((e) => e.tag === 'span')).toBe(true);
    });

    it('designDiff reports a re-themed existing element as removedOrChanged', async () => {
        const { root, rel } = tmpPage(PAGE('<h3 class="a">X</h3>'));
        const base = await parsePage(PAGE('<h3 class="a">X</h3>'), rel, root);
        const cand = await parsePage(PAGE('<h3 class="a b">X</h3>'), rel, root);
        const diff = designDiff(base!.body, cand!.body);
        expect(diff.removedOrChanged).toBeGreaterThan(0);
    });

    it('verifyFromTemplate fails a page with no template region', async () => {
        const { root, rel } = tmpPage(PAGE('<h1>Plain</h1>'));
        const page = await parsePage(PAGE('<h1>Plain</h1>'), rel, root);
        expect(verifyFromTemplate(page!, ['components/templates/**'])).toBe('fail');
    });
});
