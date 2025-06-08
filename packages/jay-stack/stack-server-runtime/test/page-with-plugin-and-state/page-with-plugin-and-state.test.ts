import { DevSlowlyChangingPhase, renderFastChangingData } from '../../lib';
import { render } from './compiled-slowly/page.slowly-rendered.jay-html';
import { prettify } from 'jay-compiler-shared';
import { plugin } from '../simple-plugin/simple-plugin';
import { page } from './page';
import { PageProps, partialRender } from 'jay-fullstack-component';
import { makeCompositeJayComponent } from 'jay-stack-client-runtime';
import { DevServerPagePart } from '../../lib/load-page-parts';

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
    {
        compDefinition: page,
        clientPart: 'not important for this test',
        clientImport: 'not important for this test',
    },
];

describe('rendering a page with plugin and state', () => {
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
                    pageSlowlyRendered: 'SLOWLY RENDERED',
                },
                {
                    plugin: {
                        staticData: 'SLOWLY -> FAST CARRY FORWARD',
                    },
                    carryForwardSlowly: 'SLOWLY -> FAST CARRY FORWARD',
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
        if (slowlyRenderResult.kind !== 'PartialRender')
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
                    pageFastDynamicRendered: "FAST RENDERED, using 'SLOWLY -> FAST CARRY FORWARD'",
                },
                {
                    plugin: {
                        dynamicData: 'FAST -> INTERACTIVE CARRY FORWARD',
                        pluginInteractiveRendered:
                            'FAST RENDERED, using SLOWLY -> FAST CARRY FORWARD',
                    },
                    carryForwardFast: 'FAST -> INTERACTIVE CARRY FORWARD',
                    pageFastDynamicRendered: "FAST RENDERED, using 'SLOWLY -> FAST CARRY FORWARD'",
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
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            render,
            fastRenderResult.rendered,
            fastCarryForward,
            PAGE_PARTS,
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <h2>Plugin Values</h2>
                <div>Plugin Slow: SLOWLY RENDERED</div>
                <div>Plugin Fast: FAST RENDERED, using SLOWLY -&gt; FAST CARRY FORWARD</div>
                <button data-id="plugin-button">Plugin Button</button>
                <h2>Page Values</h2>
                <div>Page Slow: SLOWLY RENDERED</div>
                <div>Page Fast: FAST RENDERED, using 'SLOWLY -&gt; FAST CARRY FORWARD'</div>
                <button data-id="page-button">Page Button</button>
            </div>`),
        );
    });

    it('interactive phase should function and react to events for both plugin and page', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeCompositeJayComponent(
            render,
            fastRenderResult.rendered,
            fastCarryForward,
            PAGE_PARTS,
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        // Test plugin button click
        await instance.element.refs.plugin.pluginButton.exec$((_) => _.click());
        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <h2>Plugin Values</h2>
                <div>Plugin Slow: SLOWLY RENDERED</div>
                <div>Plugin Fast: INTERACTIVE RENDERED, using FAST -&gt; INTERACTIVE CARRY FORWARD</div>
                <button data-id="plugin-button">Plugin Button</button>
                <h2>Page Values</h2>
                <div>Page Slow: SLOWLY RENDERED</div>
                <div>Page Fast: FAST RENDERED, using 'SLOWLY -&gt; FAST CARRY FORWARD'</div>
                <button data-id="page-button">Page Button</button>
            </div>`),
        );

        // Test page button click
        await instance.element.refs.button.exec$((_) => _.click());
        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <h2>Plugin Values</h2>
                <div>Plugin Slow: SLOWLY RENDERED</div>
                <div>Plugin Fast: INTERACTIVE RENDERED, using FAST -&gt; INTERACTIVE CARRY FORWARD</div>
                <button data-id="plugin-button">Plugin Button</button>
                <h2>Page Values</h2>
                <div>Page Slow: SLOWLY RENDERED</div>
                <div>Page Fast: INTERACTIVE RENDERED, using 'FAST -&gt; INTERACTIVE CARRY FORWARD'</div>
                <button data-id="page-button">Page Button</button>
            </div>`),
        );
    });
});
