import { JayEventHandler, JayNativeFunction } from '@jay-framework/runtime';

export type FunctionsRepository = Record<
    string,
    JayEventHandler<Event, any, any> | JayNativeFunction<any, any, any>
>;

export type JayNativeFunction$<
    ElementType extends HTMLElement,
    ViewState,
    ResultType,
> = JayNativeFunction<ElementType, ViewState, ResultType> & {
    id: string;
};
export type JayGlobalNativeFunction<R> = () => Promise<R> | R;
export type JayGlobalNativeFunction$<R> = JayGlobalNativeFunction<R> & {
    id: string;
};
