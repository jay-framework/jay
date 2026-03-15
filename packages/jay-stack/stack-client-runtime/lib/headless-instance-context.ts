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
    ConcreteJayComponent,
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
/**
 * Component definition shape expected by makeHeadlessInstanceComponent.
 * Can be a full JayStackComponentDefinition or a minimal object with the required fields.
 */
/**
 * Component definition shape expected by makeHeadlessInstanceComponent.
 * `clientDefaults` receives raw props (not signal-wrapped) since it's called
 * before the component construction context is set up.
 */
interface HeadlessComponentDef {
    comp: ComponentConstructor<any, any, any, any, any>;
    contexts?: ContextMarkers<any>;
    clientDefaults?: (props: any) => { viewState: any; carryForward?: any };
}

export function makeHeadlessInstanceComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    componentOrConstructor:
        | HeadlessComponentDef
        | ComponentConstructor<PropsT, Refs, ViewState, any, CompCore>,
    coordinateKey: string | ((dataIds: string[]) => string),
    pluginContexts?: ContextMarkers<any>,
): (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT> {
    // Support both new (component object) and legacy (separate params) calling conventions
    const isComponentObject =
        typeof componentOrConstructor === 'object' &&
        componentOrConstructor !== null &&
        'comp' in componentOrConstructor;
    const interactiveConstructor: ComponentConstructor<PropsT, Refs, ViewState, any, CompCore> =
        isComponentObject
            ? (componentOrConstructor as HeadlessComponentDef).comp
            : (componentOrConstructor as ComponentConstructor<
                  PropsT,
                  Refs,
                  ViewState,
                  any,
                  CompCore
              >);
    const resolvedContexts: ContextMarkers<any> =
        pluginContexts ??
        (isComponentObject
            ? (componentOrConstructor as HeadlessComponentDef).contexts
            : undefined) ??
        ([] as any);
    const clientDefaults = isComponentObject
        ? (componentOrConstructor as HeadlessComponentDef).clientDefaults
        : undefined;

    // Wrap the interactive constructor to read instance data from the provided context
    const wrappedConstructor: ComponentConstructor<PropsT, Refs, ViewState, any, CompCore> = (
        signalProps,
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

        // Fallback: server keys by suffix (e.g. "product-widget:0") while hydrate uses full path
        // (e.g. "0/2/1/product-widget:0"); try suffix when full key not found
        const suffixKey =
            resolvedKey.includes('/') && resolvedKey.includes(':')
                ? resolvedKey.split('/').find((s) => s.includes(':')) ?? resolvedKey
                : resolvedKey;

        // Look up this instance's fast ViewState and carryForward by coordinate
        const fastVS =
            instanceData?.viewStates?.[resolvedKey] ?? instanceData?.viewStates?.[suffixKey];
        const cf =
            instanceData?.carryForwards?.[resolvedKey] ?? instanceData?.carryForwards?.[suffixKey];

        // Resolve ViewState and carryForward: server data > clientDefaults > empty
        let resolvedFastVS: object;
        let resolvedCf: object;

        if (fastVS) {
            resolvedFastVS = fastVS;
            resolvedCf = cf || {};
        } else if (clientDefaults) {
            // Access raw props via the proxy's .props getter (avoids signal unwrapping)
            const rawProps = signalProps.props();
            const defaults = clientDefaults(rawProps);
            resolvedFastVS = defaults.viewState;
            resolvedCf = defaults.carryForward ?? {};
        } else {
            console.warn(
                `[Jay] Headless instance "${resolvedKey}" has no server data and no clientDefaults. ` +
                    `Add .withClientDefaults() to the component definition to provide fallback values.`,
            );
            resolvedFastVS = {};
            resolvedCf = {};
        }

        const signalVS = makeSignals(resolvedFastVS);
        const compCore = interactiveConstructor(
            signalProps,
            refs,
            signalVS,
            resolvedCf,
            ...pluginResolvedContexts,
        );

        // Merge render() output with full fast ViewState signals.
        // The interactive render() only returns interactive-phase properties (e.g., { value }).
        // Slow/fast-only properties (e.g., label) must persist from the initial ViewState.
        const originalRender = compCore.render;
        compCore.render = () => {
            return { ...resolvedFastVS, ...originalRender() };
        };

        return compCore;
    };

    // Only pass plugin context markers — HEADLESS_INSTANCES is accessed via useContext directly
    return makeJayComponent(preRender, wrappedConstructor, ...resolvedContexts);
}
