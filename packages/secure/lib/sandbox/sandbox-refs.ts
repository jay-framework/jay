import {
    ComponentCollectionProxyOperations,
    Coordinate,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
    HTMLNativeExec, JayComponent,
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
    JayEndpoint, JayPort,
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

export function proxyRef<ViewState>(refDef: StaticRefImplementation<ViewState> | DynamicRefImplementation<ViewState> | DynamicCompRefImplementation<ViewState, any>): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
    return new Proxy(refDef, proxyHandler) as any as HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>;
}

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: boolean | AddEventListenerOptions, nativeId?: string): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: EventListenerOptions | boolean): void
    invoke: (type: string, coordinate: Coordinate, eventData?: any) => void
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

export class DynamicNativeExec<ViewState> implements HTMLNativeExec<ViewState, any>{
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
    items = new Map<string, [string[], ViewState, DynamicNativeExec<ViewState>]>();

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
            let coordinateAndItem = this.items.get(coordinate.toString())
            listener({
                event: eventData,
                viewState: coordinateAndItem?coordinateAndItem[1]:undefined,
                coordinate: coordinate
            })
        }
    }
    find(predicate: (t: ViewState) => boolean): DynamicNativeExec<ViewState> | undefined {
        for (const [id, [coordinate, vs, refItem]] of this.items)
            if (predicate(vs)) {
                return refItem;
            }
    }
    map<ResultType>(handler: (element: DynamicNativeExec<ViewState>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {
        let promises: Array<ResultType> = [];
        for (const [id, [coordinate, vs, refItem]] of this.items) {
            const handlerResponse = handler(refItem, vs, coordinate)
            if (handlerResponse)
                promises.push(handlerResponse)
        }
        return promises
    }

    setItem(coordinate: string[], viewState: ViewState, refItem: DynamicNativeExec<ViewState>) {
        this.items.set(coordinate.toString(), [coordinate, viewState, refItem])
    }

    removeItem(coordinate: string[]) {
        this.items.delete(coordinate.toString())
    }
}

export class DynamicCompRefImplementation<ViewState, CompType extends JayComponent<any, any, any>>
    implements ComponentCollectionProxyOperations<ViewState, CompType>, RefImplementation<ViewState> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()
    items = new Map<string, [string[], ViewState, CompType]>();

    constructor() {}

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions, nativeId?: string): void {
        this.listeners.set(type, listener)
        for (const [id, [coordinate, vs, comp]] of this.items)
            comp.addEventListener(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.listeners.delete(type)
        for (const [id, [coordinate, vs, comp]] of this.items)
            comp.removeEventListener(type, listener)
    }

    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {}

    find = (predicate: (t: ViewState) => boolean): CompType | undefined => {
        for (const [id, [coordinate, vs, comp]] of this.items)
            if (predicate(vs)) {
                return comp;
            }
    }
    map = <ResultType>(handler: (element: CompType, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> => {
        let promises: Array<ResultType> = [];
        for (const [id, [coordinate, vs, comp]] of this.items) {
            const handlerResponse = handler(comp, vs, coordinate)
            if (handlerResponse)
                promises.push(handlerResponse)
        }
        return promises
    }

    update(coordinate: string[], viewState: ViewState) {
        this.items.get(coordinate.toString())[1] = viewState;
    }

    setItem(coordinate: string[], viewState: ViewState, refItem: CompType) {
        this.items.set(coordinate.toString(), [coordinate, viewState, refItem])
        this.listeners.forEach((listener, type) => refItem.addEventListener(type, listener));

    }

    removeItem(coordinate: string[], refItem: CompType) {
        this.items.delete(coordinate.toString())
        this.listeners.forEach((listener, type) => refItem.removeEventListener(type, listener));
    }
}

export function mkBridgeElement<ViewState>(viewState: ViewState,
                                           port: JayPort,
                                           endpoint: JayEndpoint,
                                           reactive: Reactive,
                                           sandboxElements: () => SandboxElement<ViewState>[],
                                           dynamicElements: string[] = [], dynamicComponents: string[] = []): SandboxBridgeElement<ViewState> {
    let refs = {};
    dynamicComponents.forEach(compRef => refs[compRef] = proxyRef(new DynamicCompRefImplementation()))
    dynamicElements.forEach(elemRef => refs[elemRef] = proxyRef(new DynamicRefImplementation(elemRef, endpoint)))
    return provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, port, viewState, refs, dataIds: [], isDynamic: false}, () => {
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