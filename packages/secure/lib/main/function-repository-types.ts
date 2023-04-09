import {JayEventHandler, JayNativeFunction} from "jay-runtime";

export type FunctionsRepository = Record<string, JayEventHandler<Event, any, any>>
export type $JayEventHandler<EventType, ViewState, Returns> = JayEventHandler<EventType, ViewState, Returns> & {
    id: string
}
export type $JayNativeFunction<ElementType extends HTMLElement, ViewState, ResultType> =
    JayNativeFunction<ElementType, ViewState, ResultType> & {
    id: string
}
