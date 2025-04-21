import {
    createSignal,
    JayComponentCore,
    makeJayComponent,
    makePropsProxy,
    materializeViewState,
    Props,
    useReactive,
} from 'jay-component';
import { JayElement, PreRenderElement } from 'jay-runtime';
import { CompositePart } from './composite-part';
import { Signals } from './jay-stack-builder';

function makeSignals<T extends object>(carryForward: T): Signals<T> {
    return Object.keys(carryForward).reduce((signals, key) => {
        signals[key] = createSignal(carryForward[key]);
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
) {
    const comp = (props: Props<any>, refs, ...contexts): CompCore => {
        const instances: Array<[string, JayComponentCore<any, any>]> = parts.map((part) => {
            const partRefs = part.key ? refs[part.key] : refs;
            let partCarryForward: object;
            if (fastCarryForward) {
                if (part.key) partCarryForward = makeSignals(fastCarryForward[part.key]);
                else partCarryForward = makeSignals(fastCarryForward);
            }
            const partContexts = [
                partCarryForward,
                ...contexts.splice(0, part.compDefinition.clientContexts.length),
            ];
            return [part.key, part.compDefinition.comp(props, partRefs, ...partContexts)];
        });

        return {
            render: () => {
                let viewState = defaultViewState;
                instances.forEach(([key, instance]) => {
                    if (key)
                        viewState[key] = {
                            ...defaultViewState[key],
                            ...materializeViewState(instance.render()),
                        };
                    else viewState = { ...viewState, ...instance.render() };
                });
                return viewState;
            },
        } as unknown as CompCore;
    };

    const contextMarkers = parts.reduce((cm, part) => {
        return [...cm, ...part.compDefinition.clientContexts];
    }, []);

    return makeJayComponent<PropsT, ViewState, Refs, JayElementT, Array<any>, CompCore>(
        preRender,
        comp,
        ...contextMarkers,
    );
}
