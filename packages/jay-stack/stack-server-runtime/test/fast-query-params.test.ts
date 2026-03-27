import { renderFastChangingData } from '../lib';
import { PageProps, phaseOutput, RequestQuery } from '@jay-framework/fullstack-component';
import { DevServerPagePart } from '../lib/load-page-parts';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

const PAGE_PROPS: PageProps = {
    language: 'en',
    url: '/products?page=2&sort=price',
};
const PAGE_PARAMS = { slug: 'vases' };

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
        clientPart: 'not important for this test',
        clientImport: 'not important for this test',
    };
}

describe('fast phase query parameters (DL#117)', () => {
    it('should pass query params to fast render props', async () => {
        let receivedQuery: Record<string, string> | undefined;
        const part = makeTestComponent(async (props: PageProps & RequestQuery) => {
            receivedQuery = props.query;
            return phaseOutput({ result: 'ok' }, {});
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
            { page: '2', sort: 'price' },
        );

        expect(receivedQuery).toEqual({ page: '2', sort: 'price' });
    });

    it('should default query to empty object when not provided', async () => {
        let receivedQuery: Record<string, string> | undefined;
        const part = makeTestComponent(async (props: PageProps & RequestQuery) => {
            receivedQuery = props.query;
            return phaseOutput({ result: 'ok' }, {});
        });

        await renderFastChangingData(PAGE_PARAMS, PAGE_PROPS, {}, [part]);

        expect(receivedQuery).toEqual({});
    });

    it('should not pass query params to slow render props', async () => {
        let receivedProps: any;
        const part: DevServerPagePart = {
            compDefinition: {
                services: [],
                contexts: [],
                loadParams: async function* () {},
                slowlyRender: async (props: any) => {
                    receivedProps = props;
                    return phaseOutput({ data: 'slow' }, {});
                },
                fastRender: async (props: PageProps & RequestQuery) => {
                    return phaseOutput({ data: 'fast' }, {});
                },
                comp: undefined as any,
            },
            clientPart: 'not important for this test',
            clientImport: 'not important for this test',
        };

        const { DevSlowlyChangingPhase } = await import('../lib');
        const slowlyPhase = new DevSlowlyChangingPhase();
        await slowlyPhase.runSlowlyForPage(PAGE_PARAMS, PAGE_PROPS, [part]);

        expect(receivedProps).toBeDefined();
        expect(receivedProps.query).toBeUndefined();
        expect(receivedProps.language).toBe('en');
        expect(receivedProps.slug).toBe('vases');
    });

    it('should include pageProps and pageParams alongside query in fast props', async () => {
        let receivedProps: any;
        const part = makeTestComponent(async (props: any) => {
            receivedProps = props;
            return phaseOutput({ result: 'ok' }, {});
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
            { q: 'search' },
        );

        expect(receivedProps.language).toBe('en');
        expect(receivedProps.url).toBe('/products?page=2&sort=price');
        expect(receivedProps.slug).toBe('vases');
        expect(receivedProps.query).toEqual({ q: 'search' });
    });
});
