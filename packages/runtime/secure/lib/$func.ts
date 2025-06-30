import { JayEventHandler, JayNativeFunction } from '@jay-framework/runtime';
import { JayGlobalNativeFunction } from './main/function-repository-types';
import { JPMNativeExecResult } from './comm-channel/messages';

export type NativeIdMarker = {
    (): void;
    id: number;
};
function nativeExecId(id: string): NativeIdMarker {
    let fn = () => null;
    // @ts-ignore
    fn.id = id;
    return fn as NativeIdMarker;
}

export function handler$<EventType, ViewState, Returns>(
    id: string,
): JayEventHandler<EventType, ViewState, Returns> {
    return nativeExecId(id) as any as JayEventHandler<EventType, ViewState, Returns>;
}

export function func$<ElementType extends HTMLElement, ViewState, ResultType>(
    id: string,
): JayNativeFunction<ElementType, ViewState, ResultType> {
    return nativeExecId(id) as any as JayNativeFunction<ElementType, ViewState, ResultType>;
}

export function funcGlobal$<R>(id: string): JayGlobalNativeFunction<R> {
    return nativeExecId(id) as any as JayGlobalNativeFunction<R>;
}

interface CorrelatedPromise<T> {
    correlationId: number;
    execPromise$: Promise<T>;
    resolve: (t: T) => void;
    reject: (R) => void;
}

let nextCorrelationId = 0;
let promises$ = new Map<number, CorrelatedPromise<any>>();
export function correlatedPromise<T>() {
    let correlationId = nextCorrelationId++;
    let resolve: (t: T) => void, reject: (R) => void;
    let execPromise$ = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });
    let corrPromise = { correlationId, execPromise$, resolve, reject };
    promises$.set(correlationId, corrPromise);
    return corrPromise;
}

export function completeCorrelatedPromise(message: JPMNativeExecResult) {
    if (message.error) promises$.get(message.correlationId)?.reject(message.error);
    else promises$.get(message.correlationId)?.resolve(message.result);
    promises$.delete(message.correlationId);
}
