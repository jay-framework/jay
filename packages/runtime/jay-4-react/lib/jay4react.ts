import {
    EventEmitter,
    JayComponent,
    JayElement,
    OnlyEventEmitters,
    PreRenderElement,
    RenderElementOptions,
} from 'jay-runtime';
import { Dispatch, SetStateAction, useRef, useState } from 'react';
import { EventsContext, refsRecorder } from './jay4react-events';
import * as React from 'react';
import { ComponentConstructor, JayComponentCore, makeJayComponent } from 'jay-component';

export interface Jay4ReactElementProps<ViewState> {
    vs: ViewState;
    context: EventsContext;
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

const _Element = Symbol();
const _comp = Symbol();

type EventEmittersToReactCallbacks<T> = {
    [Key in keyof T]: T[Key] extends EventEmitter<infer EventType, any>
        ? (event: EventType) => void
        : T[Key];
};

type Jay2React<Comp extends (...args: any) => any> = Parameters<Comp>[0] &
    EventEmittersToReactCallbacks<OnlyEventEmitters<ReturnType<Comp>>>;

export function jay2React<
    PropsT extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    CompConstructor extends (...args: any) => any,
>(comp: CompConstructor): React.FC<Jay2React<CompConstructor>> {
    const reactElement: React.FC<ViewState> = comp[_Element];
    const compConstructor: ComponentConstructor<PropsT, Refs, ViewState, any, any> = comp[_comp];

    return (reactProps: Jay2React<CompConstructor>) => {
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
            myInstanceRef.current = makeJayComponent(preRender, compConstructor)(props as PropsT);
            Object.keys(events).forEach((eventName) =>
                myInstanceRef.current.addEventListener(eventName.substring(2), ({ event }) =>
                    events[eventName](event),
                ),
            );
        } else {
            [viewState, setViewState] = useState<ViewState>(null);
            myInstanceRef.current.update(props as PropsT);
        }

        return reactElement({
            vs: viewState,
            context: _eventsContext.current,
        } as Jay2React<CompConstructor>);
    };
}

export function makeJay2ReactComponent<
    PropsT extends object,
    Refs extends object,
    ViewState extends object,
    ReactViewState extends Jay4ReactElementProps<ViewState>,
    Contexts extends Array<any>,
    CompCore extends JayComponentCore<PropsT, ViewState>,
>(
    reactElement: React.FC<ReactViewState>,
    compConstructor: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
): (
    props: PropsT,
) => ReturnType<ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>> {
    const comp = (props: PropsT) => {
        throw Error('See design log 33');
    };

    comp[_Element] = reactElement;
    comp[_comp] = compConstructor;

    return comp;
}
