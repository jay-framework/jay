import {
    BaseJayElement,
    JayElement,
    JayEventHandler,
    updateFunc,
    JayComponent,
    JayEvent,
    Coordinate, MountFunc
} from "./element-types";
import {JayEventHandlerWrapper} from "./element-types";
import {ConstructContext, currentConstructionContext} from "./context";
import {
    GlobalJayEvents, HTMLElementCollectionProxy,
    HTMLElementCollectionProxyTarget, HTMLElementProxy,
    HTMLElementProxyTarget,
    HTMLNativeExec
} from "./node-reference-types";

export interface PublicRef {

}

export interface ManagedRef {
    getPublicAPI(): PublicRef;
}

export interface ManagedCollectionRef<ViewState> extends ManagedRef {
    addRef(ref: PrivateRef<ViewState>)
    removeRef(ref: PrivateRef<ViewState>)
}

export interface PrivateRef<ViewState> {
    update: updateFunc<ViewState>,
    mount: MountFunc,
    unmount: MountFunc,
    viewState: ViewState,
    coordinate: Coordinate,
    getPublicAPI(): any;
    set(referenced: HTMLElement | JayComponent<any, ViewState, any>): void;
}

interface Ref<ViewState> extends HTMLNativeExec<ViewState, any> {
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void
    viewState: ViewState
    coordinate: Coordinate
}

interface RefCollection<ViewState>{
    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void
    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void
    addRef(ref: Ref<ViewState>)
    removeRef(ref: Ref<ViewState>)
}

function defaultEventWrapper<EventType, ViewState, Returns>(
  orig: JayEventHandler<EventType, ViewState, Returns>,
  event: JayEvent<EventType, ViewState>): Returns {
  return orig(event)
}
export class ReferencesManager {
    private refs: Record<string, ManagedRef> = {};
    // private refCollections: Record<string, RefCollection<any>> = {};

    constructor(
                public readonly eventWrapper: JayEventHandlerWrapper<any, any, any> = defaultEventWrapper) {
        // dynamicRefs?.forEach(id => this.refCollections[id] = new ReferenceCollection())
    }

    add<Ref extends ManagedRef>(refName: string, ref: Ref): Ref {
        return this.refs[refName] = ref;
    }

    get(refName: string): ManagedRef {
        return this.refs[refName];
    }


    /**
     * @deprecated
     */
    mkRef<ViewState>(referenced: HTMLElement | JayComponent<any, any, any>,
                     context: ConstructContext<any>,
                     refName: string,
                     isComp: boolean): [Ref<ViewState>, updateFunc<ViewState>] {
        if (isComp) {
            return ComponentRef(referenced as JayComponent<any, any, any>, context.currData, context.coordinate(refName), this.eventWrapper)
        }
        else {
            let ref = new HTMLElementRefImpl(referenced as HTMLElement, context.currData, context.coordinate(refName), this.eventWrapper)
            return [ref, ref.update]
        }
    }

    /**
     * @deprecated
     */
    getRefCollection(id: string, autoCreate: boolean = false): RefCollection<any> {
        if (!this.refCollections[id] && autoCreate)
            this.refCollections[id] = new ReferenceCollection();
        return this.refCollections[id];
    }

    /**
     * @deprecated
     */
    addStaticRef(id: string, ref: Ref<any>) {
        this.refs[id] = ref;
    }

    /**
     * @deprecated
     */
    addDynamicRef(id: string, ref: Ref<any>) {
        this.getRefCollection(id, true).addRef(ref);
    }

    /**
     * @deprecated
     */
    removeDynamicRef(id: string, ref: Ref<any>) {
        this.refCollections[id]?.removeRef(ref);
    }

    applyToElement<T, Refs>(element:BaseJayElement<T>): JayElement<T, Refs> {
        let enrichedDynamicRefs = Object.keys(this.refs).reduce((publicRefAPIs, key) => {
            publicRefAPIs[key] = this.refs[key].getPublicAPI();
            return publicRefAPIs;
        }, {})
        let refs = enrichedDynamicRefs as Refs
        return {...element, refs};
    }
}

