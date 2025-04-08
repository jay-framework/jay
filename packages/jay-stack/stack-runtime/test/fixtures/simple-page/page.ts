import { makeJayStackComponent, PageProps, partialRender } from 'jay-stack-runtime';
// @ts-ignore
import {render, PageElementRefs, PageViewState} from './page.slowly-rendered.jay-html';
import { createSignal, Props } from 'jay-component';
import {PartialRender} from "../../../lib";

type SlowlyViewState = Pick<PageViewState, "slowlyRendered">
type FastViewState = Omit<PageViewState, keyof SlowlyViewState>

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    fastDynamicRendered: string;
}

async function renderSlowlyChanging(props: PageProps): Promise<PartialRender<SlowlyViewState, SlowlyCarryForward>> {
    const slowlyRendered = 'static text';
    const carryForwardSlowly = 'carry forward from slowly';
    return partialRender({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(props: PageProps & SlowlyCarryForward): Promise<PartialRender<FastViewState, FastCarryForward>> {
    const fastDynamicRendered = `dynamic text from fast render. Slowly Carry forward is '${props.carryForwardSlowly}'`;
    const carryForwardFast = 'carry forward from fast render';
    return partialRender(
        {
            fastDynamicRendered,
        },
        { carryForwardFast, fastDynamicRendered },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps & FastCarryForward>,
    refs: PageElementRefs,
) {
    const [fastDynamicRendered, setFastDynamicRendered] = createSignal(props.fastDynamicRendered);

    refs.button.onclick(() => {
        setFastDynamicRendered(
            `dynamic value from client. Fast Carry forward is '${props.carryForwardFast()}'`,
        );
    });

    return {
        render: () => ({
            fastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent(render)
    .withProps<PageProps>()
    .withSlowlyRender<SlowlyViewState, SlowlyCarryForward>(renderSlowlyChanging)
    .withFastRender<FastCarryForward>(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
