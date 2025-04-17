import { makeJayStackComponent, PageProps, partialRender } from '../../lib/';
import { render, SimplePluginViewState, SimplePluginRefs } from './compiled/simple-plugin.jay-contract';
import { createSignal, Props } from 'jay-component';
import { PartialRender } from "../../lib";

// Define view states
type StaticViewState = Pick<SimplePluginViewState, "pluginSlowlyRendered">
type DynamicViewState = Omit<SimplePluginViewState, keyof StaticViewState>

// Define carry forward interfaces
interface StaticCarryForward {
    staticData: string;
}

interface DynamicCarryForward {
    dynamicData: string;
    pluginInteractiveRendered: string;
}

// Static rendering function
async function renderStaticContent(props: PageProps): Promise<PartialRender<StaticViewState, StaticCarryForward>> {
    const pluginSlowlyRendered = 'SLOWLY RENDERED';
    const staticData = 'SLOWLY -> FAST CARRY FORWARD';
    return partialRender({ pluginSlowlyRendered }, { staticData });
}

// Dynamic rendering function
async function renderDynamicContent(props: PageProps & StaticCarryForward): Promise<PartialRender<DynamicViewState, DynamicCarryForward>> {
    const pluginInteractiveRendered = `FAST RENDERED, using ${props.staticData}`;
    const dynamicData = 'FAST -> INTERACTIVE CARRY FORWARD';
    return partialRender(
        { pluginInteractiveRendered },
        { dynamicData, pluginInteractiveRendered }
    );
}

// Interactive component constructor
function SimplePluginConstructor(
    props: Props<PageProps & DynamicCarryForward>,
    refs: SimplePluginRefs,
) {
    const [dynamicContent, setDynamicContent] = createSignal(props.pluginInteractiveRendered);

    refs.pluginButton.onclick(() => {
        setDynamicContent(
            `INTERACTIVE RENDERED, using ${props.dynamicData()}`
        );
    });

    return {
        render: () => ({
            pluginInteractiveRendered: dynamicContent,
        }),
    };
}

export const plugin =
    makeJayStackComponent<typeof render>()
    .withProps<PageProps>()
    .withSlowlyRender<StaticViewState, StaticCarryForward>(renderStaticContent)
    .withFastRender<DynamicCarryForward>(renderDynamicContent)
    .withInteractive(SimplePluginConstructor); 