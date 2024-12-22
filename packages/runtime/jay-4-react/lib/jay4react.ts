import { JayComponent, JayElement, PreRenderElement, RenderElementOptions } from 'jay-runtime';
import { Dispatch, FC, SetStateAction, useRef, useState } from 'react';
import { EventsContext, refsRecorder } from './jay4react-events';

export interface Jay4ReactElementProps<ViewState> {
    vs: ViewState;
    eventsContext: EventsContext;
}

function splitPropsEvents(reactProps: object): [object, object] {
    const props = {},
        events = {};
    Object.keys(reactProps).forEach((key) => {
        if (reactProps[key] instanceof Function) events[key] = reactProps[key];
        else props[key] = reactProps[key];
    });
    return [props, events];
}

export function jay4react<
    ViewState extends object,
    ReactElementProps extends Jay4ReactElementProps<ViewState>,
    ReactComponentProps extends object,
    PropsT extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
>(
    reactElement: FC<ReactElementProps>,
    mkJayComponent: (
        preRender: PreRenderElement<ViewState, Refs, JayElementT>,
    ) => (props: PropsT) => JayComponent<PropsT, ViewState, JayElementT>,
): FC<ReactComponentProps> {
    return (reactProps: ReactComponentProps) => {
        const [props, events] = splitPropsEvents(reactProps);
        const myInstanceRef = useRef<JayComponent<PropsT, ViewState, JayElementT>>(null);
        const _eventsContext = useRef<EventsContext>(null);
        let viewState: ViewState, setViewState: Dispatch<SetStateAction<ViewState>>;
        if (!myInstanceRef.current) {
            const preRender: PreRenderElement<ViewState, Refs, JayElementT> = (
                options?: RenderElementOptions,
            ) => {
                const [refs, eventsContext] = refsRecorder<Refs>(options.eventWrapper);
                return [
                    refs,
                    (vs) => {
                        _eventsContext.current = eventsContext.withViewState(vs);
                        [viewState, setViewState] = useState<ViewState>(vs);
                        return {
                            update: (newData) => setViewState(newData),
                            mount: () => {},
                            unmount: () => {},
                            refs,
                        } as JayElementT;
                    },
                ];
            };
            myInstanceRef.current = mkJayComponent(preRender)(props as PropsT);
            Object.keys(events).forEach((event) =>
                myInstanceRef.current.addEventListener(event.substring(2), events[event]),
            );
        } else {
            [viewState, setViewState] = useState<ViewState>(null);
            myInstanceRef.current.update(props as PropsT);
        }

        return reactElement({
            vs:viewState,
            eventsContext: _eventsContext.current,
        } as ReactElementProps);
    };
}
