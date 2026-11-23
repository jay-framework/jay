import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/a11y-validator.js';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
    JayHtmlHeadMeta,
} from '@jay-framework/compiler-shared';

/** DL#239 — keyboard focus, inert and dialogs. Test numbers follow the design log's table. */

const FOCUS_GUIDE = 'agent-kit/designer/focus-and-dialogs.md';

function makeContext(html: string, head?: JayHtmlHeadMeta, css?: string): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        head,
        css,
    };
}

function cssContext(css: string): JayHtmlValidationContext {
    return makeContext('<div></div>', undefined, css);
}

const RULE_MESSAGES: Record<string, RegExp> = {
    'custom-modal': /is a hand-rolled (modal|dialog)\./,
    'dialog-name': /^<dialog> has no accessible name\./,
    'outline-without-focus-visible': /removes the focus outline with no :focus-visible replacement/,
    'outline-none-unconditional':
        /removes (focus outlines everywhere|the focus outline\. Move the style)/,
    'autofocus-outside-dialog': /^autofocus outside a dialog moves focus/,
};

async function findingsFor(
    ctx: JayHtmlValidationContext,
    rule: keyof typeof RULE_MESSAGES,
): Promise<JayHtmlValidationFinding[]> {
    const findings = await validate(ctx);
    return findings.filter((f) => RULE_MESSAGES[rule].test(f.message));
}

async function focusFindings(ctx: JayHtmlValidationContext): Promise<JayHtmlValidationFinding[]> {
    const findings = await validate(ctx);
    return findings.filter((f) => Object.values(RULE_MESSAGES).some((re) => re.test(f.message)));
}

describe('DL#239 custom-modal', () => {
    it('1: flags role="dialog" aria-modal="true" on a div once, with the modal message and guide', async () => {
        const found = await findingsFor(
            makeContext('<div role="dialog" aria-modal="true"><h2>x</h2></div>'),
            'custom-modal',
        );
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('warning');
        expect(found[0].message).toMatch(/^<div aria-modal="true"> is a hand-rolled modal\./);
        expect(found[0].suggestion).toMatch(/allow-custom-modal/);
        expect(found[0].suggestion?.endsWith(FOCUS_GUIDE)).toBe(true);
    });

    it('2: flags aria-modal on a section', async () => {
        const found = await findingsFor(
            makeContext('<section aria-modal="true"><p>x</p></section>'),
            'custom-modal',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^<section aria-modal="true"> is a hand-rolled modal/);
    });

    it('3: flags a non-modal role="dialog" with the non-modal message', async () => {
        const found = await findingsFor(
            makeContext('<div role="dialog"><p>x</p></div>'),
            'custom-modal',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^<div role="dialog"> is a hand-rolled dialog/);
    });

    it('4: does not flag aria-modal on a <dialog>', async () => {
        const found = await findingsFor(
            makeContext('<dialog aria-modal="true" aria-label="x"><p>x</p></dialog>'),
            'custom-modal',
        );
        expect(found).toEqual([]);
    });

    it('5: is suppressed by a11y: { allow-custom-modal: true }', async () => {
        const ctx = {
            ...makeContext('<div role="dialog" aria-modal="true"><h2>x</h2></div>'),
            validationOverrides: { a11y: { 'allow-custom-modal': true } },
        };
        expect(await findingsFor(ctx, 'custom-modal')).toEqual([]);
    });

    it('26a: treats role="alertdialog" without aria-modal as modal', async () => {
        const found = await findingsFor(
            makeContext('<div role="alertdialog"><p>x</p></div>'),
            'custom-modal',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^<div role="alertdialog"> is a hand-rolled modal/);
    });

    it('26k: skips dynamic role and aria-modal values', async () => {
        const found = await findingsFor(
            makeContext('<div role="{kind}" aria-modal="{isModal}"><p>x</p></div>'),
            'custom-modal',
        );
        expect(found).toEqual([]);
    });
});

describe('DL#239 dialog-name', () => {
    it('6: flags a <dialog> with no accessible name', async () => {
        const found = await findingsFor(makeContext('<dialog><p>x</p></dialog>'), 'dialog-name');
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('warning');
        expect(found[0].suggestion?.endsWith(FOCUS_GUIDE)).toBe(true);
    });

    it('7: a heading inside does not name the dialog', async () => {
        const found = await findingsFor(
            makeContext('<dialog><h2>Cart</h2></dialog>'),
            'dialog-name',
        );
        expect(found).toHaveLength(1);
    });

    it('8: aria-labelledby, aria-label or a dynamic label name the dialog', async () => {
        for (const html of [
            '<dialog aria-labelledby="t"><h2 id="t">T</h2></dialog>',
            '<dialog aria-label="x"><p>x</p></dialog>',
            '<dialog aria-label="{title}"><p>x</p></dialog>',
        ]) {
            expect(await findingsFor(makeContext(html), 'dialog-name')).toEqual([]);
        }
    });

    it('is suppressed by a11y: { allow-dialog-name: true }', async () => {
        const ctx = {
            ...makeContext('<dialog><p>x</p></dialog>'),
            validationOverrides: { a11y: { 'allow-dialog-name': true } },
        };
        expect(await findingsFor(ctx, 'dialog-name')).toEqual([]);
    });
});

