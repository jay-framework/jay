import { makeJayStackComponent, PageProps, partialRender, Signals } from '../../lib';
import { render, PageElementRefs, PageViewState } from './compiled/page.jay-html';
import { Props } from 'jay-component';
import { PartialRender } from '../../lib';

type SlowlyViewState = Pick<PageViewState, 'pageSlowlyRendered'>;
type FastViewState = Omit<PageViewState, keyof SlowlyViewState>;

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    pageFastDynamicRendered: string;
}

async function renderSlowlyChanging(
    props: PageProps,
): Promise<PartialRender<SlowlyViewState, SlowlyCarryForward>> {
    const pageSlowlyRendered = 'SLOWLY RENDERED';
    const carryForwardSlowly = 'SLOWLY -> FAST CARRY FORWARD';
    return partialRender({ pageSlowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(
    props: PageProps,
    carryForward: SlowlyCarryForward,
): Promise<PartialRender<FastViewState, FastCarryForward>> {
    const pageFastDynamicRendered = `FAST RENDERED, using '${carryForward.carryForwardSlowly}'`;
    const carryForwardFast = 'FAST -> INTERACTIVE CARRY FORWARD';
    return partialRender(
        { pageFastDynamicRendered },
        { carryForwardFast, pageFastDynamicRendered },
    );
}

function PageConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    carryForward: Signals<FastCarryForward>,
) {
    const [pageFastDynamicRendered, setPageFastDynamicRendered] =
        carryForward.pageFastDynamicRendered;
    const [carryForwardFast] = carryForward.carryForwardFast;

    refs.button.onclick(() => {
        setPageFastDynamicRendered(`INTERACTIVE RENDERED, using '${carryForwardFast()}'`);
    });

    return {
        render: () => ({
            pageFastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withSlowlyRender<SlowlyViewState, SlowlyCarryForward>(renderSlowlyChanging)
    .withFastRender<FastCarryForward>(renderFastChanging)
    .withInteractive(PageConstructor);
