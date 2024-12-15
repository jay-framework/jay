import {JayComponent, JayElement, JayEventHandlerWrapper, PreRenderElement, RenderElementOptions} from "jay-runtime";
import React, {Dispatch, FC, SetStateAction, useEffect, useRef, useState} from "react";
import {getReactEvents, JayReactEvents, refsRecorder} from "./jay4react-events";

export interface Jay4ReactElementProps<ViewState, ReactEvents extends JayReactEvents> {
    viewState: ViewState;
    events: ReactEvents;
    eventsWrapper?: JayEventHandlerWrapper<any, any, any>
}

function splitPropsEvents(reactProps: object): [object, object] {
    const props = {}, events = {};
    Object.keys(reactProps).forEach(key => {
        if (reactProps[key] instanceof Function)
            events[key] = reactProps[key];
        else
            props[key] = reactProps[key];
        })
    return [props, events];
}

function jay4ReactPreRender<ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>>
(setViewState: Dispatch<SetStateAction<ViewState>>): PreRenderElement<ViewState, Refs, JayElementT> {
    return (options?: RenderElementOptions) => {
        const refs = refsRecorder<Refs>();
        return [refs, vs => {
            setViewState(vs)
            return {
                update: newData => setViewState(newData),
                mount: () => {},
                unmount: () => {},
                refs
            } as JayElementT
        }]
    }

}

export function jay4react<
    ViewState extends object,
    ReactEvents extends JayReactEvents,
    ReactElementProps extends Jay4ReactElementProps<ViewState, ReactEvents>,
    ReactComponentProps extends object,
    PropsT extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>
>(
    reactElement: FC<ReactElementProps>,
    mkJayComponent: (preRender: PreRenderElement<ViewState, Refs, JayElementT>) =>
        (props: PropsT) =>
            JayComponent<PropsT, ViewState, JayElementT>): FC<ReactComponentProps> {



    return (reactProps: ReactComponentProps) => {
        const [props, events] = splitPropsEvents(reactProps);
        const myInstanceRef = useRef<JayComponent<PropsT, ViewState, JayElementT>>(null);
        const _refs = useRef<Refs>(null);
        const _eventsWrapper = useRef<JayEventHandlerWrapper<any, any, any>>(null);
        let [viewState, setViewState] = useState<ViewState>(null);
        useEffect(() => {
            const preRender: PreRenderElement<ViewState, Refs, JayElementT> =
                (options?: RenderElementOptions) => {
                    _eventsWrapper.current = options?.eventWrapper;
                    const refs = refsRecorder<Refs>();
                    _refs.current = refs;
                    return [refs, vs => {
                        setViewState(vs)
                        viewState = vs;
                        return {
                            update: newData => setViewState(newData),
                            mount: () => {},
                            unmount: () => {},
                            refs
                        } as JayElementT
                    }]
                }
            myInstanceRef.current = mkJayComponent(preRender)(props as PropsT);
        }, []);

        if (myInstanceRef.current)
            myInstanceRef.current.update(props as PropsT);
        // todo set the jay component events

        if (!viewState)
            return React.createElement('div')
        else
            return reactElement({
                viewState,
                events: getReactEvents(_refs.current),
                eventsWrapper: _eventsWrapper.current
            } as ReactElementProps)
    }
}