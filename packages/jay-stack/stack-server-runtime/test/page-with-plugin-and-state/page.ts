import {
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
    partialRender,
    PartialRender,
    Signals,
} from '@jay-framework/fullstack-component';

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    pageFastDynamicRendered: string;
}

async function renderSlowlyChanging(
    props: PageProps,
): Promise<PartialRender<PageSlowViewState, SlowlyCarryForward>> {
    const pageSlowlyRendered = 'SLOWLY RENDERED';
    const carryForwardSlowly = 'SLOWLY -> FAST CARRY FORWARD';
    return partialRender({ pageSlowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(
    props: PageProps,
    carryForward: SlowlyCarryForward,
): Promise<PartialRender<PageFastViewState, FastCarryForward>> {
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
    fastViewState: Signals<PageFastViewState>,
    fastCarryForward: FastCarryForward,
) {
    const [getPageFastDynamicRendered, setPageFastDynamicRendered] =
        fastViewState.pageFastDynamicRendered;

    refs.button.onclick(() => {
        setPageFastDynamicRendered(`INTERACTIVE RENDERED, using '${fastCarryForward.carryForwardFast}'`);
    });

    return {
        render: () => ({
            pageFastDynamicRendered: getPageFastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(PageConstructor);