class ReferenceCollection<ViewState> implements RefCollection<ViewState>, HTMLElementCollectionProxyTarget<ViewState, any>{
    protected elements: Set<Ref<ViewState>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.elements.forEach(ref =>
          ref.addEventListener(type, listener, options))
    }

    addRef(ref: Ref<ViewState>) {
        this.elements.add(ref);
        this.listeners.forEach(listener =>
          ref.addEventListener(listener.type, listener.listener, listener.options))
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.elements.forEach(ref =>
          ref.removeEventListener(type, listener, options))
    }

    removeRef(ref: Ref<ViewState>) {
        this.elements.delete(ref);
        this.listeners.forEach(listener =>
          ref.removeEventListener(listener.type, listener.listener, listener.options))
    }

    map<ResultType>(handler: (referenced: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {
        return [...this.elements].map(ref => handler(ref, ref.viewState, ref.coordinate));
    }

    find(predicate: (viewState: ViewState, c: Coordinate) => boolean) {
        for (let ref of this.elements)
            if (predicate(ref.viewState, ref.coordinate))
                return ref
    }

}

export function ComponentRef<ViewState>(comp: JayComponent<any, any, any>, viewState: ViewState, coordinate: Coordinate, eventWrapper: JayEventHandlerWrapper<any, ViewState, any>): [Ref<ViewState>, updateFunc<ViewState>] {
    let ref = new Proxy(comp, {
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
    }) as any as Ref<ViewState>;
    let update = (vs: ViewState) => {
        viewState = vs;
    }
    return [ref, update];
}




export function elemCollectionRef<ViewState, ElementType extends HTMLElement>(refName: string): () => PrivateRef<ViewState> {
    let {refManager} = currentConstructionContext();
    let collRef = new HTMLElementCollectionRefImpl<ViewState, ElementType>()
    refManager.add(refName, collRef);
    return () => {
        let {currData, coordinate, refManager} = currentConstructionContext();
        let ref = new HTMLElementRefImpl<ViewState, ElementType>(currData, coordinate(refName), refManager.eventWrapper);
        collRef.addRef(ref)
        return ref;
    }
}

export function elemRef(refName: string): PrivateRef<any> {
    let {currData, coordinate, refManager} = currentConstructionContext();
    return refManager.add(refName, new HTMLElementRefImpl(currData, coordinate(refName), refManager.eventWrapper));
}

class HTMLElementCollectionRefImpl<ViewState, ElementType extends HTMLElement> implements ManagedCollectionRef<ViewState>, HTMLElementCollectionProxyTarget<ViewState, any>{
    protected elements: Set<HTMLElementRefImpl<ViewState, ElementType>> = new Set();
    private listeners = [];

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        this.listeners.push({type, listener, options})
        this.elements.forEach(ref =>
            ref.addEventListener(type, listener, options))
    }

    addRef(ref: HTMLElementRefImpl<ViewState, ElementType>) {
        this.elements.add(ref);
        this.listeners.forEach(listener =>
            ref.addEventListener(listener.type, listener.listener, listener.options))
    }

    removeRef(ref: HTMLElementRefImpl<ViewState, ElementType>) {
        this.elements.delete(ref);
        this.listeners.forEach(listener =>
            ref.removeEventListener(listener.type, listener.listener, listener.options))
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void {
        this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener);
        this.elements.forEach(ref =>
            ref.removeEventListener(type, listener, options))
    }

    map<ResultType>(handler: (referenced: HTMLNativeExec<ViewState, any>, viewState: ViewState, coordinate: Coordinate) => ResultType): Array<ResultType> {
        return [...this.elements].map(ref => handler(ref, ref.viewState, ref.coordinate));
    }

    find(predicate: (viewState: ViewState, c: Coordinate) => boolean) {
        for (let ref of this.elements)
            if (predicate(ref.viewState, ref.coordinate))
                return ref
    }

    getPublicAPI(): HTMLElementCollectionProxy<ViewState, ElementType> {
        return newReferenceProxy<ViewState, HTMLElementCollectionProxyTarget<ViewState, ElementType>>(this)
    }
}

export class HTMLElementRefImpl<ViewState, ElementType extends HTMLElement> implements PrivateRef<ViewState>, HTMLElementProxyTarget<ViewState, any>{
    private listeners = [];
    private element: ElementType;

    constructor(
        public viewState: ViewState,
        public coordinate: Coordinate,
        private eventWrapper: JayEventHandlerWrapper<any, ViewState, any>,
        private parentCollection?: HTMLElementCollectionRefImpl<ViewState, ElementType>) {
        this.viewState = viewState
    }

    set(referenced: ElementType | JayComponent<any, ViewState, any>): void {
        this.element = referenced as ElementType;
        this.listeners.forEach(({type, wrappedHandler, options}) =>
            this.element.addEventListener(type, wrappedHandler, options))
    }

    mount = () => {
        this.parentCollection?.addRef(this)
    }
    unmount = () => {
        this.parentCollection?.removeRef(this)
    }

    addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: boolean | AddEventListenerOptions): void {
        let wrappedHandler = (event) => {
            return this.eventWrapper(listener, {event, viewState: this.viewState, coordinate: this.coordinate});
        }
        this.element?.addEventListener(type, wrappedHandler, options)
        this.listeners.push({type, listener, wrappedHandler, options})
    }

    removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, ViewState, any>, options?: EventListenerOptions | boolean): void {
        let index = this.listeners.findIndex(item => item.type === type && item.listener === listener)
        if (index > -1) {
            let item = this.listeners[index];
            this.listeners.splice(index, 1)
            this.element?.removeEventListener(type, item.wrappedHandler, options)
        }
    }

    update = (newData: ViewState) => {
        this.viewState = newData;
    }

    $exec<T>(handler: (elem: ElementType, viewState: ViewState) => T): Promise<T> {
        return new Promise((resolve, reject) => {
            try {
                resolve(handler(this.element, this.viewState));
            }
            catch (e) {
                reject(e);
            }
        })
    }

    getPublicAPI(): HTMLElementProxy<ViewState, ElementType> {
        return newReferenceProxy<ViewState, HTMLElementProxyTarget<ViewState, ElementType>>(this)
    }
}

const HTMLElementRefProxy = {
    get: function(target, prop, receiver) {
        if (typeof prop === 'string') {
            if (prop.indexOf("on") === 0) {
                let eventName = prop.substring(2);
                return (handler) => {
                    target.addEventListener(eventName, handler);
                }
            }
            if (prop.indexOf("$on") === 0) {
                let eventName = prop.substring(3);
                return (nativeHandler) => {
                    let regularHandler;
                    const handler = ({event, viewState, coordinate}) => {
                        const returnedEvent = nativeHandler({event, viewState, coordinate});
                        if (regularHandler)
                            regularHandler({event: returnedEvent, viewState, coordinate});
                    }
                    target.addEventListener(eventName, handler);
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
export function newReferenceProxy<ViewState, T>(ref: T): T & GlobalJayEvents<ViewState> {
    return new Proxy(ref, HTMLElementRefProxy);
}
