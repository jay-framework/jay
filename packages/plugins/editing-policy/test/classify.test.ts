import { describe, it, expect } from 'vitest';
import { classifyChanges } from '../lib/changes/classify.js';
import { Tree } from '../lib/changes/types.js';

function tree(entries: Record<string, string>): Tree {
    return new Map(Object.entries(entries));
}

const PAGE = (body: string) => `<html><body>${body}</body></html>`;

describe('classifyChanges — per kind (DL#231 §6.3)', () => {
    it('no change for identical trees', () => {
        const t = tree({ 'src/pages/page.jay-html': PAGE('<h1>Hi</h1>') });
        expect(classifyChanges(t, t)).toEqual([]);
    });

    it('content: a text edit in a jay-html body', () => {
        const base = tree({ 'src/pages/page.jay-html': PAGE('<h1>Hello</h1>') });
        const cand = tree({ 'src/pages/page.jay-html': PAGE('<h1>Welcome</h1>') });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'content',
                path: 'src/pages/page.jay-html',
                section: undefined,
                summary: 'content changed in src/pages/page.jay-html',
            },
        ]);
    });

    it('design: a class edit in a jay-html body', () => {
        const base = tree({ 'src/pages/page.jay-html': PAGE('<h1 class="a">Hi</h1>') });
        const cand = tree({ 'src/pages/page.jay-html': PAGE('<h1 class="b">Hi</h1>') });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'design',
                path: 'src/pages/page.jay-html',
                section: undefined,
                summary: 'design changed in src/pages/page.jay-html',
            },
        ]);
    });

    it('css: a <style> block edit in a jay-html file', () => {
        const base = tree({
            'src/pages/page.jay-html': PAGE('<style>.a{color:red}</style><h1>Hi</h1>'),
        });
        const cand = tree({
            'src/pages/page.jay-html': PAGE('<style>.a{color:blue}</style><h1>Hi</h1>'),
        });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'css',
                path: 'src/pages/page.jay-html',
                section: undefined,
                summary: 'CSS changed in src/pages/page.jay-html',
            },
        ]);
    });

    it('css: an external .css file edit', () => {
        const base = tree({ 'src/styles/app.css': '.a{color:red}' });
        const cand = tree({ 'src/styles/app.css': '.a{color:blue}' });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'css',
                path: 'src/styles/app.css',
                summary: 'CSS changed in src/styles/app.css',
            },
        ]);
    });

    it('code: a .ts edit and a .jay-contract edit', () => {
        const base = tree({
            'src/pages/page.ts': 'export const a = 1;',
            'src/pages/page.jay-contract': 'name: p',
        });
        const cand = tree({
            'src/pages/page.ts': 'export const a = 2;',
            'src/pages/page.jay-contract': 'name: q',
        });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'code',
                path: 'src/pages/page.jay-contract',
                summary: 'code changed in src/pages/page.jay-contract',
            },
            {
                kind: 'code',
                path: 'src/pages/page.ts',
                summary: 'code changed in src/pages/page.ts',
            },
        ]);
    });

    it('dependency vs config: package.json deps vs scripts', () => {
        const base = tree({
            'package.json': JSON.stringify({
                name: 'x',
                dependencies: { a: '1' },
                scripts: { b: 'c' },
            }),
        });
        const candDep = tree({
            'package.json': JSON.stringify({
                name: 'x',
                dependencies: { a: '2' },
                scripts: { b: 'c' },
            }),
        });
        expect(classifyChanges(base, candDep)).toEqual([
            {
                kind: 'dependency',
                path: 'package.json',
                summary: 'dependencies changed in package.json',
            },
        ]);
        const candCfg = tree({
            'package.json': JSON.stringify({
                name: 'x',
                dependencies: { a: '1' },
                scripts: { b: 'd' },
            }),
        });
        expect(classifyChanges(base, candCfg)).toEqual([
            { kind: 'config', path: 'package.json', summary: 'config changed in package.json' },
        ]);
    });

    it('config: a yaml project file', () => {
        const base = tree({ 'jay.config.yaml': 'a: 1' });
        const cand = tree({ 'jay.config.yaml': 'a: 2' });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'config',
                path: 'jay.config.yaml',
                summary: 'config changed in jay.config.yaml',
            },
        ]);
    });

    it('create: a new page', () => {
        const base = tree({ 'src/pages/page.jay-html': PAGE('<h1>Hi</h1>') });
        const cand = tree({
            'src/pages/page.jay-html': PAGE('<h1>Hi</h1>'),
            'src/pages/offers/page.jay-html': PAGE('<h1>Offers</h1>'),
        });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'create',
                path: 'src/pages/offers/page.jay-html',
                summary: 'added src/pages/offers/page.jay-html',
            },
        ]);
    });

    it('delete: a removed page', () => {
        const base = tree({
            'src/pages/page.jay-html': PAGE('<h1>Hi</h1>'),
            'src/pages/old/page.jay-html': PAGE('<h1>Old</h1>'),
        });
        const cand = tree({ 'src/pages/page.jay-html': PAGE('<h1>Hi</h1>') });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'delete',
                path: 'src/pages/old/page.jay-html',
                summary: 'deleted src/pages/old/page.jay-html',
            },
        ]);
    });

    it('rename: a moved page (identical content) is one rename, not delete+create', () => {
        const base = tree({ 'src/pages/old/page.jay-html': PAGE('<h1>Same</h1>') });
        const cand = tree({ 'src/pages/new/page.jay-html': PAGE('<h1>Same</h1>') });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'rename',
                path: 'src/pages/new/page.jay-html',
                fromPath: 'src/pages/old/page.jay-html',
                summary: 'renamed src/pages/old/page.jay-html → src/pages/new/page.jay-html',
            },
        ]);
    });

    it('policy: editing jay-policy.md', () => {
        const base = tree({ 'jay-policy.md': '---\nversion: 1\n---\nA' });
        const cand = tree({ 'jay-policy.md': '---\nversion: 1\n---\nB' });
        expect(classifyChanges(base, cand)).toEqual([
            { kind: 'policy', path: 'jay-policy.md', summary: 'edited jay-policy.md' },
        ]);
    });

    it('policy: a jay-policy marker added, with section attribution', () => {
        const base = tree({ 'src/pages/page.jay-html': PAGE('<p>Note</p>') });
        const cand = tree({
            'src/pages/page.jay-html': PAGE('<p jay-policy="price-note">Note</p>'),
        });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'policy',
                path: 'src/pages/page.jay-html',
                section: 'price-note',
                summary: 'jay-policy="price-note" marker added in src/pages/page.jay-html',
            },
        ]);
    });

    it('content inside a marked section is attributed to that section', () => {
        const base = tree({
            'src/pages/page.jay-html': PAGE('<div jay-policy="card"><p>Old</p></div>'),
        });
        const cand = tree({
            'src/pages/page.jay-html': PAGE('<div jay-policy="card"><p>New</p></div>'),
        });
        expect(classifyChanges(base, cand)).toEqual([
            {
                kind: 'content',
                path: 'src/pages/page.jay-html',
                section: 'card',
                summary: 'content changed in src/pages/page.jay-html#card',
            },
        ]);
    });

    it('asset changes are not governed (no change emitted)', () => {
        const base = tree({ 'src/assets/logo.png': 'AAAA' });
        const cand = tree({ 'src/assets/logo.png': 'BBBB' });
        expect(classifyChanges(base, cand)).toEqual([]);
    });

    it('formatting-only jay-html change yields no change', () => {
        const base = tree({ 'src/pages/page.jay-html': PAGE('<h1>Hi</h1>') });
        const cand = tree({
            'src/pages/page.jay-html': '<html>\n  <body>\n    <h1>Hi</h1>\n  </body>\n</html>',
        });
        expect(classifyChanges(base, cand)).toEqual([]);
    });
});
