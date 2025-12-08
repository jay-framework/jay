import {
    render,
    PageElementRefs,
    PageViewState,
    PageContract,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState,
} from './compiled/page.jay-html';
import { Props } from '@jay-framework/component';
import {
    makeJayStackComponent,
    PageProps,
    phaseOutput,
    PhaseOutput,
    Signals,
} from '@jay-framework/fullstack-component';

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    fastDynamicRendered: string;
}

async function renderSlowlyChanging(
    props: PageProps,
): Promise<PhaseOutput<PageSlowViewState, SlowlyCarryForward>> {
    const slowlyRendered = 'SLOWLY RENDERED';
    const carryForwardSlowly = 'SLOWLY -> FAST CARRY FORWARD';
    return phaseOutput({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(
    props: PageProps,
    carryForward: SlowlyCarryForward,
): Promise<PhaseOutput<PageFastViewState, FastCarryForward>> {
    const fastRendered = 'FAST RENDERED';
    const fastDynamicRendered = `FAST RENDERED, using '${carryForward.carryForwardSlowly}'`;
    const carryForwardFast = 'FAST -> INTERACTIVE CARRY FORWARD';
    return phaseOutput(
        {
            fastRendered,
            fastDynamicRendered,
        },
        { carryForwardFast, fastDynamicRendered },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps>,
    refs: PageElementRefs,
    fastViewState: Signals<PageFastViewState>,
    fastCarryForward: FastCarryForward,
) {
    const [getFastDynamicRendered, setFastDynamicRendered] = fastViewState.fastDynamicRendered;

    refs.button.onclick(() => {
        setFastDynamicRendered(`INTERACTIVE RENDERED, using '${fastCarryForward.carryForwardFast}'`);
    });

    return {
        render: () => ({
            fastDynamicRendered: getFastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
