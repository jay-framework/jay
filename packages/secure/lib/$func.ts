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

interface CorrelatedPromise<T> {
    correlationId: number,
    $execPromise: Promise<T>,
    resolve: (t: T) => void,
    reject: (R) => void
}

let nextCorrelationId = 0;
let $promises = new Map<number, CorrelatedPromise<any>>();
export function correlatedPromise<T>() {
    let correlationId = nextCorrelationId++;
    let resolve: (t: T) => void,
        reject: (R) => void;
    let $execPromise = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    })
    let corrPromise = {correlationId, $execPromise, resolve, reject};
    $promises.set(correlationId, corrPromise)
    return corrPromise
}

export function resolveCorrelatedPromise(correlationId: number, value: any) {
    $promises.get(correlationId)?.resolve(value)
    $promises.delete(correlationId)
}

export function rejectCorrelatedPromise(correlationId: number, error: Error) {
    $promises.get(correlationId)?.reject(error)
    $promises.delete(correlationId)
}