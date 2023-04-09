import {JayEventHandler} from "jay-runtime";

export function $func<EventType, ViewState, Returns>(id): JayEventHandler<EventType, ViewState, Returns> {
    let fn = () => null;
    // @ts-ignore
    fn.id = id;
    return fn;
}