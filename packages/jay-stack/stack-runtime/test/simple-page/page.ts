import { makeJayStackComponent, PageProps, partialRender, Signals } from '../../lib';
import { render, PageElementRefs, PageViewState } from './compiled/page.jay-html';
import { Props } from 'jay-component';
import { PartialRender } from '../../lib';

type SlowlyViewState = Pick<PageViewState, 'slowlyRendered'>;
type FastViewState = Omit<PageViewState, keyof SlowlyViewState>;

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    fastDynamicRendered: string;
}

async function renderSlowlyChanging(
    props: PageProps,
): Promise<PartialRender<SlowlyViewState, SlowlyCarryForward>> {
    const slowlyRendered = 'SLOWLY RENDERED';
    const carryForwardSlowly = 'SLOWLY -> FAST CARRY FORWARD';
    return partialRender({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(
    props: PageProps,
    carryForward: SlowlyCarryForward,
): Promise<PartialRender<FastViewState, FastCarryForward>> {
    const fastDynamicRendered = `FAST RENDERED, using '${carryForward.carryForwardSlowly}'`;
    const fastRendered = 'FAST RENDERED';
    const carryForwardFast = 'FAST -> INTERACTIVE CARRY FORWARD';
    return partialRender(
        {
            fastDynamicRendered,
            fastRendered,
        },
        { carryForwardFast, fastDynamicRendered },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    carryForward: Signals<FastCarryForward>,
) {
    const [fastDynamicRendered, setFastDynamicRendered] = carryForward.fastDynamicRendered;
    const [carryForwardFast] = carryForward.carryForwardFast;

    refs.button.onclick(() => {
        setFastDynamicRendered(`INTERACTIVE RENDERED, using '${carryForwardFast()}'`);
    });

    return {
        render: () => ({
            fastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withSlowlyRender<SlowlyViewState, SlowlyCarryForward>(renderSlowlyChanging)
    .withFastRender<FastCarryForward>(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
