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
    const pluginSlowlyRendered = 'This is static content from a plugin';
    const staticData = 'Static plugin data to carry forward';
    return partialRender({ pluginSlowlyRendered }, { staticData });
}

// Dynamic rendering function
async function renderDynamicContent(props: PageProps & StaticCarryForward): Promise<PartialRender<DynamicViewState, DynamicCarryForward>> {
    const pluginInteractiveRendered = `Dynamic content from plugin using carry forward: ${props.staticData}`;
    const dynamicData = 'Dynamic data to carry forward';
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
            `Updated dynamic content using dynamic data: ${props.dynamicData()}`
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