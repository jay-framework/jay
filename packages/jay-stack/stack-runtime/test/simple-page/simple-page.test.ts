import {
    DevSlowlyChangingPhase,
    makeCompositeJayComponent,
    PageProps,
    partialRender,
    renderFastChangingData
} from '../../lib';
import { page } from './page';
import { render as renderSlowly } from './compiled-slowly/page.slowly-rendered.jay-html'
import { makeJayComponent } from 'jay-component';
import { prettify } from 'jay-compiler-shared';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
};
const PAGE_PARAMS = {};
const PAGE_PARTS = [{compDefinition: page}];

describe('rendering a simple page', () => {
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
                    slowlyRendered: 'SLOWLY RENDERED',
                },
                {
                    carryForwardSlowly: 'SLOWLY -> FAST CARRY FORWARD',
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
                    fastDynamicRendered:
                        "FAST RENDERED, using 'SLOWLY -> FAST CARRY FORWARD'",
                    fastRendered: "FAST RENDERED",
                },
                {
                    carryForwardFast: 'FAST -> INTERACTIVE CARRY FORWARD',
                    fastDynamicRendered:
                        "FAST RENDERED, using 'SLOWLY -> FAST CARRY FORWARD'",
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

        const comp = makeCompositeJayComponent(renderSlowly, fastRenderResult.rendered, PAGE_PARTS);
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>SLOWLY RENDERED</div>
                <div>FAST RENDERED</div>
                <div>FAST RENDERED, using 'SLOWLY -&gt; FAST CARRY FORWARD'</div>
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

        const comp = makeCompositeJayComponent(renderSlowly, fastRenderResult.rendered, PAGE_PARTS);
        const instance = comp({ ...PAGE_PROPS, ...fastCarryForward } as any);

        await instance.element.refs.button.exec$((_) => _.click());

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>SLOWLY RENDERED</div>
                <div>FAST RENDERED</div>
                <div>INTERACTIVE RENDERED, using 'FAST -&gt; INTERACTIVE CARRY FORWARD'</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });
});
