import {
    createSignal,
    JayComponentCore,
    makeJayComponent,
    materializeViewState,
    Props,
    COMPONENT_CONTEXT,
} from '@jay-framework/component';
import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    useContext,
} from '@jay-framework/runtime';
import { CompositePart } from './composite-part';
import { Signals } from '@jay-framework/fullstack-component';
import { deepMergeViewStates, TrackByMap } from '@jay-framework/view-state-merge';
import { HEADLESS_INSTANCES, HeadlessInstancesData } from './headless-instance-context';

function makeSignals<T extends object>(obj: T): Signals<T> {
    return Object.keys(obj).reduce((signals, key) => {
        signals[key] = createSignal(obj[key]);
        return signals;
    }, {}) as Signals<T>;
}

/**
 * Hydrate variant of makeCompositeJayComponent.
 *
 * Instead of creating new DOM, this adopts the server-rendered DOM by using
 * the hydrate target's function signature: (rootElement, options?) => [Refs, RenderElement].
 * The rootElement is the SSR-rendered DOM already present in the page.
 */
export function hydrateCompositeJayComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    hydratePreRender: (
        rootElement: Element,
        options?: RenderElementOptions,
    ) => [Refs, RenderElement<ViewState, Refs, JayElementT>],
    defaultViewState: ViewState,
    fastCarryForward: object,
    parts: Array<CompositePart>,
    trackByMap: TrackByMap = {},
    rootElement: Element,
) {
    const interactiveParts = parts.filter((part) => part.comp !== undefined);

    const hasFastRendering = defaultViewState !== null && defaultViewState !== undefined;

    const headlessInstanceViewStates = (defaultViewState as any)?.__headlessInstances;
    const headlessInstanceCarryForwards = (fastCarryForward as any)?.__headlessInstances;
    if (headlessInstanceViewStates) delete (defaultViewState as any).__headlessInstances;
    if (headlessInstanceCarryForwards) delete (fastCarryForward as any).__headlessInstances;

    const comp = (props: Props<any>, refs, ...contexts): CompCore => {
        // Always provide HEADLESS_INSTANCES context — even if empty.
        // Headless instance constructors call useContext(HEADLESS_INSTANCES)
        // and would throw if the context is missing.
        const componentContext = useContext(COMPONENT_CONTEXT);
        const instancesData: HeadlessInstancesData = {
            viewStates: headlessInstanceViewStates || {},
            carryForwards: headlessInstanceCarryForwards || {},
        };
        componentContext.provideContexts.push([HEADLESS_INSTANCES, instancesData]);

        const instances: Array<[string, JayComponentCore<any, any>]> = interactiveParts.map(
            (part) => {
                const partRefs = part.key ? refs[part.key] : refs;

                let partContexts: any[];

                if (hasFastRendering) {
                    const partViewState = part.key
                        ? defaultViewState?.[part.key]
                        : defaultViewState;
                    const partFastViewState = partViewState
                        ? makeSignals(partViewState)
                        : makeSignals({} as any);

                    const partCarryForward = part.key
                        ? fastCarryForward?.[part.key]
                        : fastCarryForward;

                    partContexts = [
                        partFastViewState,
                        partCarryForward,
                        ...contexts.splice(0, part.contextMarkers.length),
                    ];
                } else {
                    partContexts = [...contexts.splice(0, part.contextMarkers.length)];
                }

                return [part.key, part.comp(props, partRefs, ...partContexts)];
            },
        );

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(([key, instance]) => {
                    const rendered = materializeViewState(instance.render());
                    if (key) {
                        viewState[key] = deepMergeViewStates(
                            defaultViewState[key],
                            rendered,
                            trackByMap,
                            key,
                        );
                    } else {
                        viewState = deepMergeViewStates(
                            viewState,
                            rendered,
                            trackByMap,
                        ) as ViewState;
                    }
                });
                return viewState;
            },
        } as unknown as CompCore;
    };

    const contextMarkers = interactiveParts.reduce((cm, part) => {
        return [...cm, ...part.contextMarkers];
    }, []);

    // Adapt hydrate function to PreRenderElement signature by binding rootElement
    const preRender = (options?: RenderElementOptions) => hydratePreRender(rootElement, options);

    return makeJayComponent<PropsT, ViewState, Refs, JayElementT, Array<any>, CompCore>(
        preRender,
        comp,
        ...contextMarkers,
    );
}
