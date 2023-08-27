import {
    BaseJayElement,
    ComponentCollectionProxyOperations,
    Coordinate, GlobalJayEvents,
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
    updateFunc, useContext
} from "jay-runtime";
import {
    IJayEndpoint,
    JPMMessage
} from "../comm-channel/comm-channel";
import {$JayNativeFunction} from "../main/function-repository-types";
import {
    completeCorrelatedPromise,
    correlatedPromise, NativeIdMarker
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
import {JSONPatch} from "jay-json-patch";
import {ArrayContexts} from "jay-serialization/dist/serialize/diff";
import {ManagedRef, ReferencesManager} from "jay-runtime/dist/references-manager";
import {
    EVENT_TRAP,
    GetTrapProxy
} from "jay-runtime";


export interface SandboxBridgeElement<ViewState> {
    update: updateFunc<ViewState>
    mount: MountFunc,
    unmount: MountFunc
    refs: Refs
}

// const proxyHandler = {
//     get: function(target: RefImplementation<any> | JayComponent<any, any, any>, prop, receiver) {
//         if (typeof prop === 'string') {
//             if (prop.indexOf("on") === 0) {
//                 let eventName = prop.substring(2);
//                 return (handler) => {
//                     target.addEventListener(eventName, handler);
//                 }
//             }
//             if (prop.indexOf("$on") === 0) {
//                 let eventName = prop.substring(3);
//                 return ($func) => {
//                     let regularHandler;
//                     const handler = ({event, viewState, coordinate}) => {
//                         if (regularHandler)
//                             regularHandler({event, viewState, coordinate});
//                     }
//                     target.addEventListener(eventName, handler,undefined,$func.id);
//                     return {
//                         then: (handler) => {
//                             regularHandler = handler;
//                         }
//                     }
//                 }
//             }
//         }
//         return target[prop];
//     }
// }

// export function proxyRef<ViewState>(refDef: StaticRefImplementation<ViewState> | DynamicRefImplementation<ViewState> | DynamicCompRefImplementation<ViewState, any>): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
//     return new Proxy(refDef, proxyHandler) as any as HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>;
// }
//
// export function proxyCompRef<A, B, C extends BaseJayElement<B>>(comp: JayComponent<A, B, C>): JayComponent<A, B, C> {
//     return new Proxy(comp, proxyHandler) as JayComponent<A, B, C>
// }

interface RefImplementation<ViewState> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: boolean | AddEventListenerOptions, nativeId?: string): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any>, options?: EventListenerOptions | boolean): void
    invoke: (type: string, coordinate: Coordinate, eventData?: any) => void
}

export interface SecureElementRef<ViewState, PublicRefAPI> {
    update: updateFunc<ViewState>,
    mount: MountFunc,
    unmount: MountFunc,
}


export function elemRef(refName: string): SecureElementRef<any, any> {
    let {viewState, endpoint, refs, dataIds} = useContext(SANDBOX_CREATION_CONTEXT)
    let coordinate = [...dataIds, refName]
    return refs.add(refName, new StaticRefImplementation(refName, endpoint, viewState, coordinate));
}

export function elemCollectionRef<ViewState, ElementType extends HTMLElement>(refName: string): () => SecureElementRef<ViewState, any> {
    let {endpoint, refs} = useContext(SANDBOX_CREATION_CONTEXT)
    let collRef = new DynamicRefImplementation<ViewState, ElementType>(refName, endpoint);
    refs.add(refName, collRef);
    return () => {
        let {viewState, endpoint, dataIds} = useContext(SANDBOX_CREATION_CONTEXT)
        let coordinate = [...dataIds, refName]
        let ref = new StaticRefImplementation<any, ElementType>(refName, endpoint, viewState, coordinate, collRef);
        collRef.addRef(ref)
        return ref;
    }
}

export class StaticRefImplementation<ViewState, ElementType extends HTMLElement> implements
    SecureElementRef<ViewState, HTMLElementProxy<ViewState, ElementType>>,
    HTMLElementProxyTarget<ViewState, ElementType>,
    RefImplementation<ViewState>,
    ManagedRef<HTMLElementProxy<ViewState, ElementType>> {
    listeners = new Map<string, JayEventHandler<any, any, any>>()

    constructor(
        private ref: string,
        private ep: IJayEndpoint,
        public viewState: ViewState,
        public readonly coordinate: Coordinate,
        private parentCollection?: DynamicRefImplementation<ViewState, ElementType>) {
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
        this.ep.post(nativeExec((handler as $JayNativeFunction<any, any, ResultType>).id, correlationId, this.ref, this.coordinate));
        return $execPromise;
    }
    update = (newViewState: ViewState) => {
        this.viewState = newViewState
    }

    mount(): void {
        this.parentCollection?.addRef(this)
    }

    unmount(): void {
        this.parentCollection?.removeRef(this)
    }

    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newSecureHTMLElementPublicApiProxy(this)
    };
}

