import { DevSlowlyChangingPhase, renderFastChangingData } from '../lib';
import { phaseOutput } from '@jay-framework/fullstack-component';
import type { DevServerPagePart } from '../lib';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

const PAGE_PROPS = { language: 'en', url: '/page' };
const PAGE_PARAMS = {};

function makeKeyedPart(key: string, slowData: object, fastData: object): DevServerPagePart {
    return {
        compDefinition: {
            services: [],
            contexts: [],
            loadParams: async function* () {},
            slowlyRender: async () => phaseOutput(slowData, { fromSlow: true }),
            fastRender: async (_params, _props, cf) =>
                phaseOutput(fastData, { ...cf, fromFast: true }),
            comp: undefined as any,
        } as AnyJayStackComponentDefinition,
        key,
        clientPart: '',
        clientImport: '',
    };
}

describe('keyed headless components (DL#156)', () => {
    it('stores keyed part ViewState under the key through slow + fast phases', async () => {
        const part = makeKeyedPart('myWidget', { text: 'hello' }, { animated: true });
        const slowPhase = new DevSlowlyChangingPhase();

        const slowResult = await slowPhase.runSlowlyForPage(PAGE_PARAMS, PAGE_PROPS, [part]);
        expect(slowResult.kind).toBe('PhaseOutput');
        expect((slowResult as any).rendered).toEqual({
            myWidget: { text: 'hello' },
        });

        const fastResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            (slowResult as any).carryForward,
            [part],
        );
        expect(fastResult.kind).toBe('PhaseOutput');
        expect((fastResult as any).rendered).toEqual({
            myWidget: { animated: true },
        });
    });

    it('multiple keyed parts each get their own ViewState namespace', async () => {
        const parts = [
            makeKeyedPart('letterTumble', { text: 'a' }, { x: 1 }),
            makeKeyedPart('scrollCarousel', { items: [] }, { y: 2 }),
        ];
        const slowPhase = new DevSlowlyChangingPhase();

        const slowResult = await slowPhase.runSlowlyForPage(PAGE_PARAMS, PAGE_PROPS, parts);
        expect((slowResult as any).rendered).toEqual({
            letterTumble: { text: 'a' },
            scrollCarousel: { items: [] },
        });

        const fastResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            (slowResult as any).carryForward,
            parts,
        );
        expect((fastResult as any).rendered).toEqual({
            letterTumble: { x: 1 },
            scrollCarousel: { y: 2 },
        });
    });

    it('un-keyed part merges ViewState into page root alongside keyed parts', async () => {
        const keyedPart = makeKeyedPart('myWidget', { text: 'hello' }, { animated: true });
        const unkeyedPart: DevServerPagePart = {
            compDefinition: {
                services: [],
                contexts: [],
                loadParams: async function* () {},
                slowlyRender: async () => phaseOutput({ title: 'Page' }, {}),
                fastRender: async () => phaseOutput({ count: 5 }, {}),
                comp: undefined as any,
            } as AnyJayStackComponentDefinition,
            clientPart: '',
            clientImport: '',
        };
        const slowPhase = new DevSlowlyChangingPhase();

        const slowResult = await slowPhase.runSlowlyForPage(PAGE_PARAMS, PAGE_PROPS, [
            keyedPart,
            unkeyedPart,
        ]);
        expect((slowResult as any).rendered).toEqual({
            myWidget: { text: 'hello' },
            title: 'Page',
        });
    });
});
