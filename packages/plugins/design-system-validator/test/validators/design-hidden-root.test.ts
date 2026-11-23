import { describe, it, expect } from 'vitest';
import { validateHiddenRoot } from '../../lib/tools';
import { COMPONENT, makeContext, suppressed } from './cls-test-context';

const SUGGESTION =
    'Remove it. If content must wait for a script, use <script blocking="render" jay-script="allow"> (inline, or an external URL; local src files are not allowed) instead, see designer/script-tags.md. If intentional, suppress with design-system: { allow-hidden-root: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md';
const TAIL =
    'The page stays invisible until a script reveals it (anti-flicker). This delays LCP and leaves invisible content clickable.';

function cssFinding(selector: string, property: string, value: string) {
    return {
        severity: 'warning',
        message: `"${selector}" sets ${property}: ${value}. ${TAIL}`,
        suggestion: SUGGESTION,
        element: selector,
    };
}

function inlineFinding(tag: string, property: string, value: string) {
    return {
        severity: 'warning',
        message: `<${tag}> style sets ${property}: ${value}. ${TAIL}`,
        suggestion: SUGGESTION,
        element: `<${tag}>`,
        attribute: 'style',
    };
}

const DEFAULT_BODY = '<body><main id="app"><div class="modal"></div></main></body>';

const check = (css: string, body = DEFAULT_BODY, overrides = {}) =>
    validateHiddenRoot(
        makeContext(`<html><head><style>${css}</style></head>${body}</html>`, overrides),
    );

describe('validateHiddenRoot (DL#242)', () => {
    it('body opacity 0', async () => {
        expect(await check('body { opacity: 0; }')).toEqual([cssFinding('body', 'opacity', '0')]);
    });
    it('html visibility hidden', async () => {
        expect(await check('html { visibility: hidden; }')).toEqual([
            cssFinding('html', 'visibility', 'hidden'),
        ]);
    });
    it(':root opacity 0%', async () => {
        expect(await check(':root { opacity: 0%; }')).toEqual([
            cssFinding(':root', 'opacity', '0%'),
        ]);
    });
    it('body.dark without the static class', async () => {
        expect(await check('body.dark { opacity: 0; }')).toEqual([
            cssFinding('body.dark', 'opacity', '0'),
        ]);
    });
    it('html.async-hide', async () => {
        expect(await check('html.async-hide { opacity: 0; }')).toEqual([
            cssFinding('html.async-hide', 'opacity', '0'),
        ]);
    });
    it('.dark alone does not target the root', async () => {
        expect(await check('.dark { opacity: 0; }')).toEqual([]);
    });
    it('#app direct child', async () => {
        expect(await check('#app { visibility: hidden; }')).toEqual([
            cssFinding('#app', 'visibility', 'hidden'),
        ]);
    });
    it('body > main', async () => {
        expect(await check('body > main { opacity: 0; }')).toEqual([
            cssFinding('body > main', 'opacity', '0'),
        ]);
    });
    it('body > * gives one finding for the selector', async () => {
        const body = '<body><header></header><main></main><footer></footer></body>';
        expect(await check('body > * { opacity: 0; }', body)).toEqual([
            cssFinding('body > *', 'opacity', '0'),
        ]);
    });
    it('a transition beside it still warns', async () => {
        expect(await check('body { opacity: 0; transition: opacity .3s; }')).toEqual([
            cssFinding('body', 'opacity', '0'),
        ]);
    });
    it('strips !important before the value check', async () => {
        expect(await check('body { opacity: 0 !important; }')).toEqual([
            cssFinding('body', 'opacity', '0'),
        ]);
    });
    it('inline style on a direct child', async () => {
        expect(await check('', '<body><main style="opacity:0"></main></body>')).toEqual([
            inlineFinding('main', 'opacity', '0'),
        ]);
    });
    it('inline style on body', async () => {
        expect(await check('', '<body style="visibility: hidden"><main></main></body>')).toEqual([
            inlineFinding('body', 'visibility', 'hidden'),
        ]);
    });
    it('nested element is not flagged', async () => {
        expect(await check('.modal { opacity: 0; }')).toEqual([]);
    });
    it('pseudo-elements are skipped (double and single colon)', async () => {
        expect(
            await check('body::before { opacity: 0; } html:after { visibility: hidden; }'),
        ).toEqual([]);
    });
    it('root inside :not() / :is() does not count', async () => {
        expect(await check('.x:not(body) { opacity: 0; } :is(html) .card { opacity: 0; }')).toEqual(
            [],
        );
    });
    it('selector lists are checked per selector', async () => {
        expect(await check('html, body { opacity: 0; }')).toEqual([
            cssFinding('html', 'opacity', '0'),
            cssFinding('body', 'opacity', '0'),
        ]);
    });
    it('partial opacity is fine', async () => {
        expect(await check('body { opacity: .5; }')).toEqual([]);
    });
    it.each([
        '@media (min-width: 1px) { body { opacity: 0; } }',
        '@keyframes f { from { opacity: 0; } }',
        '@starting-style { body { opacity: 0; } }',
        '@supports (display: grid) { body { opacity: 0; } }',
        '@container (min-width: 1px) { body { opacity: 0; } }',
    ])('excluded at-rule: %s', async (css) => {
        expect(await check(css)).toEqual([]);
    });
    it('@layer counts as base', async () => {
        expect(await check('@layer base { body { opacity: 0; } }')).toEqual([
            cssFinding('body', 'opacity', '0'),
        ]);
    });
    it('component files are skipped', async () => {
        expect(await check('body { opacity: 0; }', DEFAULT_BODY, { filePath: COMPONENT })).toEqual(
            [],
        );
    });
    it('suppression', async () => {
        expect(
            await check('body { opacity: 0; }', DEFAULT_BODY, suppressed('allow-hidden-root')),
        ).toEqual([]);
    });
});