const SECURE_EVENT$_TRAP = (target, prop) => {
    if (typeof prop === 'string') {
        if (prop.indexOf("$on") === 0) {
            let eventName = prop.substring(3);
            return (func$: NativeIdMarker) => {
                let regularHandler;
                const handler = ({event, viewState, coordinate}) => {
                    if (regularHandler)
                        regularHandler({event, viewState, coordinate});
                }
                target.addEventListener(eventName, handler, undefined, func$.id);
                return {
                    then: (handler) => {
                        regularHandler = handler;
                    }
                }
            }
        }
    }
    return false;
}

const SecureHTMLElementRefProxy = GetTrapProxy([EVENT_TRAP, SECURE_EVENT$_TRAP])

export function newSecureHTMLElementPublicApiProxy<ViewState, ElementType extends HTMLElement,
    Target extends StaticRefImplementation<ViewState, ElementType> | DynamicRefImplementation<ViewState, ElementType>>(
    ref: Target): Target & GlobalJayEvents<ViewState> {
    return new Proxy(ref, SecureHTMLElementRefProxy) as Target & GlobalJayEvents<ViewState>;
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

export class DynamicRefImplementation<ViewState, ElementType extends HTMLElement> implements
    HTMLElementCollectionProxyTarget<ViewState, ElementType>,
    RefImplementation<ViewState>,
    ManagedRef<HTMLElementCollectionProxy<ViewState, ElementType>>{

    listeners = new Map<string, JayEventHandler<any, any, any>>()
    items = new Map<string, StaticRefImplementation<ViewState, ElementType>>();

    constructor(
        private ref: string, private ep: IJayEndpoint) {
    }

    getPublicAPI(): HTMLElementCollectionProxy<ViewState, ElementType> {
        return newSecureHTMLElementPublicApiProxy(this)
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions, nativeId?: string): void {
        this.ep.post(addEventListenerMessage(this.ref, type, nativeId));
        this.listeners.set(type, listener)
    }
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
        this.ep.post(removeEventListenerMessage(this.ref, type));
        this.listeners.delete(type)
    }

    addRef(ref: StaticRefImplementation<ViewState, ElementType>) {
        let key = ref.coordinate.toString();
        if (!this.items.has(key)) {
            this.items.set(key, ref);
        }
    }

    removeRef(ref: StaticRefImplementation<ViewState, ElementType>) {
        this.items.delete(ref.coordinate.toString())
    }


    invoke = (type: string, coordinate: Coordinate, eventData?: any) => {
        let listener = this.listeners.get(type)
        if (listener) {
            let item = this.items.get(coordinate.toString())
            if (item)
                listener({
                    event: eventData,
                    viewState: item.viewState,
                    coordinate: item.coordinate
                })
        }
    }
    find(predicate: (t: ViewState, c: Coordinate) => boolean): HTMLElementProxy<ViewState, ElementType> | undefined {
        for (const [id, item] of this.items)
            if (predicate(item.viewState, item.coordinate)) {
                return item.getPublicAPI();
            }
    }
    map<ResultType>(handler: (element: HTMLElementProxy<ViewState, ElementType>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {
        let promises: Array<ResultType> = [];
        for (const [id, item] of this.items) {
            const handlerResponse = handler(item.getPublicAPI(), item.viewState, item.coordinate)
            if (handlerResponse)
                promises.push(handlerResponse)
        }
        return promises
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

    let refs = new ReferencesManager();
    let events = {}
    let port = endpoint.port;
    // dynamicComponents.forEach(compRef => refs[compRef] = proxyRef(new DynamicCompRefImplementation()))
    // dynamicElements.forEach(elemRef => refs[elemRef] = proxyRef(new DynamicRefImplementation(elemRef, endpoint)))
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
                        (refs.get(inMessage.coordinate.slice(-1)[0]) as StaticRefImplementation<ViewState, any>).invoke(inMessage.eventType, inMessage.coordinate, inMessage.eventData)
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

        return refs.applyToElement({
            dom: undefined,
            update,
            mount: () => {},
            unmount: () => {}
        })
    })
}