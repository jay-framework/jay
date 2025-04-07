import { makeJayStackComponent, PageProps, partialRender } from 'jay-stack-runtime';
// @ts-ignore
import { render, PageElementRefs} from './page.jay-html.ts';
import {createSignal, Props} from 'jay-component';

interface SlowlyCarryForward {
    carryForwardSlowly: string
}
async function renderSlowlyChanging(props: PageProps) {
    const slowlyRender = "static text"
    const carryForwardSlowly = "carry forward from slowly"
    return partialRender({ slowlyRender }, {carryForwardSlowly});
}

interface FastCarryForward {
    carryForwardFast: string
    fastDynamicRender: string
    carryForwardSlowly: string
}

async function renderFastChanging(props: PageProps & SlowlyCarryForward) {
    const fastDynamicRender = `dynamic text from fast render. Slowly Carry forward is '${props.carryForwardSlowly}'`;
    const carryForwardFast = "carry forward from fast render";
    return partialRender({
        fastDynamicRender,
    }, {carryForwardFast, fastDynamicRender});
}

function ProductsPageConstructor(
    props: Props<PageProps & FastCarryForward>,
    refs: PageElementRefs,
) {

    const [fastDynamicRender, setFastDynamicRender] = createSignal(props.fastDynamicRender)

    refs.button.onclick(() => {
        setFastDynamicRender(`dynamic value from client. Fast Carry forward is '${props.carryForwardFast()}'`)
    })

    return {
        render: () => ({
            fastDynamicRender,
        }),
    };
}

export const page = makeJayStackComponent(render)
    .withProps<PageProps>()
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
