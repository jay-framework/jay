import { makeJayStackComponent, PageProps, partialRender } from 'jay-stack-runtime';
// @ts-ignore
import {render, PageElementRefs, PageViewState} from './source/page.jay-html';
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

interface PageParams {
    variant: 'a' | 'b';
    [key: string]: string | undefined;
}

async function renderSlowlyChanging(props: PageProps & PageParams): Promise<PartialRender<SlowlyViewState, SlowlyCarryForward>> {
    const slowlyRendered = props.variant === 'a' ? 'static text A' : 'static text B';
    const carryForwardSlowly = props.variant === 'a' ? 'carry forward A from slowly' : 'carry forward B from slowly';
    return partialRender({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(props: PageProps & PageParams & SlowlyCarryForward): Promise<PartialRender<FastViewState, FastCarryForward>> {
    const fastDynamicRendered = `dynamic text ${props.variant.toUpperCase()} from fast render. Slowly Carry forward is '${props.carryForwardSlowly}'`;
    const carryForwardFast = `carry forward ${props.variant.toUpperCase()} from fast render`;
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
    .withLoadParams<PageParams>(async () => {
        const params: PageParams[] = [
            { variant: 'a' },
            { variant: 'b' }
        ];
        return params[Symbol.iterator]();
    })
    .withSlowlyRender<SlowlyViewState, SlowlyCarryForward>(renderSlowlyChanging)
    .withFastRender<FastCarryForward>(renderFastChanging)
    .withInteractive(ProductsPageConstructor); 