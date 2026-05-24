import { renderFastChangingData } from '../lib';
import { parseCookies } from '../lib';
import { phaseOutput } from '@jay-framework/fullstack-component';
import { DevServerPagePart } from '../lib';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

const PAGE_PROPS = { language: 'en', url: '/page' };
const PAGE_PARAMS = {};

function makeTestComponent(
    fastRender: AnyJayStackComponentDefinition['fastRender'],
): DevServerPagePart {
    return {
        compDefinition: {
            services: [],
            contexts: [],
            loadParams: async function* () {},
            slowlyRender: undefined as any,
            fastRender,
            comp: undefined as any,
        },
        clientPart: 'not important',
        clientImport: 'not important',
    };
}

describe('parseCookies', () => {
    it('should parse a standard cookie header', () => {
        expect(parseCookies('session=abc123; lang=en')).toEqual({
            session: 'abc123',
            lang: 'en',
        });
    });

    it('should return empty object for null/undefined', () => {
        expect(parseCookies(null)).toEqual({});
        expect(parseCookies(undefined)).toEqual({});
    });

    it('should return empty object for empty string', () => {
        expect(parseCookies('')).toEqual({});
    });

    it('should handle cookies with = in value', () => {
        expect(parseCookies('token=abc=def=ghi')).toEqual({ token: 'abc=def=ghi' });
    });

    it('should decode URI-encoded values', () => {
        expect(parseCookies('name=hello%20world')).toEqual({ name: 'hello world' });
    });
});

describe('fast phase cookies (DL#141)', () => {
    it('should pass cookies to fast render props', async () => {
        let receivedCookies: Record<string, string> | undefined;
        const part = makeTestComponent(async (props: any) => {
            receivedCookies = props.cookies;
            return phaseOutput({ ok: true }, {});
        });

        await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            {},
            [part],
            undefined,
            undefined,
            undefined,
            undefined,
            {},
            { session: 'abc123' },
        );

        expect(receivedCookies).toEqual({ session: 'abc123' });
    });

    it('should default cookies to empty object when not provided', async () => {
        let receivedCookies: Record<string, string> | undefined;
        const part = makeTestComponent(async (props: any) => {
            receivedCookies = props.cookies;
            return phaseOutput({ ok: true }, {});
        });

        await renderFastChangingData(PAGE_PARAMS, PAGE_PROPS, {}, [part]);

        expect(receivedCookies).toEqual({});
    });
});

describe('fast phase responseHeaders (DL#141)', () => {
    it('should collect responseHeaders from phaseOutput', async () => {
        const part = makeTestComponent(async () => {
            return phaseOutput(
                { ok: true },
                {},
                {
                    responseHeaders: { 'Cache-Control': 'no-store' },
                },
            );
        });

        const result = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            {},
            [part],
            undefined,
            undefined,
            undefined,
            undefined,
            {},
        );

        expect(result.kind).toBe('PhaseOutput');
        expect((result as any).responseHeaders).toEqual({ 'Cache-Control': 'no-store' });
    });

    it('should merge responseHeaders from multiple parts (last-write-wins)', async () => {
        const part1 = makeTestComponent(async () => {
            return phaseOutput(
                { a: 1 },
                {},
                {
                    responseHeaders: { 'Cache-Control': 'max-age=3600', 'X-Custom': 'from-plugin' },
                },
            );
        });
        part1.key = 'plugin1';

        const part2 = makeTestComponent(async () => {
            return phaseOutput(
                { b: 2 },
                {},
                {
                    responseHeaders: { 'Cache-Control': 'no-store' },
                },
            );
        });
        part2.key = 'plugin2';

        const result = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            {},
            [part1, part2],
            undefined,
            undefined,
            undefined,
            undefined,
            {},
        );

        expect(result.kind).toBe('PhaseOutput');
        expect((result as any).responseHeaders).toEqual({
            'Cache-Control': 'no-store',
            'X-Custom': 'from-plugin',
        });
    });

    it('should not include responseHeaders when none are set', async () => {
        const part = makeTestComponent(async () => {
            return phaseOutput({ ok: true }, {});
        });

        const result = await renderFastChangingData(PAGE_PARAMS, PAGE_PROPS, {}, [part]);

        expect(result.kind).toBe('PhaseOutput');
        expect((result as any).responseHeaders).toBeUndefined();
    });
});
