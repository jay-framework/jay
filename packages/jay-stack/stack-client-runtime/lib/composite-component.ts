import {
    createSignal,
    JayComponentCore,
    makeJayComponent,
    materializeViewState,
    Props,
} from '@jay-framework/component';
import { JayElement, PreRenderElement } from '@jay-framework/runtime';
import { CompositePart } from './composite-part';
import { Signals } from '@jay-framework/fullstack-component';
import { deepMergeViewStates, TrackByMap } from '@jay-framework/view-state-merge';

function makeSignals<T extends object>(obj: T): Signals<T> {
    return Object.keys(obj).reduce((signals, key) => {
        signals[key] = createSignal(obj[key]);
        return signals;
    }, {}) as Signals<T>;
}

export function makeCompositeJayComponent<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    defaultViewState: ViewState,
    fastCarryForward: object,
    parts: Array<CompositePart>,
    trackByMap: TrackByMap = {},
) {
    // Determine if we have fast rendering
    // Both params are always provided when fast rendering exists (even if empty objects)
    const hasFastRendering = defaultViewState !== null && defaultViewState !== undefined;

    const comp = (props: Props<any>, refs, ...contexts): CompCore => {
        const instances: Array<[string, JayComponentCore<any, any>]> = parts.map((part) => {
            const partRefs = part.key ? refs[part.key] : refs;

            let partContexts: any[];

            if (hasFastRendering) {
                // Create signals for fast view state
                const partViewState = part.key ? defaultViewState?.[part.key] : defaultViewState;
                const partFastViewState = partViewState ? makeSignals(partViewState) : undefined;

                // Carry forward as plain object (no signals)
                const partCarryForward = part.key ? fastCarryForward?.[part.key] : fastCarryForward;

                // Always pass both parameters when fast rendering exists
                partContexts = [
                    partFastViewState,
                    partCarryForward,
                    ...contexts.splice(0, part.contextMarkers.length),
                ];
            } else {
                // No fast rendering - just pass regular contexts
                partContexts = [...contexts.splice(0, part.contextMarkers.length)];
            }

            return [part.key, part.comp(props, partRefs, ...partContexts)];
        });

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(([key, instance]) => {
                    const rendered = materializeViewState(instance.render());
                    if (key) {
                        // Deep merge using trackBy for arrays (handles empty trackByMap gracefully)
                        viewState[key] = deepMergeViewStates(
                            defaultViewState[key],
                            rendered,
                            trackByMap,
                            key,
                        );
                    } else {
                        // Deep merge using trackBy for arrays
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

    const contextMarkers = parts.reduce((cm, part) => {
        return [...cm, ...part.contextMarkers];
    }, []);

    return makeJayComponent<PropsT, ViewState, Refs, JayElementT, Array<any>, CompCore>(
        preRender,
        comp,
        ...contextMarkers,
    );
}
