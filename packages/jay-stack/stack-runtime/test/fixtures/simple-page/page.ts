import { makeJayStackComponent, PageProps, partialRender } from 'jay-stack-runtime';
// @ts-ignore
import { render, PageElementRefs } from './page.jay-html';
import { createSignal, Props } from 'jay-component';

interface SlowlyCarryForward {
    carryForwardSlowly: string;
}
interface FastCarryForward {
    carryForwardFast: string;
    fastDynamicRendered: string;
    carryForwardSlowly: string;
}

async function renderSlowlyChanging(props: PageProps) {
    const slowlyRendered = 'static text';
    const carryForwardSlowly = 'carry forward from slowly';
    return partialRender({ slowlyRendered }, { carryForwardSlowly });
}

async function renderFastChanging(props: PageProps & SlowlyCarryForward) {
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
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductsPageConstructor);
