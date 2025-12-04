import { DevSlowlyChangingPhase, renderFastChangingData } from '../../lib';
import { render } from './compiled-slowly/page.slowly-rendered.jay-html';
import { prettify } from '@jay-framework/compiler-shared';
import { plugin } from '../simple-plugin/simple-plugin';
import { PageProps, partialRender } from '@jay-framework/fullstack-component';
import { makeCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { DevServerPagePart } from '../../lib/load-page-parts';
import { toCompositePart } from '../utils/to-composite.part';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
    url: '/',
};
const PAGE_PARAMS = {};
const PAGE_PARTS: DevServerPagePart[] = [
    {
        compDefinition: plugin,
        key: 'plugin',
        clientPart: 'not important for this test',
        clientImport: 'not important for this test',
    },
];

describe('rendering a page with only a plugin', () => {
    it('should run the slowly changing phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    plugin: {
                        pluginSlowlyRendered: 'SLOWLY RENDERED',
                    },
                },
                {
                    plugin: {
                        staticData: 'SLOWLY -> FAST CARRY FORWARD',
                    },
                },
            ),
        );
    });

    it('should run the fast changing phase, getting the carry forward from the slowly phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PhaseOutput')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    plugin: {
                        pluginInteractiveRendered:
                            'FAST RENDERED, using SLOWLY -> FAST CARRY FORWARD',
                    },
                },
                {
                    plugin: {
                        dynamicData: 'FAST -> INTERACTIVE CARRY FORWARD',
                        pluginInteractiveRendered:
                            'FAST RENDERED, using SLOWLY -> FAST CARRY FORWARD',
                    },
                },
            ),
        );
    });

    it('should run the interactive phase, getting the carry forward from the fast phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PhaseOutput')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PhaseOutput')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            render,
            fastRenderResult.rendered,
            fastCarryForward,
            toCompositePart(PAGE_PARTS),
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text</div>
                <div>FAST RENDERED, using SLOWLY -&gt; FAST CARRY FORWARD</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });

    it('interactive phase should function and react to events', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PhaseOutput')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PhaseOutput')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            render,
            fastRenderResult.rendered,
            fastCarryForward,
            toCompositePart(PAGE_PARTS),
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        await instance.element.refs.plugin.pluginButton.exec$((_) => _.click());

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text</div>
                <div>INTERACTIVE RENDERED, using FAST -&gt; INTERACTIVE CARRY FORWARD</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });
});
