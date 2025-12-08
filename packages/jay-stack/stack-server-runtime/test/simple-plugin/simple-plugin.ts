import {
    SimplePluginRefs,
    SimplePluginContract,
    SimplePluginSlowViewState,
    SimplePluginFastViewState,
} from './compiled/simple-plugin.jay-contract';
import { Props } from '@jay-framework/component';
import {
    FastRenderResult,
    makeJayStackComponent,
    PageProps,
    PhaseOutput,
    phaseOutput,
    Signals,
    SlowlyRenderResult,
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
    return phaseOutput(
        {
            pluginSlowlyRendered,
        },
        { staticData },
    );
}

// Dynamic rendering function
async function fastRender(
    props: PageProps,
    carryForward: StaticCarryForward,
): Promise<FastRenderResult<SimplePluginFastViewState, DynamicCarryForward>> {
    const pluginInteractiveRendered = `FAST RENDERED, using ${carryForward.staticData}`;
    const dynamicData = 'FAST -> INTERACTIVE CARRY FORWARD';
    return phaseOutput(
        {
            pluginInteractiveRendered,
        },
        { dynamicData, pluginInteractiveRendered },
    );
}

// Interactive component constructor
function SimplePluginConstructor(
    props: Props<PageProps>,
    refs: SimplePluginRefs,
    fastViewState: Signals<SimplePluginFastViewState>,
    fastCarryForward: DynamicCarryForward,
) {
    const [getDynamicContent, setDynamicContent] = fastViewState.pluginInteractiveRendered;

    refs.pluginButton.onclick(() => {
        setDynamicContent(`INTERACTIVE RENDERED, using ${fastCarryForward.dynamicData}`);
    });

    return {
        render: () => ({
            pluginInteractiveRendered: getDynamicContent,
        }),
    };
}

export const plugin = makeJayStackComponent<SimplePluginContract>()
    .withProps<PageProps>()
    .withSlowlyRender(slowRender)
    .withFastRender(fastRender)
    .withInteractive(SimplePluginConstructor);
