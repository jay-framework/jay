import {
    DevSlowlyChangingPhase,
    makeCompositeJayComponent,
    PageProps,
    partialRender,
    renderFastChangingData,
} from '../../lib';
import { page } from './page';
import { render as renderVariantA } from './compiled-slowly/page.slowly-rendered.variant-a.jay-html';
import { render as renderVariantB } from './compiled-slowly/page.slowly-rendered.variant-b.jay-html';

import { makeJayComponent } from 'jay-component';
import { prettify } from 'jay-compiler-shared';

const PAGE_PROPS: PageProps = {
    language: 'en-us',
    url: '/'
};
const PAGE_PARAMS_A = { variant: 'A' };
const PAGE_PARAMS_B = { variant: 'B' };
const PAGE_PARTS = [{ compDefinition: page }];

describe('rendering a parameterized page', () => {
    it('should run the slowly changing phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_A,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    slowlyRendered: 'SLOWLY RENDERED A',
                },
                {
                    carryForwardSlowly: 'SLOWLY -> FAST CARRY FORWARD A',
                },
            ),
        );
    });

    it('should run the slowly changing phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);

        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_B,
            PAGE_PROPS,
            PAGE_PARTS,
        );

        expect(slowlyRenderResult).toEqual(
            partialRender(
                {
                    slowlyRendered: 'SLOWLY RENDERED B',
                },
                {
                    carryForwardSlowly: 'SLOWLY -> FAST CARRY FORWARD B',
                },
            ),
        );
    });

    it('should run the fast changing phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_A,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_A,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    fastDynamicRendered: 'FAST RENDERED A, using SLOWLY -> FAST CARRY FORWARD A',
                },
                {
                    carryForwardFast: 'FAST -> INTERACTIVE CARRY FORWARD A',
                    fastDynamicRendered: 'FAST RENDERED A, using SLOWLY -> FAST CARRY FORWARD A',
                },
            ),
        );
    });

    it('should run the fast changing phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_B,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');

        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_B,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );

        expect(fastRenderResult).toEqual(
            partialRender(
                {
                    fastDynamicRendered: 'FAST RENDERED B, using SLOWLY -> FAST CARRY FORWARD B',
                },
                {
                    carryForwardFast: 'FAST -> INTERACTIVE CARRY FORWARD B',
                    fastDynamicRendered: 'FAST RENDERED B, using SLOWLY -> FAST CARRY FORWARD B',
                },
            ),
        );
    });

    it('should run the interactive phase with variant A', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_A,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_A,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');

        const comp = makeCompositeJayComponent(
            renderVariantA,
            fastRenderResult.rendered,
            fastRenderResult.carryForward,
            PAGE_PARTS,
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>SLOWLY RENDERED A</div>
                <div>FAST RENDERED A, using SLOWLY -&gt; FAST CARRY FORWARD A</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });

    it('should run the interactive phase with variant B', async () => {
        const slowlyPhase = new DevSlowlyChangingPhase(false);
        const slowlyRenderResult = await slowlyPhase.runSlowlyForPage(
            PAGE_PARAMS_B,
            PAGE_PROPS,
            PAGE_PARTS,
        );
        if (slowlyRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from slowly phase');
        const fastRenderResult = await renderFastChangingData(
            PAGE_PARAMS_B,
            PAGE_PROPS,
            slowlyRenderResult.carryForward,
            PAGE_PARTS,
        );
        if (fastRenderResult.kind !== 'PartialRender')
            throw new Error('expecting partial render from fast phase');

        const comp = makeCompositeJayComponent(
            renderVariantB,
            fastRenderResult.rendered,
            fastRenderResult.carryForward,
            PAGE_PARTS,
        );
        const instance = comp({ ...PAGE_PROPS } as any);

        expect(await prettify(instance.element.dom.outerHTML)).toEqual(
            await prettify(`
            <div>
                <div>SLOWLY RENDERED B</div>
                <div>FAST RENDERED B, using SLOWLY -&gt; FAST CARRY FORWARD B</div>
                <button data-id="button">click</button>
            </div>;`),
        );
    });
});
