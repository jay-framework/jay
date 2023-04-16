import {
    Coordinate,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
    HTMLNativeExec,
    JayEventHandler,
    JayNativeFunction,
    MountFunc,
    normalizeUpdates,
    provideContext,
    updateFunc
} from "jay-runtime";
import {Reactive} from "jay-reactive";
import {
    addEventListenerMessage,
    JayEndpoint,
    JayPortMessageType,
    JPMMessage,
    nativeExec,
    removeEventListenerMessage,
    renderMessage
} from "../comm-channel";
import {$JayNativeFunction} from "../main/function-repository-types";
import {correlatedPromise, rejectCorrelatedPromise, resolveCorrelatedPromise} from "../$func";
import {Refs, SANDBOX_CREATION_CONTEXT} from "./sandbox-context";
import {SandboxElement} from "./sandbox-element";


export interface SandboxBridgeElement<ViewState> {
    dom: undefined,
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

const proxyHandler = {
    get: function(target: RefImplementation<any>, prop, receiver) {
        if (typeof prop === 'string') {
            if (prop.indexOf("on") === 0) {
                let eventName = prop.substring(2);
                return (handler) => {
                    target.addEventListener(eventName, handler);
                }
            }
            if (prop.indexOf("$on") === 0) {
                let eventName = prop.substring(3);
                return ($func) => {
                    let regularHandler;
                    const handler = ({event, viewState, coordinate}) => {
                        if (regularHandler)
                            regularHandler({event, viewState, coordinate});
                    }
                    target.addEventListener(eventName, handler,undefined,$func.id);
                    return {
                        then: (handler) => {
                            regularHandler = handler;
                        }
                    }
                }
            }
        }
        return target[prop];
    }
}

export function proxyRef<ViewState>(refDef: StaticRefImplementation<ViewState> | DynamicRefImplementation<ViewState>): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
    return new Proxy(refDef, proxyHandler) as any as HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>;
}

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: boolean | AddEventListenerOptions, nativeId?: string): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: EventListenerOptions | boolean): void
    invoke: (type: string, coordinate: Coordinate, eventData?: any) => void
    update(newViewState: ViewState)
}

export class StaticRefImplementation<ViewState> implements HTMLElementProxyTarget<ViewState, any>, RefImplementation<ViewState>{
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string, private ep: JayEndpoint, private viewState: ViewState) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: boolean | AddEventListenerOptions, nativeId?: string): void {
        this.ep.post(addEventListenerMessage(this.ref, type, nativeId));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {
        let listener = this.listeners.get(type)
        if (listener)
            listener({
                event: eventData,
                viewState: this.viewState,
                coordinate: coordinate
            })
    }
    $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
        let {$execPromise, correlationId} = correlatedPromise<ResultType>();
        this.ep.post(nativeExec(this.ref, (handler as $JayNativeFunction<any, any, ResultType>).id, correlationId, [this.ref]));
        return $execPromise;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState
    }
}

class DynamicNativeExec<ViewState> implements HTMLNativeExec<ViewState, any>{
    constructor(private ref: string, private coordinate: Coordinate, private ep: JayEndpoint) {
    }

    $exec<ResultType>(handler: JayNativeFunction<any, ViewState, ResultType>): Promise<ResultType> {
        let {$execPromise, correlationId} = correlatedPromise<ResultType>();
        this.ep.post(nativeExec(this.ref, (handler as $JayNativeFunction<any, any, ResultType>).id, correlationId, this.coordinate));
        return $execPromise;
    }
}

export class DynamicRefImplementation<ViewState> implements HTMLElementCollectionProxyTarget<ViewState, any>, RefImplementation<ViewState> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()
    items = new Map<string, [string[], ViewState]>();

    constructor(
        private ref: string, private ep: JayEndpoint) {
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions, nativeId?: string): void {
        this.ep.post(addEventListenerMessage(this.ref, type, nativeId));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {
        let listener = this.listeners.get(type)
        if (listener) {
            let coordinateAndItem = this.items.get(coordinate.slice(0, -1).toString())
            listener({
                event: eventData,
                viewState: coordinateAndItem?coordinateAndItem[1]:undefined,
                coordinate: coordinate
            })
        }
    }
    find(predicate: (t: ViewState) => boolean): HTMLNativeExec<ViewState, any> | undefined {
        for (const [id, item] of this.items)
            if (predicate(item[1])) {
                const coordinate = [...item[0], this.ref];
                return new DynamicNativeExec(this.ref, coordinate, this.ep);
            }
    }
    map<ResultType>(handler: (element: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {
        let promises: Array<ResultType> = [];
        for (const [id, item] of this.items) {
            const coordinate = [...item[0], this.ref];
            const nativeExec = new DynamicNativeExec<ViewState>(this.ref, coordinate, this.ep);
            const handlerResponse = handler(nativeExec, item[1], coordinate)
            if (handlerResponse)
                promises.push(handlerResponse)
        }
        return promises
    }
    update(newViewState: ViewState) {
        console.log(newViewState);
    }

    setItem(dataIds: string[], viewState: ViewState) {
        this.items.set(dataIds.toString(), [dataIds, viewState])
    }

    removeItem(dataIds: string[]) {
        this.items.delete(dataIds.toString())
    }
}

export function mkBridgeElement<ViewState>(viewState: ViewState,
                                           endpoint: JayEndpoint,
                                           reactive: Reactive,
                                           sandboxElements: () => SandboxElement<ViewState>[]): SandboxBridgeElement<ViewState> {
    let refs = {};
    return provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, viewState, refs, dataIds: [], isDynamic: false}, () => {
        let elements = sandboxElements();
        let postUpdateMessage = (newViewState) => endpoint.post(renderMessage(newViewState))
        let update = normalizeUpdates([postUpdateMessage, ...elements.map(el => el.update)]);

        endpoint.onUpdate((inMessage: JPMMessage) => {
            switch (inMessage.type) {
                case JayPortMessageType.DOMEvent: {
                    reactive.batchReactions(() => {
                        refs[inMessage.coordinate.slice(-1)[0]].invoke(inMessage.eventType, inMessage.coordinate, inMessage.eventData)
                    })
                    break;
                }
                case JayPortMessageType.nativeExecResult: {
                    reactive.batchReactions(() => {
                        if (inMessage.error)
                            rejectCorrelatedPromise(inMessage.correlationId, new Error(inMessage.error))
                        else
                            resolveCorrelatedPromise(inMessage.correlationId, inMessage.result)
                    })

                }
            }
        })

        return {
            dom: undefined,
            refs,
            update,
            mount: () => {},
            unmount: () => {}
        }
    })
}