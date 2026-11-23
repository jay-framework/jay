import { describe, it, expect } from 'vitest';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { findInpWarnings, maskSource } from '../lib/inp-responsiveness';
import { validateJayFiles } from '../lib/validate';

/** Design Log #244 — INP responsiveness validations (TS rules). */

const GUIDE = 'See agent-kit/developer/responsiveness-guide.md';
const SUPPRESS = 'Suppress with // jay-inp: allow on the same line.';

function dialogWarning(line: number, callee: string): string {
    return (
        `page.ts:${line} — "${callee}(" blocks the main thread and hurts INP; ` +
        `use an in-app dialog driven by ViewState. ${SUPPRESS} ${GUIDE}`
    );
}

function timeoutWarning(line: number): string {
    return (
        `page.ts:${line} — setTimeout(…, 0) queues behind all other tasks; ` +
        `yield with scheduler.yield() (with fallback). ${SUPPRESS} ${GUIDE}`
    );
}

/** Wraps handler body lines in a named constructor passed by name, the usual page layout. */
function namedPage(handlerBody: string[]): string {
    return [
        'function Page(props, refs) {', // 1
        '    refs.save.onclick(async () => {', // 2
        ...handlerBody.map((l) => '        ' + l), // 3..
        '    });',
        '    return { render: () => ({}) };',
        '}',
        'export const page = makeJayStackComponent()',
        '    .withInteractive(Page);',
    ].join('\n');
}

describe('inp/blocking-dialog', () => {
    it('flags confirm( in an inline interactive constructor', () => {
        const src = [
            'export const page = makeJayStackComponent()',
            '    .withInteractive(function (props, refs) {',
            "        refs.a.onclick(() => confirm('x'));",
            '        return { render: () => ({}) };',
            '    });',
        ].join('\n');
        expect(findInpWarnings(src, 'page.ts')).toEqual([dialogWarning(3, 'confirm')]);
    });

    it('flags confirm( in a named constructor defined above withInteractive(Page)', () => {
        expect(findInpWarnings(namedPage(["confirm('x');"]), 'page.ts')).toEqual([
            dialogWarning(3, 'confirm'),
        ]);
    });

    it('flags alert( in a named arrow constructor', () => {
        const src = [
            'const Page = (props, refs) => {',
            "    refs.a.onclick(() => alert('hi'));",
            '    return { render: () => ({}) };',
            '};',
            'export const page = makeJayStackComponent().withInteractive(Page);',
        ].join('\n');
        expect(findInpWarnings(src, 'page.ts')).toEqual([dialogWarning(2, 'alert')]);
    });

    it('flags a typed const function-expression constructor', () => {
        const src = [
            'const Page: Ctor<P> = function (props, refs) {',
            "    refs.a.onclick(() => confirm('x'));",
            '    return { render: () => ({}) };',
            '};',
            'export const page = makeJayStackComponent().withInteractive(Page);',
        ].join('\n');
        expect(findInpWarnings(src, 'page.ts')).toEqual([dialogWarning(2, 'confirm')]);
    });

    it('flags an exported async function constructor', () => {
        const src = [
            'export async function Page(props, refs) {',
            "    refs.a.onclick(() => confirm('x'));",
            '    return { render: () => ({}) };',
            '}',
            'export const page = makeJayStackComponent().withInteractive(Page);',
        ].join('\n');
        expect(findInpWarnings(src, 'page.ts')).toEqual([dialogWarning(2, 'confirm')]);
    });

    it('does not scan withFastRender functions', () => {
        const src = [
            "function renderFast() { confirm('x'); }",
            'function Page(props, refs) { return { render: () => ({}) }; }',
            'export const page = makeJayStackComponent()',
            '    .withFastRender(renderFast)',
            '    .withInteractive(Page);',
        ].join('\n');
        expect(findInpWarnings(src, 'page.ts')).toEqual([]);
    });

    it('ignores foo.confirm(', () => {
        expect(findInpWarnings(namedPage(["foo.confirm('x');"]), 'page.ts')).toEqual([]);
    });

    it('flags window.confirm(', () => {
        expect(findInpWarnings(namedPage(["window.confirm('x');"]), 'page.ts')).toEqual([
            dialogWarning(3, 'window.confirm'),
        ]);
    });

    it('honours // jay-inp: allow on the same line', () => {
        expect(
            findInpWarnings(namedPage(["window.confirm('x'); // jay-inp: allow"]), 'page.ts'),
        ).toEqual([]);
    });

    it('ignores strings, comments and declarations named confirm', () => {
        const body = [
            "const msg = 'Please confirm (y/n)';",
            '// confirm( later',
            '/* alert(1) */',
            'const api = { confirm() { return 1; } };',
            'class X { confirm(): void { } }',
            'function confirm() { return 1; }',
        ];
        expect(findInpWarnings(namedPage(body), 'page.ts')).toEqual([]);
    });

    it('flags confirm( used as a condition', () => {
        const body = ["if (confirm('x')) {", '}', "if (!confirm('y')) return;"];
        expect(findInpWarnings(namedPage(body), 'page.ts')).toEqual([
            dialogWarning(3, 'confirm'),
            dialogWarning(5, 'confirm'),
        ]);
    });

    it('ignores confirm( inside a regex literal and a nested template', () => {
        const body = ['const ok = /confirm\\(/.test(s);', 'const t = `${ `confirm(` }`;'];
        expect(findInpWarnings(namedPage(body), 'page.ts')).toEqual([]);
    });

    it('scans nothing when the file has no withInteractive', () => {
        const src = "function renderFast() { confirm('x'); setTimeout(r, 0); }";
        expect(findInpWarnings(src, 'page.ts')).toEqual([]);
    });
});

