import { DevSlowlyChangingPhase, PageProps, partialRender, renderFastChangingData } from '../../lib';
import { page } from './page';
import { render as renderVariantA } from './compiled-slowly/page.slowly-rendered.variant-a.jay-html';
import { render as renderVariantB } from './compiled-slowly/page.slowly-rendered.variant-b.jay-html';

import { makeJayComponent } from 'jay-component';
import { prettify } from 'jay-compiler-shared';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
};

describe('rendering a parameterized page', () => {
    it('should run the slowly changing phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'a' },
            PAGE_PROPS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    slowlyRendered: 'static text A',
                },
                {
                    carryForwardSlowly: 'carry forward A from slowly',
                },
            ),
        );
    });

    it('should run the slowly changing phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'b' },
            PAGE_PROPS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    slowlyRendered: 'static text B',
                },
                {
                    carryForwardSlowly: 'carry forward B from slowly',
                },
            ),
        );
    });

    it('should run the fast changing phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'a' },
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            page,
            { variant: 'a' },
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    fastDynamicRendered:
                        "dynamic text A from fast render. Slowly Carry forward is 'carry forward A from slowly'",
                },
                {
                    carryForwardFast: 'carry forward A from fast render',
                    fastDynamicRendered:
                        "dynamic text A from fast render. Slowly Carry forward is 'carry forward A from slowly'",
                },
            ),
        );
    });

    it('should run the fast changing phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'b' },
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            page,
            { variant: 'b' },
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    fastDynamicRendered:
                        "dynamic text B from fast render. Slowly Carry forward is 'carry forward B from slowly'",
                },
                {
                    carryForwardFast: 'carry forward B from fast render',
                    fastDynamicRendered:
                        "dynamic text B from fast render. Slowly Carry forward is 'carry forward B from slowly'",
                },
            ),
        );
    });

    it('should run the interactive phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'a' },
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            page,
            { variant: 'a' },
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');

        const comp = makeJayComponent(renderVariantA, page.comp);
        const instance = comp({ ...PAGE_PROPS, ...fastRenderResult.carryForward } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text A</div>
                <div>dynamic text A from fast render. Slowly Carry forward is 'carry forward A from slowly'</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });

    it('should run the interactive phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase();
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            page,
            { variant: 'b' },
            PAGE_PROPS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            page,
            { variant: 'b' },
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');

        const comp = makeJayComponent(renderVariantB, page.comp);
        const instance = comp({ ...PAGE_PROPS, ...fastRenderResult.carryForward } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>static text B</div>
                <div>dynamic text B from fast render. Slowly Carry forward is 'carry forward B from slowly'</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });
}); 