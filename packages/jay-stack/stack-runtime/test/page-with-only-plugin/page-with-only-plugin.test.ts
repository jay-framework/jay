import {
    DevSlowlyChangingPhase,
    makeCompositeJayComponent,
    PageProps,
    partialRender,
    renderFastChangingData
} from '../../lib';
import { render } from './compiled-slowly/page.slowly-rendered.jay-html'
import { prettify } from 'jay-compiler-shared';
import { plugin } from '../simple-plugin/simple-plugin'

const PAGE_PROPS: PageProps = {
    language: 'en-us',
};
const PAGE_PARAMS = {};
const PAGE_PARTS = [{compDefinition: plugin, key: 'plugin'}];

describe('rendering a page with only a plugin', () => {
    it('should run the slowly changing phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    plugin: {
                        pluginSlowlyRendered: "SLOWLY RENDERED",
                    },
                },
                {
                    plugin: {
                        staticData: "SLOWLY -> FAST CARRY FORWARD",
                    },
                },
            ),
        );
    });

    it('should run the fast changing phase, getting the carry forward from the slowly phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    plugin: {
                        pluginInteractiveRendered: "FAST RENDERED, using SLOWLY -> FAST CARRY FORWARD",
                    },
                },
                {
                    plugin: {
                        dynamicData: "FAST -> INTERACTIVE CARRY FORWARD",
                        pluginInteractiveRendered: "FAST RENDERED, using SLOWLY -> FAST CARRY FORWARD",
                    },
                },
            ),
        );
    });

    it('should run the interactive phase, getting the carry forward from the fast phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(render, fastRenderResult.render, PAGE_PARTS)
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward } as any);

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
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(render, fastRenderResult.render, PAGE_PARTS)
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward });

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
