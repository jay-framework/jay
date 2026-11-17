import { describe, it, expect } from 'vitest';
import { checkGetActionsReadingCookies } from '../lib/check-get-actions-reading-cookies';

const FILE = 'lib/actions.ts';

function warningLines(source: string): number[] {
    return checkGetActionsReadingCookies(source, FILE).map((warning) => warning.line);
}

describe('checkGetActionsReadingCookies (DL#234)', () => {
    it('warns for a single-line makeJayQuery chain that calls withRequest', () => {
        const source = `export const cart = makeJayQuery('cart.current').withRequest().withHandler(async () => 1);\n`;

        expect(checkGetActionsReadingCookies(source, FILE)).toEqual([
            {
                file: FILE,
                line: 1,
                code: 'get-action-reads-cookies',
                message:
                    "lib/actions.ts:1 — GET action 'cart.current' reads cookies (.withRequest()). " +
                    'It must not change state; use makeJayAction (POST) for writes. ' +
                    'Cross-origin calls are rejected. Suppress with // jay-action: allow-get-request',
            },
        ]);
    });

    it('warns for a multi-line chain on the line of the builder call', () => {
        const source = [
            `import { makeJayQuery } from '@jay-framework/fullstack-component';`,
            ``,
            `export const cart = makeJayQuery('cart.current')`,
            `    .withRequest()`,
            `    .withHandler(async () => 1);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([3]);
    });

    it.each([
        ['single', `makeJayAction('x').withMethod('GET').withRequest().withHandler(h);`],
        ['double', `makeJayAction("x").withMethod("GET").withRequest().withHandler(h);`],
        ['backtick', 'makeJayAction(`x`).withMethod(`GET`).withRequest().withHandler(h);'],
    ])('warns for makeJayAction with withMethod GET in %s quotes', (_quote, source) => {
        expect(warningLines(source)).toEqual([1]);
    });

    it.each([
        ['a POST action', `makeJayAction('x').withRequest().withHandler(h);`],
        ['a query without withRequest', `makeJayQuery('x').withHandler(h);`],
        [
            'a query switched to POST',
            `makeJayQuery('x').withMethod('POST').withRequest().withHandler(h);`,
        ],
        [
            'withRequest only in a comment',
            `makeJayQuery('x') // .withRequest()\n    .withHandler(h);`,
        ],
    ])('does not warn for %s', (_label, source) => {
        expect(warningLines(source)).toEqual([]);
    });

    it('only looks at its own chain, up to withHandler', () => {
        const source = [
            `export const a = makeJayQuery('a').withHandler(h);`,
            `export const b = makeJayAction('b').withRequest().withHandler(h);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([]);
    });

    it('does not warn with the suppress comment trailing the builder-call line', () => {
        const source = [
            `export const cart = makeJayQuery('cart.current') // jay-action: allow-get-request`,
            `    .withRequest()`,
            `    .withHandler(async () => 1);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([]);
    });

    it('does not warn with the suppress comment alone on the line directly above', () => {
        const source = [
            `// jay-action: allow-get-request`,
            `export const cart = makeJayQuery('cart.current').withRequest().withHandler(h);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([]);
    });

    it('still warns when the suppress comment is two lines above', () => {
        const source = [
            `// jay-action: allow-get-request`,
            ``,
            `export const cart = makeJayQuery('cart.current').withRequest().withHandler(h);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([3]);
    });

    it('still warns when the suppress comment is inside the chain', () => {
        const source = [
            `export const cart = makeJayQuery('cart.current')`,
            `    .withRequest() // jay-action: allow-get-request`,
            `    .withHandler(async () => 1);`,
        ].join('\n');

        expect(warningLines(source)).toEqual([1]);
    });

    it('is not confused by // inside a string literal', () => {
        const source = `makeJayQuery('x').withRequest().withHandler(async () => fetch('https://a.example/b'));`;

        expect(warningLines(source)).toEqual([1]);
    });
});