describe('DL#239 outline-without-focus-visible', () => {
    it('9: flags .btn:focus { outline: none } with a location prefix', async () => {
        const found = await findingsFor(
            cssContext('.btn:focus{outline:none}'),
            'outline-without-focus-visible',
        );
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('warning');
        expect(found[0].message).toMatch(/^\[css line 1\] \.btn:focus removes the focus outline/);
        expect(found[0].suggestion?.endsWith(FOCUS_GUIDE)).toBe(true);
    });

    it('10: a matching :focus-visible outline is a replacement', async () => {
        const ctx = cssContext('.btn:focus{outline:0} .btn:focus-visible{outline:2px solid}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('11: :focus:not(:focus-visible) is the correct pattern', async () => {
        const ctx = cssContext('.btn:focus:not(:focus-visible){outline:none}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('12: reads body <style> elements', async () => {
        const ctx = makeContext(
            '<div><style>.btn:focus{outline:none}</style></div>',
            undefined,
            '',
        );
        const found = await findingsFor(ctx, 'outline-without-focus-visible');
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^\[style#1 line 1\] \.btn:focus/);
    });

    it('13: flags *:focus { outline: none }', async () => {
        const found = await findingsFor(
            cssContext('*:focus{outline:none}'),
            'outline-without-focus-visible',
        );
        expect(found).toHaveLength(1);
    });

    it('14: a bare :focus-visible outline covers *:focus', async () => {
        const ctx = cssContext('*:focus{outline:none} :focus-visible{outline:2px solid}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('15: a :focus-visible rule on a different key is not a replacement', async () => {
        const ctx = cssContext('.btn:focus{outline:none} .card:focus-visible{outline:2px solid}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toHaveLength(1);
    });

    it('16: a same-rule box-shadow is a visible replacement', async () => {
        const ctx = cssContext('.btn:focus{outline:none;box-shadow:0 0 0 2px blue}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('17: a replacement inside @media counts', async () => {
        const ctx = cssContext(
            '.btn:focus{outline:none} @media (min-width:1px){.btn:focus-visible{outline:2px solid}}',
        );
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('18: flattens nested &:focus', async () => {
        const found = await findingsFor(
            cssContext('.btn{&:focus{outline:none}}'),
            'outline-without-focus-visible',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch('.btn:focus removes');
    });

    it('19: a nested &:focus-visible replacement counts', async () => {
        const ctx = cssContext('.btn{&:focus{outline:none} &:focus-visible{outline:2px solid}}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('26b: flattens through a nested @media', async () => {
        const found = await findingsFor(
            cssContext('.btn{@media (min-width:1px){&:focus{outline:none}}}'),
            'outline-without-focus-visible',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch('.btn:focus removes');
    });

    it('26c: border none / border 0 is not a visible replacement', async () => {
        for (const css of [
            '.btn:focus{outline:none;border:none}',
            '.btn:focus{outline:none;border:0}',
        ]) {
            expect(
                await findingsFor(cssContext(css), 'outline-without-focus-visible'),
            ).toHaveLength(1);
        }
    });

    it('26d: a visible same-rule border is a replacement', async () => {
        const ctx = cssContext('.btn:focus{outline:none;border:2px solid blue}');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });

    it('26f: reports the external file and the line after the marker', async () => {
        const ctx = cssContext('/* External CSS: ./a.css */\n.x{}\n.btn:focus{outline:none}');
        const found = await findingsFor(ctx, 'outline-without-focus-visible');
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^\[\.\/a\.css line 2\] \.btn:focus/);
    });

    it('26h: mixed linked + head CSS names both sources and drops the line', async () => {
        const head: JayHtmlHeadMeta = { meta: [], links: [], styles: ['.y{}'] };
        const ctx = makeContext(
            '<div></div>',
            head,
            '/* External CSS: ./a.css */\n.x{}\n.btn:focus{outline:none}\n\n.y{}',
        );
        const found = await findingsFor(ctx, 'outline-without-focus-visible');
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch(/^\[\.\/a\.css \+ head style\] \.btn:focus/);
    });

    it('26l: cross-multiplies parent and nested selector lists', async () => {
        const found = await findingsFor(
            cssContext('.a,.b{&:focus{outline:none}}'),
            'outline-without-focus-visible',
        );
        expect(found.map((f) => f.message.replace(/^\[[^\]]*\] /, '').split(' ')[0])).toEqual([
            '.a:focus',
            '.b:focus',
        ]);
    });

    it('26m: a nested selector without & is a descendant (implicit "& ")', async () => {
        const found = await findingsFor(
            cssContext('.card{:focus{outline:none}}'),
            'outline-without-focus-visible',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toMatch('.card :focus removes');
    });

    it('does not fire on unparseable CSS', async () => {
        const ctx = cssContext('.btn:focus{outline:none');
        expect(await findingsFor(ctx, 'outline-without-focus-visible')).toEqual([]);
    });
});

describe('DL#239 outline-none-unconditional', () => {
    it('20: flags button { outline: none }', async () => {
        const found = await findingsFor(
            cssContext('button{outline:none}'),
            'outline-none-unconditional',
        );
        expect(found).toHaveLength(1);
        expect(found[0].message).toBe(
            '[css line 1] button { outline: none } removes focus outlines everywhere.',
        );
    });

    it('21: dialog and [popover] do not fire', async () => {
        const ctx = cssContext('dialog{outline:none} [popover]{outline:none}');
        expect(await findingsFor(ctx, 'outline-none-unconditional')).toEqual([]);
    });

    it('22: overflow hidden on .card or html is not a finding (no scroll-lock rule)', async () => {
        const ctx = cssContext('.card{overflow:hidden} html{overflow-y:hidden}');
        expect(await focusFindings(ctx)).toEqual([]);
    });

    it('26e: inline outline:none on a button fires, on a div does not', async () => {
        const onButton = await findingsFor(
            makeContext('<button style="outline: none">Go</button>'),
            'outline-none-unconditional',
        );
        expect(onButton).toHaveLength(1);
        expect(onButton[0].message).toMatch(
            /^<button style="outline: none"> removes the focus outline\. Move the style to CSS/,
        );
        const onDiv = await findingsFor(
            makeContext('<div style="outline:none">x</div>'),
            'outline-none-unconditional',
        );
        expect(onDiv).toEqual([]);
    });

    it('26n: anchored compounds fire', async () => {
        for (const css of [
            'button.primary{outline:none}',
            '[tabindex="0"]{outline:none}',
            'input[type=text]{outline:0}',
        ]) {
            expect(await findingsFor(cssContext(css), 'outline-none-unconditional')).toHaveLength(
                1,
            );
        }
    });

    it('26o: unanchored or pseudo-class compounds do not fire', async () => {
        for (const css of ['.btn{outline:none}', 'button:hover{outline:none}']) {
            expect(await findingsFor(cssContext(css), 'outline-none-unconditional')).toEqual([]);
        }
    });

    it('reports one finding per anchored selector in a list', async () => {
        const found = await findingsFor(
            cssContext('button, a, .x { outline: none }'),
            'outline-none-unconditional',
        );
        expect(found.map((f) => f.message)).toEqual([
            '[css line 1] button { outline: none } removes focus outlines everywhere.',
            '[css line 1] a { outline: none } removes focus outlines everywhere.',
        ]);
    });

    it('a matching :focus-visible replacement escapes (a)', async () => {
        const ctx = cssContext('button{outline:none} button:focus-visible{outline:2px solid}');
        expect(await findingsFor(ctx, 'outline-none-unconditional')).toEqual([]);
    });
});

describe('DL#239 autofocus-outside-dialog', () => {
    it('23: two autofocus inputs fire', async () => {
        const found = await findingsFor(
            makeContext('<input autofocus aria-label="a"><input autofocus aria-label="b">'),
            'autofocus-outside-dialog',
        );
        expect(found.length).toBeGreaterThanOrEqual(1);
        expect(found[0].suggestion?.endsWith(FOCUS_GUIDE)).toBe(true);
    });

    it('24: a single autofocus on a form element does not fire', async () => {
        const ctx = makeContext('<input autofocus aria-label="a">');
        expect(await findingsFor(ctx, 'autofocus-outside-dialog')).toEqual([]);
    });

    it('25: autofocus on a contenteditable div fires', async () => {
        const found = await findingsFor(
            makeContext('<div contenteditable autofocus>x</div>'),
            'autofocus-outside-dialog',
        );
        expect(found).toHaveLength(1);
    });

    it('26: autofocus inside a dialog does not fire', async () => {
        const ctx = makeContext('<dialog aria-label="x"><input autofocus aria-label="a"></dialog>');
        expect(await findingsFor(ctx, 'autofocus-outside-dialog')).toEqual([]);
    });

    it('26g: role=button div with tabindex and autofocus gives only autofocus-outside-dialog', async () => {
        const all = await validate(
            makeContext('<div role="button" tabindex="0" autofocus>Menu</div>'),
        );
        expect(all.map((f) => f.message)).toEqual([
            expect.stringMatching(RULE_MESSAGES['autofocus-outside-dialog']),
        ]);
    });

    it('26i: autofocus inside a dialog is not counted', async () => {
        const ctx = makeContext(
            '<input autofocus aria-label="a"><dialog aria-label="x"><input autofocus aria-label="b"></dialog>',
        );
        expect(await findingsFor(ctx, 'autofocus-outside-dialog')).toEqual([]);
    });

    it('26j: dynamic autofocus is skipped and not counted', async () => {
        const ctx = makeContext(
            '<input autofocus="{focusSearch}" aria-label="a"><input autofocus aria-label="b">',
        );
        expect(await findingsFor(ctx, 'autofocus-outside-dialog')).toEqual([]);
    });
});
