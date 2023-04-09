import {JayEventHandler, JayNativeFunction} from "jay-runtime";

export function $handler<EventType, ViewState, Returns>(id): JayEventHandler<EventType, ViewState, Returns> {
    let fn = () => null;
    // @ts-ignore
    fn.id = id;
    return fn;
}

export function $func<ElementType extends HTMLElement, ViewState, ResultType>(id): JayNativeFunction<ElementType, ViewState, ResultType> {
    let fn = () => null;
    // @ts-ignore
    fn.id = id;
    return fn;
}