import {
    BaseJayElement,
    ComponentCollectionProxyOperations,
    Coordinate,
    HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget,
    HTMLElementProxy,
    HTMLElementProxyTarget,
    HTMLNativeExec,
    JayComponent, JayEvent,
    JayEventHandler, JayEventHandlerWrapper,
    JayNativeFunction,
    MountFunc,
    normalizeUpdates,
    provideContext,
    updateFunc
} from "jay-runtime";
import {
    IJayEndpoint,
    JPMMessage
} from "../comm-channel/comm-channel";
import {$JayNativeFunction} from "../main/function-repository-types";
import {
    completeCorrelatedPromise,
    correlatedPromise
} from "../$func";
import {Refs, SANDBOX_CREATION_CONTEXT} from "./sandbox-context";
import {SandboxElement} from "./sandbox-element";
import {Reactive} from "jay-reactive";
import {serialize} from "jay-serialization";
import {
    addEventListenerMessage,
    eventInvocationMessage, JayPortMessageType, JPMRootAPIInvoke,
    nativeExec,
    removeEventListenerMessage, renderMessage,
    rootApiReturns
} from "../comm-channel/messages";
import {JSONPatch} from "jay-mutable-contract";
import {ArrayContexts} from "jay-serialization/dist/serialize/diff";


export interface SandboxBridgeElement<ViewState> {
    dom: undefined,
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

const proxyHandler = {
    get: function(target: RefImplementation<any> | JayComponent<any, any, any>, prop, receiver) {
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

export function proxyCompRef<A, B, C extends BaseJayElement<B>>(comp: JayComponent<A, B, C>): JayComponent<A, B, C> {
    return new Proxy(comp, proxyHandler) as JayComponent<A, B, C>
}

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: boolean | AddEventListenerOptions, nativeId?: string): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: EventListenerOptions | boolean): void
    invoke: (type: string, coordinate: Coordinate, eventData?: any) => void
}

export class StaticRefImplementation<ViewState> implements HTMLElementProxyTarget<ViewState, any>, RefImplementation<ViewState>{
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string, private ep: IJayEndpoint, private viewState: ViewState) {
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
        this.ep.post(nativeExec((handler as $JayNativeFunction<any, any, ResultType>).id, correlationId, this.ref, [this.ref]));
        return $execPromise;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState
    }
}

export class DynamicNativeExec<ViewState> implements HTMLNativeExec<ViewState, any>{
    constructor(private ref: string, private coordinate: Coordinate, private ep: IJayEndpoint) {
    }

    $exec<ResultType>(handler: JayNativeFunction<any, ViewState, ResultType>): Promise<ResultType> {
        let {$execPromise, correlationId} = correlatedPromise<ResultType>();
        this.ep.post(nativeExec((handler as $JayNativeFunction<any, any, ResultType>).id, correlationId, this.ref, this.coordinate));
        return $execPromise;
    }
}

export class DynamicRefImplementation<ViewState> implements HTMLElementCollectionProxyTarget<ViewState, any>, RefImplementation<ViewState> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()
    items = new Map<string, [string[], ViewState, DynamicNativeExec<ViewState>]>();

    constructor(
        private ref: string, private ep: IJayEndpoint) {
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
    find(predicate: (t: ViewState, c: Coordinate) => boolean): DynamicNativeExec<ViewState> | undefined {
        for (const [id, [coordinate, vs, refItem]] of this.items)
            if (predicate(vs, coordinate)) {
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

export function componentWrapper<Comp extends JayComponent<any, any, any>, ViewState>(comp: Comp, viewState: ViewState, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, ViewState, any>): [Comp, updateFunc<ViewState>] {
    let compWrapper = new Proxy(comp, {
        get: function(target, prop, receiver) {
            if (typeof prop === 'string') {
                if (prop === 'addEventListener') {
                    return (eventName, handler) => {
                        target.addEventListener(eventName, ({event}) => {
                            return eventWrapper(handler, {event, viewState, coordinate})
                        });
                    }
                }
                if (prop === 'viewState')
                    return viewState
                if (prop === 'coordinate')
                    return coordinate
            }
            return target[prop];
        }
    }) as any as Comp;
    let update = (vs: ViewState) => {
        viewState = vs;
    }
    return [compWrapper, update];
}


export function mkBridgeElement<ViewState>(viewState: ViewState,
                                           sandboxElements: () => SandboxElement<ViewState>[],
                                           dynamicElements: string[] = [],
                                           dynamicComponents: string[] = [],
                                           endpoint: IJayEndpoint,
                                           reactive: Reactive,
                                           getComponentInstance: () => JayComponent<any, any, any>,
                                           arraySerializationContext: ArrayContexts): SandboxBridgeElement<ViewState> {

    let refs = {};
    let events = {}
    let port = endpoint.port;
    dynamicComponents.forEach(compRef => refs[compRef] = proxyRef(new DynamicCompRefImplementation()))
    dynamicElements.forEach(elemRef => refs[elemRef] = proxyRef(new DynamicRefImplementation(elemRef, endpoint)))
    return provideContext(SANDBOX_CREATION_CONTEXT, {endpoint, viewState, refs, dataIds: [], isDynamic: false, parentComponentReactive: reactive}, () => {
        let elements = sandboxElements();
        let patch: JSONPatch, nextSerialize = serialize; // TODO add diff context
        let postUpdateMessage = (newViewState) => {
            [patch, nextSerialize] = nextSerialize(newViewState, arraySerializationContext);
            if (patch.length)
                endpoint.post(renderMessage(patch))
        }
        let update = normalizeUpdates([postUpdateMessage, ...elements.map(el => el.update)]);

        endpoint.onUpdate(async (inMessage: JPMMessage) => {
            switch (inMessage.type) {
                case JayPortMessageType.eventInvocation: {
                    reactive.batchReactions(() => {
                        refs[inMessage.coordinate.slice(-1)[0]].invoke(inMessage.eventType, inMessage.coordinate, inMessage.eventData)
                    })
                    break;
                }
                case JayPortMessageType.nativeExecResult: {
                    reactive.batchReactions(() => {
                        completeCorrelatedPromise(inMessage)
                    })
                    break;
                }
                case JayPortMessageType.rootApiInvoke: {
                    let message = inMessage as JPMRootAPIInvoke;
                    let returns, error
                    try {
                        returns = await getComponentInstance()[message.apiName](message.params);
                    }
                    catch (err) {
                        error = err;
                    }
                    port.batch(() => {
                        endpoint.post(rootApiReturns(message.callId, returns, error))
                    })
                    break;
                }
                case JayPortMessageType.addEventListener: {
                    let handler = ({event, viewState, coordinate}: JayEvent<any, any>) => {
                        port.batch(() => {
                            endpoint.post(eventInvocationMessage(inMessage.eventType, coordinate, event))
                        })
                    }
                    events[inMessage.eventType] = handler;
                    getComponentInstance().addEventListener(inMessage.eventType, handler)
                    break;
                }
                case JayPortMessageType.removeEventListener: {
                    getComponentInstance().removeEventListener(inMessage.eventType, events[inMessage.eventType]);
                    delete events[inMessage.eventType]
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