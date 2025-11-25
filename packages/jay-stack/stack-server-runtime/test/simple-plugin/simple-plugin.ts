import {
    SimplePluginRefs,
    SimplePluginContract, SimplePluginSlowViewState, SimplePluginFastViewState,
} from './compiled/simple-plugin.jay-contract';
import { Props } from '@jay-framework/component';
import {
    FastRenderResult,
    makeJayStackComponent,
    PageProps,
    PartialRender,
    partialRender,
    Signals, SlowlyRenderResult,
} from '@jay-framework/fullstack-component';

// Define carry forward interfaces
interface StaticCarryForward {
    staticData: string;
}

interface DynamicCarryForward {
    dynamicData: string;
    pluginInteractiveRendered: string;
}

// Static rendering function
async function slowRender(
    props: PageProps,
): Promise<SlowlyRenderResult<SimplePluginSlowViewState, StaticCarryForward>> {
    const pluginSlowlyRendered = 'SLOWLY RENDERED';
    const staticData = 'SLOWLY -> FAST CARRY FORWARD';
    return partialRender({
        pluginSlowlyRendered
    }, { staticData });
}

// Dynamic rendering function
async function fastRender(
    props: PageProps,
    carryForward: StaticCarryForward,
): Promise<FastRenderResult<SimplePluginFastViewState, DynamicCarryForward>> {
    const pluginInteractiveRendered = `FAST RENDERED, using ${carryForward.staticData}`;
    const dynamicData = 'FAST -> INTERACTIVE CARRY FORWARD';
    return partialRender({
        pluginInteractiveRendered
    }, { dynamicData, pluginInteractiveRendered });
}

// Interactive component constructor
function SimplePluginConstructor(
    props: Props<PageProps>,
    refs: SimplePluginRefs,
    carryForward: Signals<DynamicCarryForward>,
) {
    const [dynamicContent, setDynamicContent] = carryForward.pluginInteractiveRendered;
    const [dynamicData] = carryForward.dynamicData;

    refs.pluginButton.onclick(() => {
        setDynamicContent(`INTERACTIVE RENDERED, using ${dynamicData()}`);
    });

    return {
        render: () => ({
            pluginInteractiveRendered: dynamicContent,
        }),
    };
}

export const plugin = makeJayStackComponent<SimplePluginContract>()
    .withProps<PageProps>()
    .withSlowlyRender(slowRender)
    .withFastRender(fastRender)
    .withInteractive(SimplePluginConstructor);
