import { render, PageElementRefs, PageViewState, PageContract } from './compiled/page.jay-html';
import { Props } from 'jay-component';
import {
    makeJayStackComponent,
    PageProps,
    partialRender,
    PartialRender,
    Signals,
} from 'jay-fullstack-component';

type SlowlyViewState = Pick<PageViewState, 'slowlyRendered'>;
type FastViewState = Omit<PageViewState, keyof SlowlyViewState>;

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}

interface FastCarryForward {
    carryForwardFast: string;
    fastDynamicRendered: string;
}

interface PageParams {
    variant: 'A' | 'B';
    [key: string]: string | undefined;
}

async function renderSlowlyChanging(
    props: PageProps & PageParams,
): Promise<PartialRender<SlowlyViewState, SlowlyCarryForward>> {
    const slowlyRendered = `SLOWLY RENDERED ${props.variant}`;
    const carryForwardSlowly = `SLOWLY -> FAST CARRY FORWARD ${props.variant}`;
    return partialRender({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(
    props: PageProps & PageParams,
    carryForward: SlowlyCarryForward,
): Promise<PartialRender<FastViewState, FastCarryForward>> {
    const fastDynamicRendered = `FAST RENDERED ${props.variant}, using ${carryForward.carryForwardSlowly}`;
    const carryForwardFast = `FAST -> INTERACTIVE CARRY FORWARD ${props.variant}`;
    return partialRender(
        {
            fastDynamicRendered,
        },
        { carryForwardFast, fastDynamicRendered },
    );
}

function ProductsPageConstructor(
    props: Props<PageProps & PageParams>,
    refs: PageElementRefs,
    carryForward: Signals<FastCarryForward>,
) {
    const [fastDynamicRendered, setFastDynamicRendered] = carryForward.fastDynamicRendered;

    refs.button.onclick(() => {
        setFastDynamicRendered(
            `INTERACTIVE RENDERED ${props.variant}, using ${carryForward.carryForwardFast[0]()}`,
        );
    });

    return {
        render: () => ({
            fastDynamicRendered,
        }),
    };
}

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withLoadParams<PageParams>(async function* () {
        yield [{ variant: 'A' }, { variant: 'B' }];
    })
    .withSlowlyRender<SlowlyViewState, SlowlyCarryForward>(renderSlowlyChanging)
    .withFastRender<FastCarryForward>(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
