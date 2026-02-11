/**
 * Client-side context and helpers for headless component instances.
 *
 * Provides the mechanism to deliver server-produced fast ViewState and carryForward
 * to headless component instances on the client.
 *
 * Flow:
 * 1. makeCompositeJayComponent extracts __headlessInstances from ViewState/carryForward
 * 2. Registers HEADLESS_INSTANCES context during component construction
 * 3. makeHeadlessInstanceComponent creates instance components that resolve their data
 *    from this context by coordinate key
 */

import {
    createJayContext,
    useContext,
    ContextMarker,
    PreRenderElement,
    JayElement,
    currentConstructionContext,
} from '@jay-framework/runtime';
import {
    ComponentConstructor,
    JayComponentCore,
    makeJayComponent,
    createSignal,
    type ContextMarkers,
} from '@jay-framework/component';
import { Signals } from '@jay-framework/fullstack-component';

/**
 * Data structure for headless instance ViewStates and carryForwards.
 * Keyed by coordinate path (e.g., "product-card:0", "p1/product-card:0").
 */
export interface HeadlessInstancesData {
    viewStates: Record<string, object>;
    carryForwards: Record<string, object>;
}

/**
 * Context marker for headless instance data.
 * Provided by makeCompositeJayComponent, consumed by makeHeadlessInstanceComponent.
 */
export const HEADLESS_INSTANCES: ContextMarker<HeadlessInstancesData> =
    createJayContext<HeadlessInstancesData>();

function makeSignals<T extends object>(obj: T): Signals<T> {
    return Object.keys(obj).reduce((signals, key) => {
        signals[key] = createSignal(obj[key]);
        return signals;
    }, {}) as Signals<T>;
}

/**
 * Create a headless instance component that receives its fast ViewState from the
 * HEADLESS_INSTANCES context, matched by coordinate key.
 *
 * This replaces makeJayComponent for headless instances. It wraps the plugin's
 * interactive constructor to inject the instance's fast ViewState signals and
 * carryForward before any plugin-defined context markers.
 *
 * @param preRender - The inline template's render function
 * @param interactiveConstructor - The plugin's interactive constructor
 * @param coordinateKey - Static coordinate key (e.g., "product-card:0") or a
 *   factory function for forEach instances that receives the current dataIds
 *   (accumulated trackBy values from ancestor forEach loops) and returns the key.
 * @param pluginContexts - Additional context markers from the plugin (if any)
 */
export function makeHeadlessInstanceComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    interactiveConstructor: ComponentConstructor<PropsT, Refs, ViewState, any, CompCore>,
    coordinateKey: string | ((dataIds: string[]) => string),
    pluginContexts: ContextMarkers<any> = [] as any,
) {
    // Wrap the interactive constructor to read instance data from the provided context
    // HEADLESS_INSTANCES is provided by makeCompositeJayComponent via provideContexts,
    // so we access it directly with useContext rather than passing it as a contextMarker
    // (context markers require reactive pairing, which plain data doesn't support)
    const wrappedConstructor: ComponentConstructor<PropsT, Refs, ViewState, any, CompCore> = (
        props,
        refs,
        ...pluginResolvedContexts: any[]
    ) => {
        // Read instance data from the context stack (provided by composite component)
        const instanceData = useContext(HEADLESS_INSTANCES);

        // Resolve coordinate key: static string or dynamic factory (for forEach instances)
        const resolvedKey =
            typeof coordinateKey === 'function'
                ? coordinateKey(currentConstructionContext()?.dataIds ?? [])
                : coordinateKey;

        // Look up this instance's fast ViewState and carryForward by coordinate
        const fastVS = instanceData?.viewStates?.[resolvedKey];
        const cf = instanceData?.carryForwards?.[resolvedKey] || {};

        // Create signals from fast ViewState (like makeCompositeJayComponent does for key-based parts)
        const signalVS = fastVS ? makeSignals(fastVS) : undefined;

        // Call the original constructor with fast data injected before plugin contexts
        return interactiveConstructor(props, refs, signalVS, cf, ...pluginResolvedContexts);
    };

    // Only pass plugin context markers — HEADLESS_INSTANCES is accessed via useContext directly
    return (makeJayComponent as any)(preRender, wrappedConstructor, ...pluginContexts);
}
