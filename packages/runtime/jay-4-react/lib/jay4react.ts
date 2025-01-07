import {
    EventEmitter,
    JayComponent,
    JayElement,
    OnlyEventEmitters,
    PreRenderElement,
    RenderElementOptions,
} from 'jay-runtime';
import {Dispatch, ReactElement, SetStateAction, useRef, useState} from 'react';
import { EventsContext, refsRecorder } from './jay4react-events';
import * as React from 'react';
import {Getter} from "jay-reactive";

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
    CompConstructor extends (...args: any) => any
>(comp: Getter<CompConstructor>): React.FC<Jay2React<CompConstructor>> {
    return (reactProps: Jay2React<CompConstructor>) => {
        const [props, events] = splitPropsEvents(reactProps);
        const myInstanceRef = useRef<JayComponent<PropsT, ViewState, JayElementT>>(null);
        if (!myInstanceRef.current) {
            myInstanceRef.current = comp()(props);
        }
        else {
            const reactViewStateState = useState<ViewState>(null);
            myInstanceRef.current.update({...props, reactViewStateState} as PropsT);
        }
        Object.keys(events).forEach((eventName) =>
            myInstanceRef.current.addEventListener(eventName.substring(2), ({ event }) =>
                events[eventName](event),
            ),
        );
        return myInstanceRef.current.element['react'] as ReactElement
    }
}

export function mimicJayElement<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ElementProps extends Jay4ReactElementProps<ViewState>>(reactElement: React.FC<ElementProps>): PreRenderElement<ViewState, Refs, JayElementT> {

    const preRender: PreRenderElement<ViewState, Refs, JayElementT> = (
        options?: RenderElementOptions,
    ) => {
        const [refs, eventsContext] = refsRecorder<Refs>(options.eventWrapper);
        // const _eventsContext = useRef<EventsContext>(null);
        let viewState: ViewState, setViewState: Dispatch<SetStateAction<ViewState>>;
        return [
            refs,
            (vs) => {
                const _eventsContext = eventsContext.withViewState(vs);
                [viewState, setViewState] = useState<ViewState>(vs);
                let react = reactElement({
                    vs: vs,
                    context: _eventsContext,
                } as ElementProps);
                const element = {
                    update: (newData) => {
                        element['react'] = reactElement({
                            vs: newData,
                            context: _eventsContext,
                        } as ElementProps)
                        if (newData['reactViewStateState'])
                            [viewState, setViewState] = newData['reactViewStateState'];
                        // newData['setViewState'](newData);
                        // useRef();
                        // useState<ViewState>(null); // to make react happy
                        // [viewState, setViewState] = useState<ViewState>(null);
                        setViewState(newData)
                    },
                    mount: () => {},
                    unmount: () => {},
                    refs,
                    react
                } as unknown as JayElementT;
                return element;
            },
        ];
    };
    return preRender;
}