describe('inp/settimeout-zero-yield', () => {
    it.each([
        ['setTimeout(r, 0);'],
        ['setTimeout(() => doWork(), 0);'],
        ['setTimeout(() => fn(a, b), 0);'],
        ['await new Promise(r => setTimeout(r, 0));'],
    ])('flags %s', (code) => {
        expect(findInpWarnings(namedPage([code]), 'page.ts')).toEqual([timeoutWarning(3)]);
    });

    it.each([
        ['setTimeout(r, 0.0);'],
        ['setTimeout(r, -0);'],
        ['setTimeout(r, 100);'],
        ['setTimeout(r);'],
        ['setTimeout(r, delay);'],
    ])('does not flag %s', (code) => {
        expect(findInpWarnings(namedPage([code]), 'page.ts')).toEqual([]);
    });

    it('honours // jay-inp: allow', () => {
        expect(
            findInpWarnings(namedPage(['setTimeout(r, 0); // jay-inp: allow']), 'page.ts'),
        ).toEqual([]);
    });
});

describe('maskSource', () => {
    it('keeps length and line count', () => {
        const src = "a('x\\'y'); // c\n/* b\n */ const t = `q${ `z` }w`; /re\\/[/]x/g.test(s);\n";
        const masked = maskSource(src);
        expect(masked.length).toBe(src.length);
        expect(masked.split('\n').length).toBe(src.split('\n').length);
    });

    it('blanks string, comment and regex text but keeps template expressions', () => {
        const masked = maskSource("f('confirm(') // alert(\nx = `a${ g(1) }b` + /p(/g");
        const blank = (n: number) => ' '.repeat(n);
        expect(masked).toBe(
            `f('${blank(8)}') ${blank(9)}\nx = \`${blank(1)}\${ g(1) }${blank(1)}\` + /${blank(2)}/g`,
        );
    });
});

describe('real fake-shop product page', () => {
    const pagePath = path.resolve(
        __dirname,
        '../../../../examples/jay-stack/fake-shop/src/pages/products/[slug]/page.ts',
    );

    it('finds nothing in the page as committed', () => {
        expect(findInpWarnings(readFileSync(pagePath, 'utf-8'), 'page.ts')).toEqual([]);
    });

    it('finds a confirm( planted in the named constructor handler', () => {
        const lines = readFileSync(pagePath, 'utf-8').split('\n');
        const handlerLine = lines.findIndex((l) => l.includes('refs.addToCart.onclick('));
        expect(handlerLine).toBeGreaterThan(-1);
        lines.splice(handlerLine + 1, 0, "        if (!confirm('Add?')) return;");
        expect(findInpWarnings(lines.join('\n'), 'page.ts')).toEqual([
            dialogWarning(handlerLine + 2, 'confirm'),
        ]);
    });
});

describe('jay-stack validate integration', () => {
    const fixtures = path.resolve(__dirname, 'fixtures/inp-responsiveness');

    it('reports INP warnings next to the unchanged DOM-access warning', async () => {
        const result = await validateJayFiles({ path: path.join(fixtures, 'page-warnings') });
        const pageWarnings = result.warnings.filter((w) => w.file.endsWith('page.jay-html'));
        expect(pageWarnings.map((w) => w.message)).toEqual([
            'page.ts:3 — Direct DOM access "document.querySelector" — use Jay refs instead. ' +
                'Suppress with // jay-dom: allow on the same line. ' +
                'See agent-kit/developer/component-refs.md',
            dialogWarning(4, 'confirm'),
            timeoutWarning(5),
        ]);
    });
});

describe('guide pointers', () => {
    it('every INP message points to an existing agent-kit guide', () => {
        const messages = [dialogWarning(1, 'confirm'), timeoutWarning(1)];
        for (const msg of messages) {
            const guide = /See agent-kit\/(\S+)$/.exec(msg)![1];
            expect(existsSync(path.resolve(__dirname, '../agent-kit-template', guide))).toBe(true);
        }
    });
});
