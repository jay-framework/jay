import { DevSlowlyChangingPhase, PageProps, partialRender, renderFastChangingData } from '../../lib';
import { page } from './page';
import { render } from './compiled-slowly/page.slowly-rendered.jay-html'
import { makeJayComponent } from 'jay-component';
import { prettify } from 'jay-compiler-shared';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
};
const PAGE_PARAMS = {};

describe('rendering a simple page', () => {
    it('should run the slowly changing phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    slowlyRendered: 'static text',
                },
                {
                    carryForwardSlowly: 'carry forward from slowly',
                },
            ),
        );
    });

    it('should run the fast changing phase, getting the carry forward from the slowly phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    fastDynamicRendered:
                        "dynamic text from fast render. Slowly Carry forward is 'carry forward from slowly'",
                },
                {
                    carryForwardFast: 'carry forward from fast render',
                    fastDynamicRendered:
                        "dynamic text from fast render. Slowly Carry forward is 'carry forward from slowly'",
                },
            ),
        );
    });

    it('should run the interactive phase, getting the carry forward from the fast phase', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeJayComponent(render, page.comp);
        const instance = comp({ ...PAGE_PROPS, ...fastRenderResult.carryForward } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text</div>
                <div>dynamic text from fast render. Slowly Carry forward is 'carry forward from slowly'</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });

    it('interactive phase should function and react to events', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            page,
            PAGE_PARAMS,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');
        const fastCarryForward = fastRenderResult.carryForward;

        const comp = makeJayComponent(render, page.comp);
        const instance = comp({ ...PAGE_PROPS, ...fastRenderResult.carryForward } as any);

        await instance.element.refs.button.exec$((_) => _.click());

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text</div>
                <div>dynamic value from client. Fast Carry forward is 'carry forward from fast render'</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });
});
